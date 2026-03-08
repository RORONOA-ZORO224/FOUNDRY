"""
schematic/circuit_extractor.py  — v5

AI-powered hardware component extractor.

KEY IMPROVEMENTS:
  - Detailed ring-counter / shift-register recognition
  - For behavioral code with `cnt <= {cnt[N:0], cnt[M]}` → creates N+1 DFFs in ring
  - For sequential always blocks: one DFF per bit of each registered signal
  - For gate-level: one component per primitive
  - For structural: one component per sub-module instance
  - Fallback parser handles all 4 modeling styles
  - Works around Groq context-length by truncating long files
"""

from groq import Groq
import sys, os, json, re
from collections import deque

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'genai'))
from config import Config


class CircuitExtractor:

    # Component canvas dimensions (W, H)
    DIMS = {
        'dff':        (100, 110), 'tff':       (100, 110),
        'register':   (110,  80), 'counter':   (110,  80),
        'alu':        (110, 120),
        'and':        ( 80,  60), 'or':        ( 80,  60),
        'nand':       ( 84,  60), 'nor':       ( 84,  60),
        'xor':        ( 86,  60), 'xnor':      ( 90,  60),
        'not':        ( 65,  50), 'buf':       ( 65,  50),
        'mux':        ( 75,  90), 'adder':     ( 80,  70),
        'subtractor': ( 80,  70), 'comparator':( 90,  80),
        'input':      ( 85,  44), 'output':    ( 85,  44),
        'clock':      ( 64,  64),
        'decoder':    ( 90, 100), 'encoder':   ( 90, 100),
        'memory':     (110, 110),
    }

    def __init__(self):
        self.client = Groq(api_key=Config.GROQ_API_KEY)

    # ─────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────
    def extract(self, verilog_code: str, modeling_type: str = 'behavioral') -> dict:
        try:
            result = self._ai_extract(verilog_code, modeling_type)
            if not result.get('components'):
                raise ValueError("AI returned empty component list")
            return self._layout(result)
        except Exception as e:
            print(f"⚠️  AI circuit extraction failed ({e}). Using fallback.")
            return self._fallback_extract(verilog_code, modeling_type)

    # ─────────────────────────────────────────────────
    # AI Extraction
    # ─────────────────────────────────────────────────
    def _ai_extract(self, code: str, modeling_type: str) -> dict:

        # Style-specific instructions
        style_hint = {
            'gate_level': (
                "This is GATE-LEVEL Verilog. "
                "Every primitive instantiation (and, or, not, nand, nor, xor, xnor, buf) "
                "must become its own component. Use the exact primitive keyword as the type."
            ),
            'structural': (
                "This is STRUCTURAL Verilog. "
                "Every sub-module instantiation must become one component. "
                "Use the sub-module name to pick the type (e.g. 'half_adder'→adder, "
                "'dff'/'flip_flop'→dff, 'mux'→mux)."
            ),
            'dataflow': (
                "This is DATAFLOW Verilog (assign statements only). "
                "Convert each assign expression into the equivalent gate(s): "
                " & → and,  | → or,  ^ → xor,  ~ → not,  ?: → mux,  + → adder,  - → subtractor."
            ),
            'behavioral': (
                "This is BEHAVIORAL Verilog. "
                "IMPORTANT RULES:\n"
                "1. Each clocked always @(posedge/negedge clk) block registers signals.\n"
                "   For each distinct reg/wire bit driven in that block, create one DFF.\n"
                "2. Ring counters & shift registers: if you see `cnt <= {cnt[N-2:0], cnt[N-1]}` "
                "   or `out <= {out[N-2:0], val}`, create EXACTLY N DFFs (ff_0…ff_{N-1}), "
                "   connected in a chain with the last Q feeding the first D (ring) or an input "
                "   value feeding the first D (shift reg).\n"
                "3. Combinational always @(*) → use appropriate gate types (mux, adder, etc.).\n"
                "4. For a 4-bit ring counter cnt[3:0]: create ff_0, ff_1, ff_2, ff_3 as DFFs.\n"
                "   Connections: ff_0.Q→ff_1.D, ff_1.Q→ff_2.D, ff_2.Q→ff_3.D, ff_3.Q→ff_0.D (ring).\n"
                "   Also connect clk→all DFF clk pins, rst/clr→all DFF clr pins."
            ),
        }.get(modeling_type, "Identify all hardware components.")

        prompt = f"""Analyze this Verilog and list ALL hardware components.

{style_hint}

VERILOG CODE:
```verilog
{code[:3500]}
```

Return ONLY valid JSON. NO prose, NO markdown fences. EXACT structure:
{{
  "circuit_type": "sequential|combinational|mixed",
  "description": "one-line description of what this circuit does",
  "components": [
    {{
      "id":     "unique_snake_case_id",
      "type":   "dff|tff|and|or|not|nand|nor|xor|xnor|buf|mux|adder|subtractor|register|comparator|decoder|counter|input|output|clock|alu",
      "label":  "human-readable label e.g. FF_0, AND_G1, CLK, rst_n",
      "bits":   1,
      "signals": {{}}
    }}
  ],
  "connections": [
    {{
      "from_comp":   "source_component_id",
      "to_comp":     "destination_component_id",
      "signal_name": "wire_or_reg_name",
      "is_bus":      false,
      "bus_width":   1
    }}
  ]
}}

UNIVERSAL RULES (apply to ALL styles):
- Every input port  → one component, type="input"
- Every output port → one component, type="output"
- Clock signals     → type="clock"
- Maximum 30 components total
- Connections must reference real component ids
- For buses: set is_bus=true and bus_width to actual bit width
- Do NOT repeat component ids
"""
        resp = self.client.chat.completions.create(
            model=Config.MODEL_NAME,
            messages=[
                {"role": "system",
                 "content": "You are a digital circuit analyst. Return only valid JSON, nothing else."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=2500,
            temperature=0.05,
        )
        raw = resp.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if '```json' in raw:
            raw = raw.split('```json')[1].split('```')[0]
        elif '```' in raw:
            raw = raw.split('```')[1].split('```')[0]

        return json.loads(raw.strip())

    # ─────────────────────────────────────────────────
    # Layout: topological sort → assign (x, y)
    # ─────────────────────────────────────────────────
    def _layout(self, data: dict) -> dict:
        comps = data.get('components', [])
        conns = data.get('connections', [])
        if not comps:
            return data

        comp_ids = {c['id'] for c in comps}

        # Build directed adjacency
        adj    = {c['id']: [] for c in comps}
        indeg  = {c['id']: 0  for c in comps}
        for cn in conns:
            s, t = cn.get('from_comp',''), cn.get('to_comp','')
            if s in comp_ids and t in comp_ids and s != t:
                adj[s].append(t)
                indeg[t] += 1

        # BFS topological columns
        queue   = deque(c['id'] for c in comps if indeg[c['id']] == 0)
        columns = []
        visited = set()

        while queue:
            col = list(queue)
            queue.clear()
            columns.append(col)
            for nid in col:
                if nid in visited:
                    continue
                visited.add(nid)
                for nb in adj[nid]:
                    indeg[nb] -= 1
                    if indeg[nb] == 0:
                        queue.append(nb)

        # Any remaining (cycles)
        remaining = [c['id'] for c in comps if c['id'] not in visited]
        if remaining:
            columns.append(remaining)

        # Column index map
        col_map = {}
        for ci, ids in enumerate(columns):
            for nid in ids:
                col_map[nid] = ci

        # Assign x, y with padding
        PAD_X, PAD_Y = 60, 40
        COL_W, ROW_GAP = 180, 25
        col_y = {}   # col_idx → next y
        pos   = {}

        for c in comps:
            cid = c['id']
            col = col_map.get(cid, len(columns))
            t   = c.get('type', 'default')
            _, h = self.DIMS.get(t, (90, 60))
            y0   = col_y.get(col, PAD_Y)
            pos[cid] = {'x': PAD_X + col * COL_W, 'y': y0}
            col_y[col] = y0 + h + ROW_GAP

        for c in comps:
            p = pos.get(c['id'], {'x': 60, 'y': 40})
            c['x'] = p['x']
            c['y'] = p['y']

        if pos:
            max_x = max(v['x'] for v in pos.values()) + 250
            max_y = max(v['y'] for v in pos.values()) + 200
        else:
            max_x, max_y = 900, 600

        data['canvas_width']  = int(max_x)
        data['canvas_height'] = int(max_y)
        data['components']    = comps
        data['connections']   = conns
        return data

    # ─────────────────────────────────────────────────
    # Regex Fallback
    # ─────────────────────────────────────────────────
    def _fallback_extract(self, code: str, modeling_type: str) -> dict:
        clean = re.sub(r'//[^\n]*', '', code)
        clean = re.sub(r'/\*.*?\*/', '', clean, flags=re.DOTALL)

        comps, conns = [], []

        # ── All module declarations ────────────────
        all_mods = list(re.finditer(r'module\s+(\w+)', clean))
        module_name = all_mods[-1].group(1) if all_mods else 'top'
        # Use last module body as top
        top_body = clean[all_mods[-1].start():] if all_mods else clean

        # ── Ports ─────────────────────────────────
        for m in re.finditer(r'\binput\b\s*(?:wire\s+)?(?:\[(\d+):(\d+)\]\s+)?(\w+)', top_body):
            hi, lo, name = m.group(1), m.group(2), m.group(3)
            if name in ('clk','clock','CLK','CLOCK'):
                comps.append({'id':name,'type':'clock','label':name,'bits':1,'signals':{}})
            else:
                bits = (int(hi)-int(lo)+1) if hi else 1
                comps.append({'id':name,'type':'input',
                              'label':(f"{name}[{hi}:{lo}]" if hi else name),'bits':bits,'signals':{}})

        for m in re.finditer(r'\boutput\b\s*(?:wire\s+|reg\s+)?(?:\[(\d+):(\d+)\]\s+)?(\w+)', top_body):
            hi, lo, name = m.group(1), m.group(2), m.group(3)
            bits = (int(hi)-int(lo)+1) if hi else 1
            comps.append({'id':name,'type':'output',
                          'label':(f"{name}[{hi}:{lo}]" if hi else name),'bits':bits,'signals':{}})

        # ── Ring counter / shift register detection ──
        # Look for `cnt <= {cnt[N:M], ...}` or `q <= {q[N:M], ...}` patterns
        ring_match = re.search(
            r'(\w+)\s*<=\s*\{(\w+)\[(\d+):(\d+)\]\s*,\s*\w+[^}]*\}', top_body)
        shift_match = re.search(
            r'(\w+)\s*<=\s*\{(\w+)\[(\d+):0\]\s*,\s*\w+[^}]*\}', top_body)

        if ring_match or shift_match:
            m = ring_match or shift_match
            reg_name = m.group(1)
            hi = int(m.group(3))
            n_bits = hi + 1
            for i in range(n_bits):
                fid = f'ff_{i}'
                comps.append({'id':fid,'type':'dff','label':f'FF_{i}','bits':1,'signals':{}})
            # Ring connections: Q_i → D_(i+1), last → first
            for i in range(n_bits):
                conns.append({
                    'from_comp': f'ff_{i}',
                    'to_comp':   f'ff_{(i+1)%n_bits}',
                    'signal_name': f'{reg_name}[{i}]',
                    'is_bus': False, 'bus_width': 1,
                })
            # CLK connections
            clk_id = next((c['id'] for c in comps if c['type']=='clock'), None)
            if clk_id:
                for i in range(n_bits):
                    conns.append({'from_comp':clk_id,'to_comp':f'ff_{i}',
                                  'signal_name':'clk','is_bus':False,'bus_width':1})
        else:
            # ── Gate primitives ──────────────────────
            for gate in ['and','or','not','nand','nor','xor','xnor','buf']:
                for m in re.finditer(rf'\b{gate}\b\s+(\w+)\s*\(', clean):
                    gid = m.group(1)
                    comps.append({'id':gid,'type':gate,
                                  'label':f"{gate.upper()}({gid})",'bits':1,'signals':{}})

            # ── Sub-module instances (structural) ────
            if modeling_type == 'structural':
                sub_names = {m.group(1) for m in all_mods[:-1]}
                for sub in sub_names:
                    for m in re.finditer(rf'\b{re.escape(sub)}\b\s+(\w+)\s*\(', clean):
                        iid = m.group(1)
                        ct = ('dff'   if any(x in sub.lower() for x in ('ff','flip')) else
                              'adder' if any(x in sub.lower() for x in ('add','sum'))  else
                              'mux'   if 'mux' in sub.lower() else 'register')
                        comps.append({'id':iid,'type':ct,'label':f"{sub}({iid})",'bits':1,'signals':{}})

            # ── Always blocks → DFFs / gates ─────────
            for i, m in enumerate(re.finditer(r'always\s*@\s*\(([^)]+)\)', clean)):
                sens = m.group(1)
                if 'posedge' in sens or 'negedge' in sens:
                    comps.append({'id':f'dff_b{i}','type':'dff','label':f'DFF_{i}','bits':1,'signals':{}})
                else:
                    comps.append({'id':f'comb_{i}','type':'and','label':f'COMB_{i}','bits':1,'signals':{}})

            # ── Assign expressions → gates ───────────
            for i, m in enumerate(re.finditer(r'assign\s+(\w+)\s*=\s*([^;]+);', clean)):
                expr = m.group(2)
                ct = ('adder'      if '+' in expr else
                      'subtractor' if '-' in expr else
                      'comparator' if '==' in expr else
                      'mux'        if '?' in expr else
                      'xor'        if '^' in expr else
                      'not'        if expr.strip().startswith('~') else
                      'and'        if '&' in expr else
                      'or'         if '|' in expr else 'and')
                comps.append({'id':f'a{i}','type':ct,'label':f'{ct.upper()}_{i}','bits':1,'signals':{}})

        # ── Deduplicate ───────────────────────────
        seen, unique = set(), []
        for c in comps:
            if c['id'] not in seen:
                seen.add(c['id'])
                unique.append(c)
        comps = unique[:30]

        # ── Basic I/O connections ─────────────────
        if not conns:
            inputs  = [c for c in comps if c['type'] in ('input','clock')]
            outputs = [c for c in comps if c['type'] == 'output']
            logic   = [c for c in comps if c['type'] not in ('input','output','clock')]
            for inp in inputs:
                for lg in logic[:4]:
                    conns.append({'from_comp':inp['id'],'to_comp':lg['id'],
                                  'signal_name':inp['id'],'is_bus':False,'bus_width':1})
            for lg in logic:
                for out in outputs[:2]:
                    conns.append({'from_comp':lg['id'],'to_comp':out['id'],
                                  'signal_name':out['id'],'is_bus':False,'bus_width':1})

        # ── Determine circuit type ────────────────
        has_ff = any(c['type'] in ('dff','tff','register','counter') for c in comps)
        ctype  = 'sequential' if has_ff else 'combinational'

        result = {
            'circuit_type':  ctype,
            'description':   f"{module_name} — {modeling_type.replace('_',' ')} style",
            'components':    comps,
            'connections':   conns,
        }
        return self._layout(result)