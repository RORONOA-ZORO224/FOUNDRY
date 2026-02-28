from groq import Groq
from config import Config

class ErrorFixer:
    """Fix Verilog compilation errors using AI."""
    
    def __init__(self):
        self.client = Groq(api_key=Config.GROQ_API_KEY)
    
    def fix(self, verilog_code, error_messages, module_name, attempt=1):
        """
        Generate a fix for Verilog compilation errors.
        
        Args:
            verilog_code: The broken Verilog code
            error_messages: List of error strings from compiler
            module_name: Name of the module
            attempt: Which fix attempt this is (1-3)
            
        Returns:
            dict with fixed_code or None if failed
        """
        
        if attempt > Config.MAX_FIX_ATTEMPTS:
            return {
                'success': False,
                'error': f'Max fix attempts ({Config.MAX_FIX_ATTEMPTS}) reached'
            }
        
        # Format errors for the prompt
        error_text = "\n".join([f"- {err}" for err in error_messages])
        
        prompt = f"""The following Verilog code has compilation errors:
```verilog
{verilog_code}
```

COMPILATION ERRORS:
{error_text}

Your task:
1. Identify the exact cause of each error
2. Fix ONLY what's broken - don't rewrite the entire module
3. Maintain the original design intent
4. Follow Verilog best practices

Common error types and fixes:
- "syntax error" → Check semicolons, parentheses, commas
- "undeclared identifier" → Add missing signal declarations
- "illegal assignment" → Check reg vs wire, blocking vs non-blocking
- "sensitivity list" → Use @(*) for combinational, @(posedge clk) for sequential
- "latch inferred" → Add else clause in combinational always blocks

Return ONLY the corrected Verilog code in a code block. No explanation needed.
```verilog
// Your fixed code here
```
"""
        
        try:
            response = self.client.chat.completions.create(
                model=Config.MODEL_NAME,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a Verilog debugging expert. Fix compilation errors precisely without changing working code."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                max_tokens=Config.MAX_TOKENS,
                temperature=Config.FIX_TEMPERATURE,  # Lower temp = more careful
            )
            
            fixed_code = self._extract_verilog(response.choices[0].message.content)
            
            return {
                'success': True,
                'fixed_code': fixed_code,
                'attempt': attempt
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'attempt': attempt
            }
    
    def _extract_verilog(self, text):
        """Extract Verilog code from markdown fence."""
        if '```verilog' in text:
            code = text.split('```verilog')[1].split('```')[0]
        elif '```' in text:
            parts = text.split('```')
            if len(parts) >= 3:
                code = parts[1]
                # Skip language identifier if present
                if code.startswith('verilog\n'):
                    code = code[8:]
                elif code.startswith('v\n'):
                    code = code[2:]
            else:
                code = text
        else:
            code = text
        
        return code.strip()


# Quick test
if __name__ == "__main__":
    print("🧪 Testing ErrorFixer...\n")
    
    # Sample broken code
    broken_code = """module test (
    input a,
    input b
    output c  // Missing semicolon!
);
    assign c = a & b;
endmodule"""
    
    errors = [
        "test.v:4: syntax error",
        "test.v:4: error: Invalid module item."
    ]
    
    fixer = ErrorFixer()
    result = fixer.fix(broken_code, errors, "test")
    
    if result['success']:
        print("✅ Fix generated!")
        print(f"\nFixed code:\n{result['fixed_code']}\n")
    else:
        print(f"❌ Fix failed: {result['error']}")
