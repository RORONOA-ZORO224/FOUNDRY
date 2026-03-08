import re

class AdvancedFPGAEstimator:
    """Advanced FPGA analysis with timing, power, and detailed breakdown."""
    
    FPGA_FAMILIES = {
        'iCE40-HX1K': {
            'LUTs': 1280, 'FFs': 1280, 'BRAMs': 16, 'DSPs': 0,
            'max_freq_mhz': 275, 'power_mw_per_lut': 0.5, 'cost_usd': 3
        },
        'iCE40-HX8K': {
            'LUTs': 7680, 'FFs': 7680, 'BRAMs': 128, 'DSPs': 0,
            'max_freq_mhz': 250, 'power_mw_per_lut': 0.6, 'cost_usd': 12
        },
        'Spartan-7-15T': {
            'LUTs': 12800, 'FFs': 20000, 'BRAMs': 360, 'DSPs': 20,
            'max_freq_mhz': 450, 'power_mw_per_lut': 1.2, 'cost_usd': 25
        },
        'Artix-7-35T': {
            'LUTs': 20800, 'FFs': 41600, 'BRAMs': 900, 'DSPs': 90,
            'max_freq_mhz': 500, 'power_mw_per_lut': 1.5, 'cost_usd': 45
        },
        'Zynq-7010': {
            'LUTs': 17600, 'FFs': 35200, 'BRAMs': 1800, 'DSPs': 80,
            'max_freq_mhz': 650, 'power_mw_per_lut': 2.0, 'cost_usd': 85
        },
        'Zynq-7020': {
            'LUTs': 53200, 'FFs': 106400, 'BRAMs': 2100, 'DSPs': 220,
            'max_freq_mhz': 700, 'power_mw_per_lut': 2.5, 'cost_usd': 150
        }
    }
    
    def estimate(self, verilog_code):
        """Advanced resource estimation with timing and power."""
        
        # Basic resource counting
        resources = self._count_resources(verilog_code)
        
        # Timing analysis
        timing = self._estimate_timing(verilog_code, resources)
        
        # Power analysis
        power = self._estimate_power(resources)
        
        # Detailed breakdown
        breakdown = self._resource_breakdown(verilog_code)
        
        # Device compatibility
        fits = self._find_compatible_devices(resources, timing)
        
        return {
            'resources': resources,
            'timing': timing,
            'power': power,
            'breakdown': breakdown,
            'fits': fits,
            'recommendations': self._generate_recommendations(resources, timing, power)
        }
    
    def _count_resources(self, code):
        """Count basic resources."""
        luts = 20  # Base overhead
        ffs = 10
        brams = 0
        dsps = 0
        
        # Count registers
        regs = re.findall(r'\breg\s+(?:\[\d+:\d+\]\s+)?(\w+)', code)
        for reg in regs:
            width_match = re.search(rf'\[(\d+):(\d+)\]\s+{reg}', code)
            if width_match:
                width = int(width_match.group(1)) - int(width_match.group(2)) + 1
                ffs += width
            else:
                ffs += 1
        
        # Count always blocks (sequential logic)
        always_blocks = re.findall(r'always\s*@', code)
        luts += len(always_blocks) * 8
        
        # Count assigns (combinational logic)
        assigns = re.findall(r'assign\s+', code)
        luts += len(assigns) * 3
        
        # Count operations
        operations = {
            r'\+': 2,      # Addition
            r'-': 2,       # Subtraction  
            r'\*': 15,     # Multiplication (or DSP)
            r'/': 25,      # Division
            r'%': 20,      # Modulo
            r'&': 0.5,     # AND
            r'\|': 0.5,    # OR
            r'\^': 0.5,    # XOR
            r'~': 0.3,     # NOT
            r'<<': 1.5,    # Shift left
            r'>>': 1.5,    # Shift right
            r'==': 2,      # Equality
            r'!=': 2,      # Inequality
            r'<': 2,       # Less than
            r'>': 2,       # Greater than
            r'\?': 3       # Ternary/mux
        }
        
        for op, cost in operations.items():
            count = len(re.findall(op, code))
            if op == r'\*':
                # Multipliers can use DSP blocks
                dsps += count
                luts += count * 2  # Some control logic
            else:
                luts += int(count * cost)
        
        # Count case statements (mux logic)
        case_count = len(re.findall(r'\bcase\b', code))
        luts += case_count * 10
        
        # Count if statements
        if_count = len(re.findall(r'\bif\b', code))
        luts += if_count * 3
        
        # Count memory arrays
        memories = re.findall(r'reg\s+\[(\d+):(\d+)\]\s+\w+\s*\[(\d+):(\d+)\]', code)
        for mem in memories:
            width = int(mem[0]) - int(mem[1]) + 1
            depth = int(mem[2]) - int(mem[3]) + 1
            bits = width * depth
            if bits > 1024:
                brams += (bits + 18000 - 1) // 18000
            else:
                luts += (bits + 6 - 1) // 6  # Distributed RAM
        
        return {
            'luts': max(20, int(luts)),
            'ffs': max(10, int(ffs)),
            'brams': brams,
            'dsps': dsps
        }
    
    def _estimate_timing(self, code, resources):
        """Estimate timing characteristics."""
        
        # Count logic levels
        sequential_blocks = len(re.findall(r'always\s*@\s*\(posedge', code))
        combinational_depth = self._estimate_logic_depth(code)
        
        # Estimate maximum frequency (very rough)
        # Formula: base_freq / (1 + log(logic_depth) * routing_factor)
        import math
        base_freq = 800  # MHz (ideal)
        routing_penalty = 1 + math.log(max(1, combinational_depth)) * 0.3
        lut_penalty = 1 + (resources['luts'] / 10000) * 0.2
        
        estimated_fmax = base_freq / (routing_penalty * lut_penalty)
        
        # Critical path estimate (ns)
        critical_path_ns = 1000 / estimated_fmax
        
        return {
            'estimated_fmax_mhz': round(estimated_fmax, 1),
            'critical_path_ns': round(critical_path_ns, 2),
            'logic_levels': combinational_depth,
            'has_sequential': sequential_blocks > 0,
            'pipeline_stages': self._count_pipeline_stages(code)
        }
    
    def _estimate_logic_depth(self, code):
        """Estimate combinational logic depth."""
        # Count nested operations in assign statements
        max_depth = 1
        assigns = re.finditer(r'assign\s+\w+\s*=\s*(.+?);', code)
        for assign in assigns:
            expr = assign.group(1)
            # Count operators as rough depth measure
            depth = len(re.findall(r'[+\-*&|^]', expr))
            max_depth = max(max_depth, min(depth, 10))  # Cap at 10
        return max_depth
    
    def _count_pipeline_stages(self, code):
        """Count potential pipeline stages."""
        # Count sequential always blocks as pipeline stages
        return len(re.findall(r'always\s*@\s*\(posedge', code))
    
    def _estimate_power(self, resources):
        """Estimate power consumption."""
        
        # Static power (leakage) - roughly 50mW base
        static_power_mw = 50
        
        # Dynamic power
        # LUT switching: ~1.5mW per LUT at 100MHz
        # FF switching: ~0.8mW per FF at 100MHz
        # DSP: ~50mW per DSP at 100MHz
        # BRAM: ~10mW per BRAM
        
        dynamic_power_mw = (
            resources['luts'] * 1.5 +
            resources['ffs'] * 0.8 +
            resources['dsps'] * 50 +
            resources['brams'] * 10
        )
        
        total_power_mw = static_power_mw + dynamic_power_mw
        
        return {
            'static_mw': round(static_power_mw, 1),
            'dynamic_mw': round(dynamic_power_mw, 1),
            'total_mw': round(total_power_mw, 1),
            'total_w': round(total_power_mw / 1000, 3)
        }
    
    def _resource_breakdown(self, code):
        """Detailed resource breakdown by type."""
        
        return {
            'sequential': {
                'flip_flops': len(re.findall(r'always\s*@\s*\(posedge', code)),
                'registers': len(re.findall(r'\breg\b', code))
            },
            'combinational': {
                'assigns': len(re.findall(r'assign\s+', code)),
                'case_statements': len(re.findall(r'\bcase\b', code)),
                'if_statements': len(re.findall(r'\bif\b', code))
            },
            'arithmetic': {
                'adders': len(re.findall(r'\+', code)),
                'subtractors': len(re.findall(r'-', code)),
                'multipliers': len(re.findall(r'\*', code)),
                'comparators': len(re.findall(r'(==|!=|<|>)', code))
            },
            'storage': {
                'distributed_ram': 0,  # Would need more analysis
                'block_ram': len(re.findall(r'reg\s+\[\d+:\d+\]\s+\w+\s*\[\d+:\d+\]', code))
            }
        }
    
    def _find_compatible_devices(self, resources, timing):
        """Find compatible FPGA devices."""
        fits = []
        
        for fpga, specs in self.FPGA_FAMILIES.items():
            # Check resource fit
            if (resources['luts'] <= specs['LUTs'] and
                resources['ffs'] <= specs['FFs'] and
                resources['brams'] <= specs['BRAMs'] and
                resources['dsps'] <= specs['DSPs']):
                
                # Calculate utilization
                lut_util = (resources['luts'] / specs['LUTs']) * 100
                ff_util = (resources['ffs'] / specs['FFs']) * 100
                util = max(lut_util, ff_util)
                
                # Check timing
                meets_timing = timing['estimated_fmax_mhz'] <= specs['max_freq_mhz']
                timing_margin = specs['max_freq_mhz'] - timing['estimated_fmax_mhz']
                
                fits.append({
                    'fpga': fpga,
                    'utilization': round(util, 1),
                    'lut_utilization': round(lut_util, 1),
                    'ff_utilization': round(ff_util, 1),
                    'meets_timing': meets_timing,
                    'timing_margin_mhz': round(timing_margin, 1),
                    'max_freq_mhz': specs['max_freq_mhz'],
                    'estimated_cost_usd': specs['cost_usd']
                })
        
        return sorted(fits, key=lambda x: x['utilization'])
    
    def _generate_recommendations(self, resources, timing, power):
        """Generate optimization recommendations."""
        recommendations = []
        
        if timing['logic_levels'] > 5:
            recommendations.append({
                'type': 'timing',
                'severity': 'warning',
                'message': 'Deep combinational logic detected. Consider pipelining.',
                'action': 'Add registers to break up long combinational paths'
            })
        
        if resources['luts'] > 5000 and timing['pipeline_stages'] == 0:
            recommendations.append({
                'type': 'performance',
                'severity': 'info',
                'message': 'Large design without pipelining',
                'action': 'Consider adding pipeline stages to increase throughput'
            })
        
        if power['total_mw'] > 1000:
            recommendations.append({
                'type': 'power',
                'severity': 'warning',
                'message': 'High power consumption detected',
                'action': 'Consider clock gating or reducing switching activity'
            })
        
        if resources['dsps'] == 0 and len(re.findall(r'\*', '')) > 2:
            recommendations.append({
                'type': 'resource',
                'severity': 'info',
                'message': 'Multiple multiplications detected',
                'action': 'DSP blocks can be more efficient than LUT multipliers'
            })
        
        return recommendations
