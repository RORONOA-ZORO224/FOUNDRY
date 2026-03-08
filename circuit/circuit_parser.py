import re
from collections import defaultdict

class CircuitParser:
    """Parse Verilog and extract gate-level components."""
    
    def parse(self, verilog_code):
        """Extract gates, flip-flops, and connections."""
        
        components = []
        connections = []
        component_id = 0
        
        # Extract module ports
        inputs = self._extract_ports(verilog_code, 'input')
        outputs = self._extract_ports(verilog_code, 'output')
        
        # Add input components
        for inp in inputs:
            components.append({
                'id': f'input_{inp["name"]}',
                'type': 'input',
                'label': inp['name'],
                'width': inp['width'],
                'x': 50,
                'y': 100 + len(components) * 80
            })
        
        # Add output components
        for out in outputs:
            components.append({
                'id': f'output_{out["name"]}',
                'type': 'output',
                'label': out['name'],
                'width': out['width'],
                'x': 800,
                'y': 100 + len(components) * 80
            })
        
        # Parse always blocks for flip-flops
        ff_matches = re.finditer(
            r'always\s*@\s*\(posedge\s+(\w+)(?:\s+or\s+(?:posedge|negedge)\s+(\w+))?\)\s*begin(.*?)end',
            verilog_code,
            re.DOTALL
        )
        
        for ff_match in ff_matches:
            clk = ff_match.group(1)
            rst = ff_match.group(2)
            body = ff_match.group(3)
            
            # Find what signals are assigned (these become flip-flop outputs)
            assignments = re.findall(r'(\w+)\s*<=', body)
            
            for signal in set(assignments):
                component_id += 1
                components.append({
                    'id': f'dff_{component_id}',
                    'type': 'dff',
                    'label': f'D-FF\n{signal}',
                    'output': signal,
                    'clock': clk,
                    'reset': rst,
                    'x': 300,
                    'y': 100 + component_id * 100
                })
        
        # Parse assign statements for gates
        assigns = re.finditer(r'assign\s+(\w+)\s*=\s*(.+?);', verilog_code)
        
        for assign in assigns:
            target = assign.group(1)
            expr = assign.group(2).strip()
            
            # Detect gate type from expression
            gate_type, gate_label = self._detect_gate_type(expr)
            
            component_id += 1
            components.append({
                'id': f'gate_{component_id}',
                'type': gate_type,
                'label': gate_label,
                'output': target,
                'expression': expr,
                'x': 450,
                'y': 100 + component_id * 80
            })
            
            # Extract inputs to this gate
            inputs_to_gate = re.findall(r'\b([a-zA-Z_]\w*)\b', expr)
            for inp in inputs_to_gate:
                if inp != target and inp not in ['and', 'or', 'xor', 'not']:
                    connections.append({
                        'from': self._find_component_for_signal(components, inp),
                        'to': f'gate_{component_id}',
                        'signal': inp
                    })
            
            # Connect gate output to final output if it exists
            for out in outputs:
                if out['name'] == target:
                    connections.append({
                        'from': f'gate_{component_id}',
                        'to': f'output_{target}',
                        'signal': target
                    })
        
        # Auto-layout using simple algorithm
        components = self._auto_layout(components, connections)
        
        return {
            'components': components,
            'connections': connections,
            'metadata': {
                'num_gates': len([c for c in components if 'gate' in c['type']]),
                'num_ffs': len([c for c in components if c['type'] == 'dff']),
                'num_inputs': len(inputs),
                'num_outputs': len(outputs)
            }
        }
    
    def _extract_ports(self, code, port_type):
        """Extract ports."""
        ports = []
        pattern = rf'{port_type}\s+(?:\[(\d+):(\d+)\]\s+)?(\w+)'
        for match in re.finditer(pattern, code):
            width = 1
            if match.group(1) and match.group(2):
                width = int(match.group(1)) - int(match.group(2)) + 1
            ports.append({'name': match.group(3), 'width': width})
        return ports
    
    def _detect_gate_type(self, expr):
        """Detect gate type from expression."""
        expr_lower = expr.lower()
        
        if '&' in expr:
            return 'and_gate', 'AND'
        elif '|' in expr:
            return 'or_gate', 'OR'
        elif '^' in expr:
            return 'xor_gate', 'XOR'
        elif '~' in expr:
            return 'not_gate', 'NOT'
        elif '+' in expr:
            return 'adder', 'ADD'
        elif '?' in expr or 'case' in expr_lower:
            return 'mux', 'MUX'
        elif '==' in expr or '!=' in expr:
            return 'comparator', 'CMP'
        else:
            return 'logic', 'LOGIC'
    
    def _find_component_for_signal(self, components, signal):
        """Find which component outputs this signal."""
        for comp in components:
            if comp['id'] == f'input_{signal}':
                return comp['id']
            if 'output' in comp and comp['output'] == signal:
                return comp['id']
        return f'input_{signal}'  # Default to input
    
    def _auto_layout(self, components, connections):
        """Simple auto-layout algorithm."""
        # Group by type
        inputs = [c for c in components if c['type'] == 'input']
        outputs = [c for c in components if c['type'] == 'output']
        gates = [c for c in components if 'gate' in c['type']]
        ffs = [c for c in components if c['type'] == 'dff']
        
        # Layout inputs on left
        for i, comp in enumerate(inputs):
            comp['x'] = 100
            comp['y'] = 100 + i * 80
        
        # Layout flip-flops in middle-left
        for i, comp in enumerate(ffs):
            comp['x'] = 300
            comp['y'] = 100 + i * 100
        
        # Layout gates in middle
        for i, comp in enumerate(gates):
            comp['x'] = 500
            comp['y'] = 100 + i * 80
        
        # Layout outputs on right
        for i, comp in enumerate(outputs):
            comp['x'] = 800
            comp['y'] = 100 + i * 80
        
        return components

@app.route('/circuit', methods=['POST'])
def generate_circuit():
    """Generate circuit diagram."""
    print(f"\n🎨 CIRCUIT DIAGRAM REQUEST")
    try:
        from circuit.circuit_parser import CircuitParser
        
        data = request.json
        verilog_code = data.get('verilog_code', '')
        
        if not verilog_code:
            return jsonify({'success': False, 'error': 'No code'}), 400
        
        parser = CircuitParser()
        circuit = parser.parse(verilog_code)
        print(f"✅ Circuit: {circuit['metadata']['num_gates']} gates, {circuit['metadata']['num_ffs']} FFs\n")
        
        return jsonify({'success': True, 'circuit': circuit})
    except Exception as e:
        print(f"❌ Circuit failed: {e}\n")
        return jsonify({'success': False, 'error': str(e)}), 500
