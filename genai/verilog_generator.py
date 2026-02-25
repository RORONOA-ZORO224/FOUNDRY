from groq import Groq
from config import Config
import re
from pathlib import Path


class VerilogGenerator:

    def __init__(self):
        self.client = Groq(api_key=Config.GROQ_API_KEY)  
        self.templates = self._load_templates()

    def _load_templates(self):
        templates = []
        templates_dir = Path(Config.TEMPLATES_DIR)

        if not templates_dir.exists():
            print(f"Warning: Templates directory not found: {templates_dir}")
            return []

        for vfile in templates_dir.glob('*.v'):
            try:
                content = vfile.read_text()
                templates.append({'name': vfile.stem, 'code': content})
            except Exception as e:
                print(f"Warning: Could not load {vfile.name}: {e}")

        print(f"Loaded {len(templates)} template examples")
        return templates

    def _build_system_prompt(self):
        best_practices = """
You are an expert Verilog hardware designer. Follow these rules strictly:

ALWAYS BLOCK RULES:
- Sequential logic: always @(posedge clk) with non-blocking assignments (<=)
- Combinational logic: always @(*) with blocking assignments (=)
- Always include synchronous reset inside @(posedge clk)

SIGNAL DECLARATIONS:
- Use 'reg' for signals assigned in always blocks
- Use 'wire' for continuous assignments
- Always specify bit widths: [7:0] not implicit

RESET LOGIC:
- Always synchronous reset (inside @(posedge clk))
- Reset to known values: counter <= 8'd0;
- Reset is active high

AVOID:
- Latches: always have else in combinational blocks
- Implicit nets: declare all signals
- Mixing blocking/non-blocking in same always block

NAMING:
- Modules: lowercase_with_underscores
- Parameters: UPPERCASE
- States: UPPERCASE

CASE STATEMENTS:
- Always include default case
"""
        examples = "\n\nHERE ARE KNOWN-GOOD EXAMPLES TO LEARN FROM:\n\n"
        for i, template in enumerate(self.templates[:5], 1):
            examples += f"--- Example {i}: {template['name']} ---\n"
            examples += template['code']
            examples += "\n\n"

        return best_practices + examples

    def generate(self, user_description):
        system_prompt = self._build_system_prompt()

        user_prompt = f"""
Generate a complete, working Verilog module for this description:

{user_description}

Requirements:
1. Include complete module with all ports
2. Follow all Verilog best practices from system prompt
3. Add brief comments explaining key logic
4. Module should be synthesizable
5. Use standard Verilog 2005 (not SystemVerilog)

Output format:
```verilog
// Your Verilog code here
```

Then provide a brief explanation of how the module works.
"""

        try:
            response = self.client.chat.completions.create(  
                model=Config.MODEL_NAME,
                max_tokens=Config.MAX_TOKENS,
                temperature=Config.TEMPERATURE,
                messages=[
                    {"role": "system", "content": system_prompt}, 
                    {"role": "user", "content": user_prompt}
                ]
            )

            full_response = response.choices[0].message.content  
            verilog_code = self._extract_verilog(full_response)
            module_name = self._extract_module_name(verilog_code)
            explanation = full_response.split('```')[-1].strip()

            return {
                'success': True,
                'verilog_code': verilog_code,
                'module_name': module_name,
                'explanation': explanation,
                'raw_response': full_response
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'verilog_code': None,
                'module_name': None
            }

    def _extract_verilog(self, text):
        if '```verilog' in text:
            code = text.split('```verilog')[1].split('```')[0]
        elif '```' in text:
            code = text.split('```')[1].split('```')[0]
        else:
            code = text
        return code.strip()

    def _extract_module_name(self, verilog_code):
        match = re.search(r'module\s+(\w+)', verilog_code)
        return match.group(1) if match else 'top'


if __name__ == "__main__":
    print("Testing VerilogGenerator...")
    gen = VerilogGenerator()
    result = gen.generate("Create a simple 4-bit adder with carry out")

    if result['success']:
        print(f"\n✅ Generation successful!")
        print(f"Module name: {result['module_name']}")
        print(f"\nGenerated code:\n{result['verilog_code']}\n")
    else:
        print(f"\n❌ Generation failed: {result['error']}")