"""
validator/waveform_converter.py
Converts VCD (Value Change Dump) output from Icarus Verilog into
a clean JSON structure for the frontend WaveformViewer.

ROOT-CAUSE FIX (duplicate signals):
  Old parsers built a *list* and appended once during $var declaration
  AND again during $dumpvars / value-change parsing → every signal appeared
  twice.  This version uses a dict keyed by signal name throughout and only
  converts to a list at the very end, so duplicates are impossible.
"""

import re


class WaveformConverter:

    def vcd_to_json(self, vcd_content: str) -> dict:
        """Parse VCD text and return waveform JSON safe for the frontend."""

        if not vcd_content or not vcd_content.strip():
            return {"signals": [], "max_time": 100, "timeunit": "ns"}

        # ── 1. Parse header ──────────────────────────────────────────────────
        timescale = self._extract_timescale(vcd_content)

        # id_info maps VCD symbol → {name, width}
        id_info: dict[str, dict] = {}
        self._parse_var_declarations(vcd_content, id_info)

        if not id_info:
            return {"signals": [], "max_time": 100, "timeunit": timescale}

        # ── 2. Parse value changes ───────────────────────────────────────────
        # values_by_id maps VCD symbol → [ {time, value}, … ]  (ordered)
        values_by_id: dict[str, list] = {sym: [] for sym in id_info}
        max_time = self._parse_value_changes(vcd_content, id_info, values_by_id)

        # ── 3. Build output — ONE entry per signal name ──────────────────────
        # If two VCD symbols map to the same signal name (shouldn't happen in
        # a well-formed VCD, but let's be safe), keep the one with more events.
        by_name: dict[str, dict] = {}
        for sym, info in id_info.items():
            name = info["name"]
            entry = {
                "name":   name,
                "width":  info["width"],
                "values": values_by_id.get(sym, []),
            }
            if name not in by_name:
                by_name[name] = entry
            else:
                # Keep whichever entry has more data points
                if len(entry["values"]) > len(by_name[name]["values"]):
                    by_name[name] = entry

        signals = list(by_name.values())

        # Sort: inputs first (a, b, …), then outputs (out, …), then others
        signals.sort(key=lambda s: (
            0 if s["name"] in ("clk", "rst", "reset", "clock") else
            1 if not s["name"].startswith("out") else
            2
        ))

        return {
            "signals":  signals,
            "max_time": max_time if max_time > 0 else 100,
            "timeunit": timescale,
        }

    # ────────────────────────────────────────────────────────────────────────
    # Internal helpers
    # ────────────────────────────────────────────────────────────────────────

    def _extract_timescale(self, vcd: str) -> str:
        m = re.search(r'\$timescale\s+(\S+)\s*\$end', vcd)
        if m:
            ts = m.group(1)
            # strip numeric prefix → keep unit only
            unit = re.sub(r'[\d\s]+', '', ts).strip() or "ns"
            return unit
        return "ns"

    def _parse_var_declarations(self, vcd: str, id_info: dict) -> None:
        """
        Populate id_info from $var lines.
        Format: $var <type> <width> <id_char> <name> [<index>] $end
        We normalise multi-bit names by stripping any trailing [N] index.
        """
        # Match: $var  wire/reg/…  <width>  <id>  <name>  [optional-index]  $end
        pattern = re.compile(
            r'\$var\s+'
            r'\w+\s+'           # type (wire / reg / integer / …)
            r'(\d+)\s+'         # width
            r'(\S+)\s+'         # id symbol
            r'(\w+)'            # name
            r'(?:\s+\[[\d:]+\])?'  # optional bit-select (ignored)
            r'\s*\$end',
            re.IGNORECASE
        )
        for m in pattern.finditer(vcd):
            width = int(m.group(1))
            sym   = m.group(2)
            name  = m.group(3)

            # Skip internal/testbench signals
            if name in ("testbench", "uut"):
                continue
            # Skip the module instance prefix if present
            # e.g. "testbench.uut.out" → "out"
            if '.' in name:
                name = name.split('.')[-1]

            # Only register first occurrence of a symbol
            if sym not in id_info:
                id_info[sym] = {"name": name, "width": width}

    def _parse_value_changes(
        self,
        vcd: str,
        id_info: dict,
        values_by_id: dict,
    ) -> int:
        """
        Walk through the VCD body (after $enddefinitions) and collect
        {time, value} pairs per symbol.  Returns the maximum timestamp seen.
        """
        # Fast-forward to after $enddefinitions
        body_start = vcd.find("$enddefinitions")
        if body_start == -1:
            body_start = 0
        else:
            body_start = vcd.find("$end", body_start) + len("$end")

        current_time = 0
        max_time     = 0

        for line in vcd[body_start:].splitlines():
            line = line.strip()
            if not line or line.startswith("//"):
                continue

            # Timestamp
            if line.startswith("#"):
                try:
                    current_time = int(line[1:])
                    max_time = max(max_time, current_time)
                except ValueError:
                    pass
                continue

            # Skip VCD keywords
            if line.startswith("$"):
                continue

            # 1-bit value change: e.g.  0!  1"  xA
            if len(line) >= 2 and line[0] in "01xXzZ":
                val = line[0].lower()
                sym = line[1:]
                if sym in id_info:
                    values_by_id[sym].append({"time": current_time, "value": val})
                continue

            # Multi-bit (vector) value change: e.g.  b10101010 "   or  b1010 A
            if line.startswith(("b", "B", "r", "R")):
                parts = line.split()
                if len(parts) >= 2:
                    raw_val = parts[0][1:]   # strip leading b/B/r/R
                    sym     = parts[1]
                    if sym in id_info:
                        width = id_info[sym]["width"]
                        hex_val = self._bin_to_hex(raw_val, width)
                        values_by_id[sym].append({"time": current_time, "value": hex_val})
                continue

        return max_time

    # ── Value-format helpers ─────────────────────────────────────────────────

    def _bin_to_hex(self, bin_str: str, width: int) -> str:
        """Convert a VCD binary string (may contain x/z) to hex."""
        bin_str = bin_str.lower()

        # If entirely numeric binary → convert normally
        if re.fullmatch(r'[01]+', bin_str):
            try:
                val = int(bin_str, 2)
                return f"0x{val:X}"
            except ValueError:
                pass

        # Contains x or z → fall back to per-nibble conversion
        # Pad to full width
        padded = bin_str.zfill(width)
        hex_chars = []
        for i in range(0, len(padded), 4):
            nibble = padded[i:i+4]
            if 'x' in nibble:
                hex_chars.append('x')
            elif 'z' in nibble:
                hex_chars.append('z')
            else:
                try:
                    hex_chars.append(f"{int(nibble, 2):X}")
                except ValueError:
                    hex_chars.append('x')

        return "0x" + "".join(hex_chars) if hex_chars else "0x0"