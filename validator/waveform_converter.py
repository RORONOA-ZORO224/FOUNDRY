import re

class WaveformConverter:
    """Convert VCD files to JSON format."""
    
    def vcd_to_json(self, vcd_content):
        """
        Parse VCD and convert to JSON.
        Returns: {signals: [...], timeunit: 'ns', max_time: 100}
        """
        if not vcd_content:
            print("❌ No VCD content provided")
            return {"signals": [], "timeunit": "ns", "max_time": 0}
        
        print(f"📊 Parsing VCD ({len(vcd_content)} bytes)...")
        
        signals = {}
        current_time = 0
        max_time = 0
        timeunit = "ns"
        
        # Parse timescale
        timescale_match = re.search(r'\$timescale\s+(\d+)\s*(\w+)', vcd_content)
        if timescale_match:
            timeunit = timescale_match.group(2)
            print(f"   Timescale: {timescale_match.group(1)}{timeunit}")
        
        # Parse variable definitions
        var_pattern = r'\$var\s+(\w+)\s+(\d+)\s+(\S+)\s+([^\s]+)'
        var_count = 0
        for match in re.finditer(var_pattern, vcd_content):
            var_type = match.group(1)
            width = int(match.group(2))
            identifier = match.group(3)
            name = match.group(4)
            
            # Clean name (remove array indices)
            clean_name = name.split('[')[0]
            
            signals[identifier] = {
                'name': clean_name,
                'width': width,
                'values': [],
                'type': var_type
            }
            var_count += 1
        
        print(f"   Found {var_count} signals")
        
        # Parse value changes
        lines = vcd_content.split('\n')
        for line in lines:
            line = line.strip()
            
            # Timestamp
            if line.startswith('#'):
                try:
                    current_time = int(line[1:])
                    if current_time > max_time:
                        max_time = current_time
                except ValueError:
                    continue
            
            # Single-bit value: 0x or 1x
            elif line and len(line) >= 2 and line[0] in '01xzXZ':
                value = line[0]
                identifier = line[1:]
                if identifier in signals:
                    signals[identifier]['values'].append({
                        'time': current_time,
                        'value': value
                    })
            
            # Multi-bit value: b0101 x
            elif line.startswith('b'):
                match = re.match(r'b([01xzXZ]+)\s+(\S+)', line)
                if match:
                    value = match.group(1)
                    identifier = match.group(2)
                    if identifier in signals:
                        width = signals[identifier]['width']
                        # Convert to hex if > 4 bits
                        if width > 4:
                            try:
                                dec_val = int(value.replace('x', '0').replace('z', '0'), 2)
                                hex_val = f"0x{dec_val:X}"
                                display_value = hex_val
                            except:
                                display_value = value
                        else:
                            display_value = value
                        
                        signals[identifier]['values'].append({
                            'time': current_time,
                            'value': display_value
                        })
        
        # Convert to list
        signal_list = sorted(signals.values(), key=lambda x: x['name'])
        
        print(f"✅ Parsed waveform: {len(signal_list)} signals, max_time={max_time}")
        
        return {
            'signals': signal_list,
            'timeunit': timeunit,
            'max_time': max_time
        }


# Test
if __name__ == "__main__":
    converter = WaveformConverter()
    
    test_vcd = """$date
   Sat Mar  1 12:00:00 2025
$end
$version
   Icarus Verilog
$end
$timescale
   1ns
$end
$scope module testbench $end
$var wire 1 ! clk $end
$var wire 1 " rst $end
$var wire 4 # count [3:0] $end
$upscope $end
$enddefinitions $end
#0
$dumpvars
0!
1"
b0000 #
$end
#5
1!
#10
0!
0"
#15
1!
b0001 #
#20
0!
#25
1!
b0010 #
#30
0!
#35
1!
b0011 #
#40
"""
    
    print("=" * 60)
    print("TESTING WAVEFORM CONVERTER")
    print("=" * 60)
    
    result = converter.vcd_to_json(test_vcd)
    
    print("\n" + "=" * 60)
    print("RESULT:")
    print("=" * 60)
    print(f"Signals: {len(result['signals'])}")
    print(f"Max time: {result['max_time']}{result['timeunit']}")
    
    for sig in result['signals']:
        print(f"\n📊 {sig['name']} ({sig['width']}-bit):")
        print(f"   Changes: {len(sig['values'])}")
        if sig['values']:
            print(f"   First 3 values: {sig['values'][:3]}")
    
    if len(result['signals']) > 0:
        print("\n✅ ✅ ✅ CONVERTER WORKING! ✅ ✅ ✅")
    else:
        print("\n❌ ❌ ❌ NO SIGNALS PARSED ❌ ❌ ❌")
