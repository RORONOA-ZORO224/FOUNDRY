from groq import Groq
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'genai'))
from config import Config
import json

class LearningExplainer:
    """Generate line-by-line explanations."""
    
    def __init__(self):
        self.client = Groq(api_key=Config.GROQ_API_KEY)
    
    def explain(self, verilog_code):
        """Generate explanations for each line."""
        
        lines = verilog_code.strip().split('\n')
        
        prompt = f"""Explain this Verilog code line by line for a student.

CODE:
{verilog_code}

Return a JSON array with this format:
[
  {{"line": 1, "code": "module ...", "explanation": "This declares a module named...", "category": "declaration"}},
  {{"line": 2, "code": "input ...", "explanation": "This is an input port...", "category": "port"}},
  ...
]

Categories: declaration, port, logic, sequential, combinational, structural

Provide clear, educational explanations. Return ONLY the JSON array, no other text."""
        
        try:
            response = self.client.chat.completions.create(
                model=Config.MODEL_NAME,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=3000,
                temperature=0.3
            )
            
            content = response.choices[0].message.content
            
            # Try to extract JSON
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0]
            elif '```' in content:
                content = content.split('```')[1].split('```')[0]
            
            explanations = json.loads(content.strip())
            return explanations
            
        except Exception as e:
            print(f"❌ Learning explanation failed: {e}")
            # Fallback: simple line-by-line
            return [
                {
                    'line': i + 1,
                    'code': line,
                    'explanation': 'Code explanation unavailable',
                    'category': 'logic'
                }
                for i, line in enumerate(lines) if line.strip()
            ]
