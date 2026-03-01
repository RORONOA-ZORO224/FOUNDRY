import re

class FPGAEstimator:
    """Estimate FPGA resources - simple version."""
    
    FPGA_FAMILIES = {
        'iCE40-HX1K': {'LUTs': 1280, 'FFs': 1280, 'BRAMs': 16, 'DSPs': 0},
        'iCE40-HX8K': {'LUTs': 7680, 'FFs': 7680, 'BRAMs': 128, 'DSPs': 0},
        'Spartan-7-15T': {'LUTs': 12800, 'FFs': 20000, 'BRAMs': 360, 'DSPs': 20},
        'Artix-7-35T': {'LUTs': 20800, 'FFs': 41600, 'BRAMs': 900, 'DSPs': 90},
        'Zynq-7010': {'LUTs': 17600, 'FFs': 35200, 'BRAMs': 1800, 'DSPs': 80},
        'Zynq-7020': {'LUTs': 53200, 'FFs': 106400, 'BRAMs': 2100, 'DSPs': 220}
    }
    
    def estimate(self, verilog_code):
        """Estimate resource usage."""
        try:
            luts = 10  # Base
            ffs = 10   # Base
            brams = 0
            dsps = 0
            
            # Count lines of actual code
            lines = [l for l in verilog_code.split('\n') if l.strip() and not l.strip().startswith('//')]
            luts += len(lines) * 2
            
            # Count registers
            regs = len(re.findall(r'\breg\b', verilog_code))
            ffs += regs * 8
            
            # Count always blocks
            always = len(re.findall(r'\balways\b', verilog_code))
            luts += always * 10
            
            # Count operations
            luts += len(re.findall(r'[+\-&|^]', verilog_code)) * 2
            
            # Count multiplications
            mult = len(re.findall(r'\*', verilog_code))
            if mult > 0:
                dsps = mult
                luts += mult * 5
            
            # Ensure minimum values
            luts = max(50, luts)
            ffs = max(30, ffs)
            
            # Find compatible FPGAs
            fits = []
            for fpga, resources in self.FPGA_FAMILIES.items():
                if (luts <= resources['LUTs'] and 
                    ffs <= resources['FFs'] and
                    brams <= resources['BRAMs'] and
                    dsps <= resources['DSPs']):
                    
                    util = max(
                        (luts / resources['LUTs']) * 100,
                        (ffs / resources['FFs']) * 100
                    )
                    
                    fits.append({
                        'fpga': fpga,
                        'utilization': round(util, 1)
                    })
            
            # Sort by utilization
            fits.sort(key=lambda x: x['utilization'])
            
            return {
                'luts': luts,
                'ffs': ffs,
                'brams': brams,
                'dsps': dsps,
                'fits': fits
            }
        except Exception as e:
            print(f"FPGA estimation error: {e}")
            return {
                'luts': 100,
                'ffs': 50,
                'brams': 0,
                'dsps': 0,
                'fits': []
            }
