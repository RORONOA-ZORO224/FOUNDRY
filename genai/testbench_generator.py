from groq import Groq
from config import Config
import re


class TestbenchGenerator:

    def __init__(self):
        self.client = Groq(api_key=Config.GROQ_API_KEY)  

    def generate(self, verilog_code, module_name):
        ports = self._extract_ports(verilog_code)

        prompt = f"""
Generate a comprehensive Verilog testbench for this module:
```verilog
{verilog_code}
```

Requirements:
1. Test all major functionality
2. Include $dumpfile("waves.vcd") and $dumpvars for waveform generation
3. Include $finish at the end
4. Use #10 delays between test vectors
5. Print test progress with $display
6. Test both normal operation and edge cases

Testbench should:
- Instantiate the module as 'uut'
- Generate clock if module has 'clk' input
- Assert reset at start if module has 'rst' input

Output ONLY the testbench Verilog code, no explanation.
"""

        try:
            response = self.client.chat.completions.create(  # Changed
                model=Config.MODEL_NAME,
                max_tokens=2000,
                temperature=0.4,
                messages=[{"role": "user", "content": prompt}]
            )

            testbench = response.choices[0].message.content  # Changed

            if '```' in testbench:
                testbench = testbench.split('```')[1]
                if testbench.startswith('verilog'):
                    testbench = testbench[7:]
                testbench = testbench.split('```')[0]

            if '$dumpfile' not in testbench:
                testbench = self._add_vcd_dump(testbench)

            return testbench.strip()

        except Exception as e:
            return self._generate_simple_testbench(module_name, ports)

    def _extract_ports(self, verilog_code):
        ports = {'inputs': [], 'outputs': []}
        for match in re.finditer(r'input\s+(?:\[[^\]]+\]\s+)?(\w+)', verilog_code):
            ports['inputs'].append(match.group(1))
        for match in re.finditer(r'output\s+(?:reg\s+)?(?:\[[^\]]+\]\s+)?(\w+)', verilog_code):
            ports['outputs'].append(match.group(1))
        return ports

    def _add_vcd_dump(self, testbench):
        if 'initial begin' in testbench:
            parts = testbench.split('initial begin', 1)
            vcd_code = '\n        $dumpfile("waves.vcd");\n        $dumpvars(0, testbench);\n'
            return parts[0] + 'initial begin' + vcd_code + parts[1]
        return testbench

    def _generate_simple_testbench(self, module_name, ports):
        signal_decls = []
        for inp in ports['inputs']:
            signal_decls.append(f"    reg {inp};")
        for out in ports['outputs']:
            signal_decls.append(f"    wire {out};")

        port_list = ', '.join([f".{p}({p})" for p in ports['inputs'] + ports['outputs']])

        return f"""module testbench;
{chr(10).join(signal_decls)}

    {module_name} uut (
        {port_list}
    );

    initial begin
        $dumpfile("waves.vcd");
        $dumpvars(0, testbench);
{chr(10).join([f"        {inp} = 0;" for inp in ports['inputs']])}
        #10;
        $display("Test starting...");
        #100;
        $display("Test complete");
        $finish;
    end

endmodule"""


if __name__ == "__main__":
    print("Testing TestbenchGenerator...")
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
    print(tb)