"""
fpga/estimator.py — Corrected FPGA resource estimator

Key fixes:
  - FFs counted only from clocked always blocks (not all regs)
  - Structural: scans ALL module bodies for FFs
  - Returns full component breakdown for UI
"""
import re


class FPGAEstimator:

    FPGA_FAMILIES = {
        'iCE40-HX1K':    {'LUTs': 1280,   'FFs': 1280,   'BRAMs': 16,   'DSPs': 0},
        'iCE40-HX8K':    {'LUTs': 7680,   'FFs': 7680,   'BRAMs': 128,  'DSPs': 0},
        'Spartan-7-15T': {'LUTs': 12800,  'FFs': 20000,  'BRAMs': 360,  'DSPs': 20},
        'Artix-7-35T':   {'LUTs': 20800,  'FFs': 41600,  'BRAMs': 900,  'DSPs': 90},
        'Zynq-7010':     {'LUTs': 17600,  'FFs': 35200,  'BRAMs': 1800, 'DSPs': 80},
        'Zynq-7020':     {'LUTs': 53200,  'FFs': 106400, 'BRAMs': 2100, 'DSPs': 220},
    }

    def estimate(self, verilog_code: str) -> dict:
        code = self._strip_comments(verilog_code)

        # ── Flip-flops (clocked regs only, across ALL modules) 
        ff_bits, ff_detail = self._count_ffs(code)

        # ── Primitive gates 
        gate_counts = self._count_gates(code)

        # ── Structural/combinational components 
        struct_counts = self._count_structural(code)

        # ── BRAMs & DSPs 
        brams = self._count_brams(code)
        dsps  = len(re.findall(r'\b\w+\s*\*\s*\w+', code))

        # ── LUT estimate 
        luts = self._estimate_luts(code, gate_counts, struct_counts, ff_bits, dsps)

        # ── Component list for UI 
        components = self._build_component_list(ff_detail, gate_counts, struct_counts, brams, dsps)

        # ── FPGA fit 
        fits = []
        for fpga, res in self.FPGA_FAMILIES.items():
            eff_luts = luts + (dsps * 14 if res['DSPs'] == 0 else 0)
            eff_dsps = dsps if res['DSPs'] > 0 else 0
            if (eff_luts <= res['LUTs'] and ff_bits <= res['FFs'] and
                    brams <= res['BRAMs'] and eff_dsps <= res['DSPs']):
                util = max(eff_luts / max(res['LUTs'], 1),
                           ff_bits / max(res['FFs'], 1)) * 100
                fits.append({'fpga': fpga, 'utilization': round(util, 1)})

        return {
            'luts':       max(1, luts),
            'ffs':        max(0, ff_bits),
            'brams':      brams,
            'dsps':       dsps,
            'components': components,
            'fits':       sorted(fits, key=lambda x: x['utilization']),
        }

    # ── FF counting 
    def _count_ffs(self, code: str):
        """
        Count flip-flops from ALL clocked always blocks across every module
        (handles structural designs with multiple modules in one file).
        """
        # Collect all reg declarations with widths
        all_regs = {}
        for m in re.finditer(r'\breg\b\s*(?:\[(\d+)\s*:\s*(\d+)\])?\s*(\w+)', code):
            hi, lo, name = m.group(1), m.group(2), m.group(3)
            width = (int(hi) - int(lo) + 1) if hi else 1
            all_regs[name] = width

        # To Find all clocked always block bodies
        clk_pattern = re.compile(
            r'always\s*@\s*\(\s*(?:posedge|negedge)\s+\w+[^)]*\)'
            r'\s*(?:begin\s+)?(.*?)(?=\balways\b|\bendmodule\b)',
            re.DOTALL | re.IGNORECASE,
        )

        ff_set = {}
        for blk in clk_pattern.finditer(code):
            body = blk.group(1)
            for m in re.finditer(r'\b(\w+)\s*(?:\[[^\]]+\])?\s*<=', body):
                name = m.group(1)
                if name in all_regs:
                    ff_set[name] = all_regs[name]

        # If structural and no clocked always found, check for DFF instantiations
        if not ff_set:
            for m in re.finditer(r'\b(?:d_?flip_?flop|dff|DFF|ff)\w*\s+\w+\s*\(', code):
                # Estimate 1 FF per instantiation
                ff_set[f'_inst_{m.start()}'] = 1

        detail = [{'name': n, 'bits': b, 'description': f"D flip-flop, {b}-bit register"}
                  for n, b in ff_set.items()]
        return sum(d['bits'] for d in detail), detail

    def _count_gates(self, code: str) -> dict:
        gates = {'and': 0, 'or': 0, 'not': 0, 'xor': 0,
                 'nand': 0, 'nor': 0, 'xnor': 0, 'buf': 0}
        for g in gates:
            gates[g] = len(re.findall(rf'\b{g}\b\s+\w+\s*\(', code))
        return gates

    def _count_structural(self, code: str) -> dict:
        c = {}
        c['mux']        = len(re.findall(r'\bcase\b', code))
        c['adder']      = len(re.findall(r'(?<![<>!])=\s*[^;]*\+', code))
        c['subtractor'] = len(re.findall(r'(?<![<>!])=\s*[^;]*-', code))
        c['comparator'] = len(re.findall(r'==|!=|<=|>=', code)) // 2
        c['decoder']    = len(re.findall(r'decode|one_hot', code, re.I))
        c['encoder']    = len(re.findall(r'encode|priority', code, re.I))
        c['shifter']    = len(re.findall(r'<<|>>', code))
        return c

    def _count_brams(self, code: str) -> int:
        count = 0
        for m in re.finditer(r'\breg\b\s*\[(\d+)\s*:\s*(\d+)\]\s*\w+\s*\[(\d+)\s*:\s*(\d+)\]', code):
            w = int(m.group(1)) - int(m.group(2)) + 1
            d = int(m.group(3)) - int(m.group(4)) + 1
            bits = w * d
            if bits > 512:
                count += max(1, (bits + 18431) // 18432)
        return count

    def _estimate_luts(self, code, gates, struct, ffs, dsps) -> int:
        luts = sum(gates.values())
        luts += struct.get('mux', 0) * 3
        luts += struct.get('adder', 0) * 4
        luts += struct.get('subtractor', 0) * 4
        luts += struct.get('comparator', 0) * 2
        luts += struct.get('decoder', 0) * 2
        luts += struct.get('encoder', 0) * 3
        luts += struct.get('shifter', 0)
        # Register output 
        luts += ffs // 2
        return max(1, luts)

    def _build_component_list(self, ff_detail, gates, struct, brams, dsps):
        items = []
        CAT = {
            'dff':       ('D Flip-Flop', '🔵', 'Sequential'),
            'and':       ('AND Gate',    '⚡', 'Gate-Level'),
            'or':        ('OR Gate',     '⚡', 'Gate-Level'),
            'not':       ('NOT Gate',    '⚡', 'Gate-Level'),
            'nand':      ('NAND Gate',   '⚡', 'Gate-Level'),
            'nor':       ('NOR Gate',    '⚡', 'Gate-Level'),
            'xor':       ('XOR Gate',    '⚡', 'Gate-Level'),
            'xnor':      ('XNOR Gate',   '⚡', 'Gate-Level'),
            'buf':       ('Buffer',      '⚡', 'Gate-Level'),
            'mux':       ('Multiplexer', '🔀', 'Combinational'),
            'adder':     ('Adder',       '➕', 'Arithmetic'),
            'subtractor':('Subtractor',  '➖', 'Arithmetic'),
            'comparator':('Comparator',  '⚖️', 'Arithmetic'),
            'decoder':   ('Decoder',     '📤', 'Combinational'),
            'encoder':   ('Encoder',     '📥', 'Combinational'),
            'shifter':   ('Shifter',     '↔️', 'Arithmetic'),
        }

        for ff in ff_detail:
            items.append({'name': f"D Flip-Flop ({ff['name']})", 'count': ff['bits'],
                          'description': ff['description'], 'icon': '🔵', 'category': 'Sequential'})

        for key, count in gates.items():
            if count > 0:
                label, icon, cat = CAT.get(key, (key.upper(), '⚡', 'Gate-Level'))
                items.append({'name': label, 'count': count,
                              'description': f"{count} {label.lower()}{'s' if count>1 else ''}",
                              'icon': icon, 'category': cat})

        for key, count in struct.items():
            if count > 0:
                label, icon, cat = CAT.get(key, (key, '🔲', 'Combinational'))
                items.append({'name': label, 'count': count,
                              'description': f"{count} {label.lower()}{'s' if count>1 else ''}",
                              'icon': icon, 'category': cat})

        if brams > 0:
            items.append({'name': 'Block RAM', 'count': brams,
                          'description': f"{brams}×18Kb BRAM", 'icon': '💾', 'category': 'Memory'})
        if dsps > 0:
            items.append({'name': 'DSP Block', 'count': dsps,
                          'description': f"{dsps} DSP48 multiplier unit{'s' if dsps>1 else ''}",
                          'icon': '✖️', 'category': 'Arithmetic'})

        return [i for i in items if i['count'] > 0]

    @staticmethod
    def _strip_comments(code: str) -> str:
        code = re.sub(r'//[^\n]*', '', code)
        code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
        return code