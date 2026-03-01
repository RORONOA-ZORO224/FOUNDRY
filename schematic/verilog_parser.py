import re

class VerilogParser:
    """Parse Verilog to extract structural information."""
    
    def parse(self, verilog_code):
        """Parse Verilog and return schematic data."""
        nodes = []
        edges = []
        
        # Extract module name
        module_match = re.search(r'module\s+(\w+)', verilog_code)
        module_name = module_match.group(1) if module_match else 'top'
        
        # Extract ports
        inputs = self._extract_ports(verilog_code, 'input')
        outputs = self._extract_ports(verilog_code, 'output')
        
        # Add input nodes
        for inp in inputs:
            nodes.append({
                'id': inp['name'],
                'label': inp['name'],
                'type': 'input',
                'width': inp.get('width', 1)
            })
        
        # Add output nodes
        for out in outputs:
            nodes.append({
                'id': out['name'],
                'label': out['name'],
                'type': 'output',
                'width': out.get('width', 1)
            })
        
        # Extract internal signals
        wires = self._extract_signals(verilog_code, 'wire')
        regs = self._extract_signals(verilog_code, 'reg')
        
        for wire in wires:
            nodes.append({
                'id': wire['name'],
                'label': wire['name'],
                'type': 'wire',
                'width': wire.get('width', 1)
            })
        
        for reg in regs:
            nodes.append({
                'id': reg['name'],
                'label': reg['name'],
                'type': 'register',
                'width': reg.get('width', 1)
            })
        
        # Extract assign statements
        assigns = re.finditer(r'assign\s+(\w+)\s*=\s*(.+?);', verilog_code, re.DOTALL)
        for idx, assign in enumerate(assigns):
            target = assign.group(1)
            expr = assign.group(2).strip()
            
            logic_id = f'assign_{idx}'
            nodes.append({
                'id': logic_id,
                'label': f'={expr[:15]}...' if len(expr) > 15 else f'={expr}',
                'type': 'logic',
                'expression': expr
            })
            
            # Find sources
            sources = re.findall(r'\b([a-zA-Z_]\w*)\b', expr)
            for src in sources:
                if src in [n['id'] for n in nodes] and src != target:
                    edges.append({'source': src, 'target': logic_id})
            
            edges.append({'source': logic_id, 'target': target})
        
        # Extract always blocks
        always_blocks = re.finditer(r'always\s*@\s*\(([^)]+)\)', verilog_code)
        for idx, always in enumerate(always_blocks):
            sensitivity = always.group(1)
            
            if 'posedge' in sensitivity or 'negedge' in sensitivity:
                block_type = 'sequential'
                label = 'FF'
            else:
                block_type = 'combinational'
                label = 'COMB'
            
            block_id = f'always_{idx}'
            nodes.append({
                'id': block_id,
                'label': label,
                'type': block_type,
                'sensitivity': sensitivity
            })
        
        return {
            'nodes': nodes,
            'edges': edges,
            'module_name': module_name
        }
    
    def _extract_ports(self, code, port_type):
        """Extract ports of given type."""
        ports = []
        pattern = rf'{port_type}\s+(?:\[(\d+):(\d+)\]\s+)?(\w+)'
        for match in re.finditer(pattern, code):
            width = 1
            if match.group(1) and match.group(2):
                width = int(match.group(1)) - int(match.group(2)) + 1
            ports.append({'name': match.group(3), 'width': width})
        return ports
    
    def _extract_signals(self, code, signal_type):
        """Extract internal signals."""
        signals = []
        pattern = rf'{signal_type}\s+(?:\[(\d+):(\d+)\]\s+)?(\w+)'
        for match in re.finditer(pattern, code):
            width = 1
            if match.group(1) and match.group(2):
                width = int(match.group(1)) - int(match.group(2)) + 1
            signals.append({'name': match.group(3), 'width': width})
        return signals
