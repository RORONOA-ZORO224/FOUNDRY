"""
learning/explainer.py — Line-by-line Verilog explanation
Works for ALL modeling types: behavioral, dataflow, gate_level, structural
"""
from groq import Groq
import sys, os, json, re

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'genai'))
from config import Config


class LearningExplainer:

    # Category keywords for each modeling style
    CATEGORY_HINTS = {
        'module':    'declaration',
        'input':     'port',
        'output':    'port',
        'inout':     'port',
        'wire':      'declaration',
        'reg':       'declaration',
        'always':    'sequential',
        'posedge':   'sequential',
        'negedge':   'sequential',
        'assign':    'combinational',
        'if':        'combinational',
        'else':      'combinational',
        'case':      'combinational',
        'endcase':   'combinational',
        'begin':     'structural',
        'end':       'structural',
        'endmodule': 'declaration',
        # gate-level
        'and ':      'gate',
        'or ':       'gate',
        'not ':      'gate',
        'nand ':     'gate',
        'nor ':      'gate',
        'xor ':      'gate',
        'xnor ':     'gate',
        'buf ':      'gate',
        # structural instantiation pattern
    }

    VALID_CATEGORIES = {
        'declaration', 'port', 'sequential', 'combinational',
        'structural', 'gate', 'logic', 'comment'
    }

    def __init__(self):
        self.client = Groq(api_key=Config.GROQ_API_KEY)

    def explain(self, verilog_code: str, modeling_type: str = 'behavioral') -> list:
        """
        Returns [{line, code, explanation, category}] for every non-blank line.
        """
        lines = verilog_code.strip().split('\n')
        non_blank = [(i+1, ln) for i, ln in enumerate(lines) if ln.strip()]

        if not non_blank:
            return []

        try:
            result = self._ai_explain(verilog_code, non_blank, modeling_type)
            # Validate/clean result
            return self._validate(result, non_blank)
        except Exception as e:
            print(f"❌ LearningExplainer AI failed: {e}")
            return self._fallback(non_blank, modeling_type)

    def _ai_explain(self, full_code, non_blank, modeling_type) -> list:
        style_note = {
            'behavioral':  "This is BEHAVIORAL Verilog using always/if/case.",
            'dataflow':    "This is DATAFLOW Verilog using assign statements and operators.",
            'gate_level':  "This is GATE-LEVEL Verilog using primitive gates (and, or, not, xor…).",
            'structural':  "This is STRUCTURAL Verilog using sub-module instantiations.",
        }.get(modeling_type, '')

        numbered = '\n'.join(f"{ln}: {code}" for ln, code in non_blank[:80])

        prompt = f"""Explain this Verilog code line by line. {style_note}

CODE (line_number: code):
{numbered}

Return a JSON array. One object per line shown above:
[
  {{
    "line": <line_number>,
    "code": "<exact line content>",
    "explanation": "<clear educational explanation>",
    "category": "<one of: declaration|port|sequential|combinational|structural|gate|logic|comment>"
  }},
  ...
]

IMPORTANT:
- Explain gate-level lines as: what the gate does, its inputs and output signal names
- Explain structural lines as: which sub-module is instantiated and what it does  
- Explain assign lines as: what combinational logic is implemented
- Explain always blocks as: clocked or combinational, what it registers/computes
- Return ONLY the JSON array, no other text, no markdown fences
"""
        resp = self.client.chat.completions.create(
            model=Config.MODEL_NAME,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4000,
            temperature=0.2,
        )
        content = resp.choices[0].message.content.strip()

        # Strip markdown
        if '```json' in content:
            content = content.split('```json')[1].split('```')[0]
        elif '```' in content:
            content = content.split('```')[1].split('```')[0]

        return json.loads(content.strip())

    def _validate(self, result, non_blank) -> list:
        """Ensure every non-blank line has an entry with valid category."""
        line_map = {item['line']: item for item in result if isinstance(item, dict)}
        out = []
        for ln, code in non_blank:
            entry = line_map.get(ln, {})
            cat   = entry.get('category', 'logic')
            if cat not in self.VALID_CATEGORIES:
                cat = self._guess_category(code)
            out.append({
                'line':        ln,
                'code':        code,
                'explanation': entry.get('explanation') or self._fallback_explain(code),
                'category':    cat,
            })
        return out

    def _fallback(self, non_blank, modeling_type) -> list:
        return [{
            'line':        ln,
            'code':        code,
            'explanation': self._fallback_explain(code),
            'category':    self._guess_category(code),
        } for ln, code in non_blank]

    def _guess_category(self, line: str) -> str:
        stripped = line.strip()
        if stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*'):
            return 'comment'
        for kw, cat in self.CATEGORY_HINTS.items():
            if kw in stripped:
                return cat
        # Structural instantiation: Word Word ( — two identifiers then paren
        if re.match(r'^\s*\w+\s+\w+\s*\(', stripped):
            return 'structural'
        return 'logic'

    def _fallback_explain(self, line: str) -> str:
        s = line.strip()
        if not s:
            return ''
        if s.startswith('//'):
            return 'Code comment'
        if s.startswith('module'):
            m = re.search(r'module\s+(\w+)', s)
            return f"Declares module '{m.group(1)}'" if m else 'Module declaration'
        if 'input' in s:
            return f"Input port declaration: {s}"
        if 'output' in s:
            return f"Output port declaration: {s}"
        if 'wire' in s:
            return f"Wire (combinational signal) declaration: {s}"
        if 'reg' in s:
            return f"Register declaration (can be driven by always block): {s}"
        if 'assign' in s:
            return f"Continuous assignment (combinational logic): {s}"
        if 'always' in s:
            if 'posedge' in s or 'negedge' in s:
                return f"Clocked always block (flip-flop / register): {s}"
            return f"Combinational always block (sensitivity list): {s}"
        for gate in ('and','or','not','nand','nor','xor','xnor','buf'):
            if re.match(rf'^\s*{gate}\s+', s):
                return f"Primitive {gate.upper()} gate instantiation"
        if re.match(r'^\s*\w+\s+\w+\s*\(', s):
            return f"Sub-module instantiation: {s}"
        return f"Verilog statement: {s}"