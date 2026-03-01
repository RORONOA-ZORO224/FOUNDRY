import re

class VerilogParser:
    """Parse Verilog - simple version."""
    
    def parse(self, verilog_code):
        """Parse Verilog and return schematic data."""
        try:
            nodes = []
            edges = []
            node_ids = set()
            
            # Extract module name
            module_match = re.search(r'module\s+(\w+)', verilog_code)
            module_name = module_match.group(1) if module_match else 'top'
            
            # Extract inputs
            for match in re.finditer(r'input\s+(?:\[(\d+):(\d+)\]\s+)?(\w+)', verilog_code):
                name = match.group(3)
                if name not in node_ids:
                    width = 1
                    if match.group(1) and match.group(2):
                        width = int(match.group(1)) - int(match.group(2)) + 1
                    nodes.append({
                        'id': name,
                        'label': name,
                        'type': 'input',
                        'width': width
                    })
                    node_ids.add(name)
            
            # Extract outputs
            for match in re.finditer(r'output\s+(?:reg\s+)?(?:\[(\d+):(\d+)\]\s+)?(\w+)', verilog_code):
                name = match.group(3)
                if name not in node_ids:
                    width = 1
                    if match.group(1) and match.group(2):
                        width = int(match.group(1)) - int(match.group(2)) + 1
                    nodes.append({
                        'id': name,
                        'label': name,
                        'type': 'output',
                        'width': width
                    })
                    node_ids.add(name)
            
            # Extract regs
            for match in re.finditer(r'reg\s+(?:\[(\d+):(\d+)\]\s+)?(\w+)', verilog_code):
                name = match.group(3)
                if name not in node_ids:
                    width = 1
                    if match.group(1) and match.group(2):
                        width = int(match.group(1)) - int(match.group(2)) + 1
                    nodes.append({
                        'id': name,
                        'label': name,
                        'type': 'register',
                        'width': width
                    })
                    node_ids.add(name)
            
            # Extract wires
            for match in re.finditer(r'wire\s+(?:\[(\d+):(\d+)\]\s+)?(\w+)', verilog_code):
                name = match.group(3)
                if name not in node_ids:
                    width = 1
                    if match.group(1) and match.group(2):
                        width = int(match.group(1)) - int(match.group(2)) + 1
                    nodes.append({
                        'id': name,
                        'label': name,
                        'type': 'wire',
                        'width': width
                    })
                    node_ids.add(name)
            
            # Simple logic blocks for always blocks
            always_count = 0
            for match in re.finditer(r'always\s*@\s*\(([^)]+)\)', verilog_code):
                sensitivity = match.group(1)
                logic_id = f'logic_{always_count}'
                
                if 'posedge' in sensitivity or 'negedge' in sensitivity:
                    block_type = 'sequential'
                    label = 'Sequential'
                else:
                    block_type = 'combinational'
                    label = 'Comb'
                
                nodes.append({
                    'id': logic_id,
                    'label': label,
                    'type': block_type,
                    'width': 1
                })
                node_ids.add(logic_id)
                always_count += 1
            
            # Create some simple edges (inputs to logic to outputs)
            input_nodes = [n for n in nodes if n['type'] == 'input']
            output_nodes = [n for n in nodes if n['type'] == 'output']
            logic_nodes = [n for n in nodes if n['type'] in ['sequential', 'combinational']]
            
            if logic_nodes:
                # Connect inputs to first logic node
                if input_nodes and logic_nodes:
                    for inp in input_nodes[:3]:  # Limit connections
                        edges.append({
                            'source': inp['id'],
                            'target': logic_nodes[0]['id']
                        })
                
                # Connect logic nodes to outputs
                if output_nodes and logic_nodes:
                    for out in output_nodes[:3]:  # Limit connections
                        edges.append({
                            'source': logic_nodes[0]['id'],
                            'target': out['id']
                        })
            else:
                # Direct connections for simple assigns
                if len(input_nodes) > 0 and len(output_nodes) > 0:
                    edges.append({
                        'source': input_nodes[0]['id'],
                        'target': output_nodes[0]['id']
                    })
            
            return {
                'nodes': nodes,
                'edges': edges,
                'module_name': module_name
            }
        except Exception as e:
            print(f"Schematic parse error: {e}")
            return {'nodes': [], 'edges': [], 'module_name': 'error'}
