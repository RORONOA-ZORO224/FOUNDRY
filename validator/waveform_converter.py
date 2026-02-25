import re
import json

class WaveformConverter:
    """Convert VCD files to JSON for browser rendering."""
    
    def vcd_to_json(self, vcd_content):
        """
        Parse VCD file and convert to JSON format.
        Returns: {signals: [{name, width, values: [{time, value}]}]}
        """
        if not vcd_content:
            return {"signals": []}
        
        signals = {}
        current_time = 0
        
        # Parse variable definitions
        in_var_section = False
        for line in vcd_content.split('\n'):
            line = line.strip()
            
            if line.startswith('$var'):
                # Format: $var wire 1 ! clk $end
                parts = line.split()
                if len(parts) >= 5:
                    var_type = parts[1]
                    width = int(parts[2])
                    identifier = parts[3]
                    name = parts[4]
                    signals[identifier] = {
                        'name': name,
                        'width': width,
                        'values': []
                    }
            
            elif line.startswith('#'):
                # Timestamp
                current_time = int(line[1:])
            
            elif line and line[0] in '01xz':
                # Value change: 0! or 1!
                value = line[0]
                identifier = line[1:]
                if identifier in signals:
                    signals[identifier]['values'].append({
                        'time': current_time,
                        'value': value
                    })
            
            elif line.startswith('b'):
                # Multi-bit value: b0101 "
                match = re.match(r'b([01xz]+)\s+(\S+)', line)
                if match:
                    value = match.group(1)
                    identifier = match.group(2)
                    if identifier in signals:
                        signals[identifier]['values'].append({
                            'time': current_time,
                            'value': value
                        })
        
        return {
            'signals': list(signals.values())
        }

# Quick test
if __name__ == "__main__":
    converter = WaveformConverter()
    
    # Minimal VCD example
    vcd = """
$var wire 1 ! clk $end
$var wire 1 " rst $end
$var wire 4 # count $end
$enddefinitions $end
#0
0!
1"
b0000 #
#10
1!
#20
0!
0"
#30
1!
b0001 #
"""
    result = converter.vcd_to_json(vcd)
    print("Parsed signals:")
    print(json.dumps(result, indent=2))
