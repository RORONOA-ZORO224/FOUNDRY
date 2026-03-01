from groq import Groq
from config import Config
import re
import html


class TestbenchGenerator:

    def __init__(self):
        self.client = Groq(api_key=Config.GROQ_API_KEY)  

    def generate(self, verilog_code, module_name):
        """Generate comprehensive testbench."""
        
        ports = self._extract_ports(verilog_code)

        prompt = f"""Generate a WORKING Verilog testbench for this module.

MODULE TO TEST:
```verilog
{verilog_code}
```

CRITICAL REQUIREMENTS:
1. Use ONLY standard Verilog 2005 syntax
2. NO SystemVerilog constructs
3. Declare ALL signals properly (reg for inputs, wire for outputs)
4. Use proper blocking assignments in initial blocks
5. Include clock generation ONLY if 'clk' port exists
6. Include $dumpfile("waves.vcd") and $dumpvars(0, testbench)
7. Include $finish at end
8. Use #10 delays between test vectors
9. Instantiate module as 'uut'

TESTBENCH STRUCTURE:
```verilog
module testbench;
    // Signal declarations
    reg [width] input_signals;
    wire [width] output_signals;
    
    // Module instantiation
    {module_name} uut (
        .port1(signal1),
        .port2(signal2)
    );
    
    // Clock generation (if needed)
    
    // Test stimulus
    initial begin
        $dumpfile("waves.vcd");
        $dumpvars(0, testbench);
        
        // Initialize
        // Apply test vectors
        // Wait
        
        #100;
        $finish;
    end
endmodule
```

Output ONLY valid Verilog code. NO explanations. NO markdown except the code fence."""

        try:
            response = self.client.chat.completions.create(
                model=Config.MODEL_NAME,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a Verilog verification expert. Generate thorough, working testbenches using standard Verilog 2005 syntax only."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                max_tokens=2000,
                temperature=0.4,
            )

            # Use the improved extraction method
            testbench = self._extract_verilog(response.choices[0].message.content)

            # Ensure VCD dump is included
            if '$dumpfile' not in testbench:
                testbench = self._add_vcd_dump(testbench)

            return testbench.strip()

        except Exception as e:
            print(f"⚠️ Testbench generation failed: {e}")
            return self._generate_simple_testbench(module_name, ports)

    def _extract_ports(self, verilog_code):
        """Extract port information from Verilog code."""
        ports = {'inputs': [], 'outputs': []}
        
        # Extract inputs
        for match in re.finditer(r'input\s+(?:\[[^\]]+\]\s+)?(\w+)', verilog_code):
            ports['inputs'].append(match.group(1))
        
        # Extract outputs
        for match in re.finditer(r'output\s+(?:reg\s+)?(?:\[[^\]]+\]\s+)?(\w+)', verilog_code):
            ports['outputs'].append(match.group(1))
        
        return ports

    def _add_vcd_dump(self, testbench):
        """Add VCD dump statements if missing."""
        if 'initial begin' in testbench:
            parts = testbench.split('initial begin', 1)
            vcd_code = '\n        $dumpfile("waves.vcd");\n        $dumpvars(0, testbench);\n'
            return parts[0] + 'initial begin' + vcd_code + parts[1]
        return testbench

    def _extract_verilog(self, text):
        """Extract clean Verilog code from response."""
        # Try to extract from markdown code fences
        if '```verilog' in text:
            code = text.split('```verilog')[1].split('```')[0]
        elif '```v' in text:
            code = text.split('```v')[1].split('```')[0]
        elif '```' in text:
            parts = text.split('```')
            if len(parts) >= 3:
                code = parts[1]
                # Skip language identifier if present
                lines = code.split('\n')
                if lines and lines[0].strip() in ['verilog', 'v', 'systemverilog']:
                    code = '\n'.join(lines[1:])
            else:
                code = text
        else:
            code = text
        
        # Clean up the code
        code = code.strip()
        
        # Clean HTML entities and tags
        code = html.unescape(code)
        code = re.sub(r'<[^>]+>', '', code)
        code = re.sub(r'\n{3,}', '\n\n', code)
        
        return code

    def _generate_simple_testbench(self, module_name, ports):
        """Generate a basic fallback testbench."""
        
        # Declare signals
        signal_decls = []
        for inp in ports['inputs']:
            signal_decls.append(f"    reg {inp};")
        for out in ports['outputs']:
            signal_decls.append(f"    wire {out};")

        # Build port connections
        port_list = ', '.join([f".{p}({p})" for p in ports['inputs'] + ports['outputs']])

        testbench = f"""module testbench;
{chr(10).join(signal_decls)}

    // Instantiate unit under test
    {module_name} uut (
        {port_list}
    );

    initial begin
        $dumpfile("waves.vcd");
        $dumpvars(0, testbench);
        
        // Initialize all inputs to 0
{chr(10).join([f"        {inp} = 0;" for inp in ports['inputs']])}
        
        #10;
        $display("Test starting...");
        
        // Add your test vectors here
        
        #100;
        $display("Test complete");
        $finish;
    end

endmodule"""
        
        return testbench


if __name__ == "__main__":
    print("🧪 Testing TestbenchGenerator...\n")
    
    sample_code = """
module adder_4bit (
    input  [3:0] a,
    input  [3:0] b,
    input        cin,
    output [3:0] sum,
    output       cout
);
    assign {cout, sum} = a + b + cin;
endmodule
"""
    
    gen = TestbenchGenerator()
    tb = gen.generate(sample_code, "adder_4bit")
    
    print("Generated testbench:")
    print("=" * 60)
    print(tb)
    print("=" * 60)
    
    # Check for HTML tags
    if '<' in tb or '&lt;' in tb or '&gt;' in tb:
        print("\n❌ WARNING: HTML entities detected in testbench!")
    else:
        print("\n✅ Testbench is clean (no HTML tags)")
    
    # Check for required elements
    checks = {
        'Has module declaration': 'module testbench' in tb,
        'Has $dumpfile': '$dumpfile' in tb,
        'Has $dumpvars': '$dumpvars' in tb,
        'Has $finish': '$finish' in tb,
        'Has UUT instantiation': 'uut' in tb.lower()
    }
    
    print("\nValidation checks:")
    for check, passed in checks.items():
        status = "✅" if passed else "❌"
        print(f"{status} {check}")