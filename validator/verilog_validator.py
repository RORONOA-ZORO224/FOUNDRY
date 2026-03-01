import subprocess
import tempfile
import os
import platform

class VerilogValidator:
    """Validate and simulate Verilog code."""
    
    def __init__(self):
        self.shell = platform.system() == 'Windows'
    
    def validate_syntax(self, verilog_code, module_name='top'):
        """Compile Verilog and check for syntax errors."""
        with tempfile.TemporaryDirectory() as tmpdir:
            verilog_file = os.path.join(tmpdir, f'{module_name}.v')
            
            with open(verilog_file, 'w') as f:
                f.write(verilog_code)
            
            try:
                result = subprocess.run(
                    ['iverilog', '-o', os.path.join(tmpdir, 'output.vvp'), verilog_file],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    shell=self.shell
                )
                
                if result.returncode == 0:
                    return True, []
                else:
                    errors = self._parse_errors(result.stderr)
                    return False, errors
                    
            except subprocess.TimeoutExpired:
                return False, ['Compilation timeout']
            except Exception as e:
                return False, [f'Compilation error: {str(e)}']
    
    def simulate(self, verilog_code, testbench_code, module_name='top'):
        """
        Simulate Verilog with testbench.
        Returns: (success, vcd_content, output)
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            # Write Verilog files
            verilog_file = os.path.join(tmpdir, f'{module_name}.v')
            testbench_file = os.path.join(tmpdir, 'testbench.v')
            output_file = os.path.join(tmpdir, 'sim.vvp')
            vcd_file = os.path.join(tmpdir, 'waves.vcd')
            
            with open(verilog_file, 'w') as f:
                f.write(verilog_code)
            
            with open(testbench_file, 'w') as f:
                f.write(testbench_code)
            
            try:
                # Compile
                print(f"📝 Compiling {module_name}...")
                compile_result = subprocess.run(
                    ['iverilog', '-o', output_file, verilog_file, testbench_file],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    shell=self.shell,
                    cwd=tmpdir
                )
                
                if compile_result.returncode != 0:
                    print(f"❌ Compilation failed")
                    return False, None, compile_result.stderr
                
                print(f"✅ Compilation successful")
                
                # Simulate
                print(f"🧪 Running simulation...")
                sim_result = subprocess.run(
                    ['vvp', output_file],
                    capture_output=True,
                    text=True,
                    timeout=60,
                    shell=self.shell,
                    cwd=tmpdir
                )
                
                print(f"✅ Simulation complete")
                
                # Read VCD file if it exists
                vcd_content = None
                if os.path.exists(vcd_file):
                    print(f"📊 Reading VCD file...")
                    with open(vcd_file, 'r') as f:
                        vcd_content = f.read()
                    print(f"✅ VCD file read: {len(vcd_content)} bytes")
                else:
                    print(f"⚠️ VCD file not found at {vcd_file}")
                    # List directory contents for debugging
                    print(f"Directory contents: {os.listdir(tmpdir)}")
                
                output = sim_result.stdout + sim_result.stderr
                success = sim_result.returncode == 0
                
                return success, vcd_content, output
                
            except subprocess.TimeoutExpired:
                print(f"❌ Simulation timeout")
                return False, None, 'Simulation timeout'
            except Exception as e:
                print(f"❌ Simulation error: {e}")
                return False, None, f'Simulation error: {str(e)}'
    
    def _parse_errors(self, stderr):
        """Parse compiler error messages."""
        errors = []
        for line in stderr.split('\n'):
            line = line.strip()
            if line and ('error' in line.lower() or 'syntax' in line.lower()):
                errors.append(line)
        return errors if errors else [stderr.strip()]


# Test
if __name__ == "__main__":
    print("🧪 Testing VerilogValidator...\n")
    
    validator = VerilogValidator()
    
    code = """
module counter(
    input clk,
    input rst,
    output reg [3:0] count
);
    always @(posedge clk) begin
        if (rst)
            count <= 4'd0;
        else
            count <= count + 1;
    end
endmodule
"""
    
    testbench = """
module testbench;
    reg clk, rst;
    wire [3:0] count;
    
    counter uut(
        .clk(clk),
        .rst(rst),
        .count(count)
    );
    
    initial begin
        $dumpfile("waves.vcd");
        $dumpvars(0, testbench);
        
        clk = 0;
        rst = 1;
        #10 rst = 0;
    end
    
    always #5 clk = ~clk;
    
    initial begin
        #100;
        $display("Simulation complete");
        $finish;
    end
endmodule
"""
    
    # Test validation
    print("=" * 60)
    print("TEST 1: VALIDATION")
    print("=" * 60)
    valid, errors = validator.validate_syntax(code, "counter")
    print(f"\nResult: {'✅ VALID' if valid else '❌ INVALID'}")
    if errors:
        print(f"Errors: {errors}")
    
    # Test simulation
    print("\n" + "=" * 60)
    print("TEST 2: SIMULATION")
    print("=" * 60)
    success, vcd_content, output = validator.simulate(code, testbench, "counter")
    
    print(f"\nResult: {'✅ SUCCESS' if success else '❌ FAILED'}")
    print(f"VCD Content: {len(vcd_content) if vcd_content else 0} bytes")
    print(f"Output Preview:\n{output[:300]}")
    
    if vcd_content:
        print("\n" + "=" * 60)
        print("VCD FILE PREVIEW (first 200 chars):")
        print("=" * 60)
        print(vcd_content[:200])
        print("...")
        print("\n✅ ✅ ✅ WAVEFORM DATA IS AVAILABLE! ✅ ✅ ✅")
    else:
        print("\n❌ ❌ ❌ NO VCD CONTENT GENERATED ❌ ❌ ❌")
