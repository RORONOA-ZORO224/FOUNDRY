import re

class FPGAEstimator:
    """Estimate FPGA resource usage."""
    
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
        luts = 0
        ffs = 0
        brams = 0
        dsps = 0
        
        # Count registers
        regs = re.findall(r'reg\s+(?:\[\d+:\d+\]\s+)?(\w+)', verilog_code)
        ffs += len(regs) * 8
        
        # Count logic
        assigns = len(re.findall(r'assign\s+', verilog_code))
        luts += assigns * 2
        
        always_blocks = len(re.findall(r'always\s*@', verilog_code))
        luts += always_blocks * 5
        
        # Count operators
        ops = {
            r'\+': 1.5, r'-': 1.5, r'\*': 14, r'/': 20, r'%': 15,
            r'&': 0.5, r'\|': 0.5, r'\^': 0.5,
            r'<<': 1, r'>>': 1,
            r'==': 2, r'!=': 2, r'<': 2, r'>': 2
        }
        
        for op, cost in ops.items():
            count = len(re.findall(op, verilog_code))
            if op == r'\*':
                dsps += count
            else:
                luts += int(count * cost)
        
        # Count memory
        memories = re.findall(r'reg\s+\[(\d+):(\d+)\]\s+\w+\s*\[(\d+):(\d+)\]', verilog_code)
        for mem in memories:
            width = int(mem[0]) - int(mem[1]) + 1
            depth = int(mem[2]) - int(mem[3]) + 1
            total_bits = width * depth
            if total_bits > 512:
                brams += (total_bits + 18000 - 1) // 18000
        
        luts = max(1, int(luts))
        ffs = max(1, int(ffs))
        
        # Check which FPGAs fit
        fits = []
        for fpga, resources in self.FPGA_FAMILIES.items():
            if (luts <= resources['LUTs'] and 
                ffs <= resources['FFs'] and
                brams <= resources['BRAMs'] and
                dsps <= resources['DSPs']):
                utilization = max(
                    luts / resources['LUTs'],
                    ffs / resources['FFs']
                ) * 100
                fits.append({
                    'fpga': fpga,
                    'utilization': round(utilization, 1)
                })
        
        return {
            'luts': luts,
            'ffs': ffs,
            'brams': brams,
            'dsps': dsps,
            'fits': sorted(fits, key=lambda x: x['utilization'])
        }
