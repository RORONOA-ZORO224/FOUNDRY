import subprocess
import os
import tempfile
import re
from pathlib import Path


class VerilogValidator:
    """Validates Verilog using Icarus Verilog."""

    def __init__(self):
        self.check_tools()

    def check_tools(self):
        """Verify iverilog and vvp are installed."""
        try:
            subprocess.run(['iverilog', '-v'], capture_output=True)
            subprocess.run(['vvp', '-v'], capture_output=True)
        except FileNotFoundError:
            raise RuntimeError(
                "Icarus Verilog not found. Install: sudo apt-get install iverilog"
            )

    def validate_syntax(self, verilog_code, module_name="top"):
        """
        Compile Verilog code and check for syntax errors.
        Returns: (success: bool, errors: list[str])
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            vfile = Path(tmpdir) / f"{module_name}.v"
            vfile.write_text(verilog_code)

            result = subprocess.run(
                ['iverilog', '-o', f'{tmpdir}/out.vvp', str(vfile)],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                return True, []
            else:
                errors = self.parse_errors(result.stderr)
                return False, errors

    def simulate(self, verilog_code, testbench_code, module_name="top"):
        """
        Run simulation with testbench.
        Returns: (success: bool, vcd_file: str, output: str)
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            # Write files
            vfile = Path(tmpdir) / f"{module_name}.v"
            tbfile = Path(tmpdir) / "testbench.v"

            vfile.write_text(verilog_code)
            tbfile.write_text(testbench_code)

            # Compile
            compile_result = subprocess.run(
                ['iverilog', '-o', f'{tmpdir}/sim.vvp', str(vfile), str(tbfile)],
                capture_output=True,
                text=True,
                timeout=30
            )

            if compile_result.returncode != 0:
                return False, None, compile_result.stderr

            # Simulate
            sim_result = subprocess.run(
                ['vvp', f'{tmpdir}/sim.vvp'],
                capture_output=True,
                text=True,
                timeout=60
            )

            # Check for VCD file
            vcd_file = Path(tmpdir) / "waves.vcd"
            vcd_content = None

            if vcd_file.exists():
                vcd_content = vcd_file.read_text()

            return True, vcd_content, sim_result.stdout

    def parse_errors(self, stderr):
        """Extract meaningful error messages from iverilog output."""
        errors = []

        for line in stderr.split('\n'):
            line = line.strip()

            if 'error:' in line.lower() or 'syntax error' in line.lower():
                match = re.search(r':(\d+):', line)

                if match:
                    line_no = match.group(1)
                    errors.append(f"Line {line_no}: {line}")
                else:
                    errors.append(line)

        return errors if errors else [stderr]


# ---------------------------
# Quick Test
# ---------------------------
if __name__ == "__main__":
    validator = VerilogValidator()

    # Test with simple valid code
    code = """
module test (
    input  a,
    input  b,
    output c
);
    assign c = a & b;
endmodule
"""

    success, errors = validator.validate_syntax(code, "test")

    print(f"Validation: {'✅ PASS' if success else '❌ FAIL'}")

    if errors:
        for err in errors:
            print(f"  {err}")