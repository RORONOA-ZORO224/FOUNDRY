import re

class LearningExplainer:
    """Generate line-by-line explanations - simple version."""
    
    def explain(self, verilog_code):
        """Generate explanations for each line."""
        try:
            explanations = []
            lines = verilog_code.split('\n')
            
            for i, line in enumerate(lines, 1):
                stripped = line.strip()
                if not stripped or stripped.startswith('//'):
                    continue
                
                # Determine category and explanation
                category = 'logic'
                explanation = 'Verilog code line'
                
                if 'module' in stripped:
                    category = 'declaration'
                    explanation = 'Module declaration - defines the hardware block name and interface'
                elif 'input' in stripped:
                    category = 'port'
                    explanation = 'Input port - data coming into the module'
                elif 'output' in stripped:
                    category = 'port'
                    explanation = 'Output port - data going out of the module'
                elif 'reg' in stripped:
                    category = 'declaration'
                    explanation = 'Register declaration - storage element that holds state'
                elif 'wire' in stripped:
                    category = 'declaration'
                    explanation = 'Wire declaration - combinational connection between logic'
                elif 'always @(posedge' in stripped or 'always @(negedge' in stripped:
                    category = 'sequential'
                    explanation = 'Sequential logic block - triggered on clock edge, implements flip-flops'
                elif 'always @' in stripped:
                    category = 'combinational'
                    explanation = 'Combinational logic block - output changes immediately with inputs'
                elif 'assign' in stripped:
                    category = 'combinational'
                    explanation = 'Continuous assignment - combinational logic statement'
                elif 'case' in stripped:
                    category = 'logic'
                    explanation = 'Case statement - multiplexer logic for selecting between options'
                elif 'if' in stripped:
                    category = 'logic'
                    explanation = 'Conditional statement - creates multiplexer logic'
                elif 'endmodule' in stripped:
                    category = 'declaration'
                    explanation = 'End of module declaration'
                
                explanations.append({
                    'line': i,
                    'code': line,
                    'explanation': explanation,
                    'category': category
                })
            
            return explanations
            
        except Exception as e:
            print(f"Learning explanation error: {e}")
            # Return minimal fallback
            return [
                {
                    'line': 1,
                    'code': verilog_code.split('\n')[0] if verilog_code else '',
                    'explanation': 'Code explanation unavailable',
                    'category': 'logic'
                }
            ]
