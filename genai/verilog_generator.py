"""genai/verilog_generator.py — generates Verilog for all 4 modeling styles"""
from groq import Groq
from config import Config
import re, html


class VerilogGenerator:

    MODELING_INSTRUCTIONS = {
        'behavioral': """
MODELING STYLE: BEHAVIORAL
- Use always blocks: @(posedge clk) for sequential, @(*) for combinational
- Use if-else and case statements
- Outputs driven by always blocks must be declared 'reg'
- Do NOT use primitive gates or sub-module instantiations
""",
        'dataflow': """
MODELING STYLE: DATAFLOW
- Use ONLY continuous assign statements: assign out = expression;
- Use operators: +, -, &, |, ^, ~, ==, ?:, <<, >>
- No always blocks, no case, no if-else, no module instantiations
- Every signal driven by exactly one assign
""",
        'gate_level': """
MODELING STYLE: GATE-LEVEL
- Use ONLY Verilog primitives: and, or, not, nand, nor, xor, xnor, buf
- Syntax: and g1(out, in1, in2);
- Declare ALL intermediate wires explicitly
- No always blocks, no assign with operators, no module instantiations
""",
        'structural': """
MODELING STYLE: STRUCTURAL
- Build by instantiating smaller sub-modules
- Define ALL sub-modules IN THE SAME FILE before the top module
- Each sub-module should use gate-level or behavioral description internally
- Connect with named ports: .port(signal)
- Declare all intermediate wires
""",
    }

    def __init__(self):
        self.client = Groq(api_key=Config.GROQ_API_KEY)

    def generate(self, description, modeling_type='behavioral'):
        instr = self.MODELING_INSTRUCTIONS.get(modeling_type, self.MODELING_INSTRUCTIONS['behavioral'])

        prompt = f"""Generate synthesizable Verilog 2005 code.

DESCRIPTION: {description}
{instr}

STRICT RULES:
- Verilog 2005 only, no SystemVerilog
- Output ONLY the code inside ```verilog fences
- Complete port list with bit ranges for multi-bit ports
- No explanation outside the code fence
"""
        try:
            resp = self.client.chat.completions.create(
                model=Config.MODEL_NAME,
                messages=[
                    {"role": "system", "content": "You are an RTL design engineer. Follow the modeling style strictly."},
                    {"role": "user",   "content": prompt},
                ],
                max_tokens=Config.MAX_TOKENS,
                temperature=0.3,
            )
            raw     = resp.choices[0].message.content
            verilog = self._extract(raw)
            # For structural: top module is last defined
            module_name = self._top_module(verilog, modeling_type)
            explanation = self._explain(description, modeling_type, verilog)
            return {'success': True, 'verilog_code': verilog,
                    'module_name': module_name, 'explanation': explanation,
                    'modeling_type': modeling_type}
        except Exception as e:
            print(f"⚠️ VerilogGenerator: {e}")
            return {'success': False, 'error': str(e)}

    def _explain(self, desc, mtype, code):
        try:
            style = {'behavioral':'Behavioral','dataflow':'Dataflow',
                     'gate_level':'Gate-Level','structural':'Structural'}.get(mtype,'')
            p = (f"In 2–3 sentences explain what this {style} Verilog module does. "
                 f"Desc: {desc}\nCode (first 300 chars):\n{code[:300]}")
            r = self.client.chat.completions.create(
                model=Config.MODEL_NAME,
                messages=[{"role":"user","content":p}],
                max_tokens=200, temperature=0.4)
            return r.choices[0].message.content.strip()
        except:
            return f"{desc} — {mtype.replace('_','-')} modeling style."

    def _extract(self, text):
        for marker in ('```verilog', '```v', '```'):
            if marker in text:
                parts = text.split(marker)
                code  = parts[1].split('```')[0] if len(parts) > 1 else text
                break
        else:
            code = text
        code = code.strip()
        code = html.unescape(code)
        code = re.sub(r'<[^>]+>', '', code)
        code = re.sub(r'\n{3,}', '\n\n', code)
        return code

    def _top_module(self, code, modeling_type):
        """For structural (multiple modules), return the last (top) module name."""
        matches = re.findall(r'module\s+(\w+)', code)
        if not matches:
            return 'generated_module'
        # For structural the top module is defined last
        if modeling_type == 'structural' and len(matches) > 1:
            return matches[-1]
        return matches[0]