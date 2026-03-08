import re
import json
from groq import Groq
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'genai'))
from config import Config

class AdvancedLearningExplainer:
    """Advanced learning mode with variable tracking and concepts."""
    
    def __init__(self):
        self.client = Groq(api_key=Config.GROQ_API_KEY)
    
    def explain(self, verilog_code):
        """Generate comprehensive explanations."""
        
        # Parse code structure
        structure = self._parse_structure(verilog_code)
        
        # Track variables
        variables = self._track_variables(verilog_code)
        
        # Generate AI explanations
        line_explanations = self._generate_line_explanations(verilog_code)
        
        # Extract concepts
        concepts = self._extract_concepts(verilog_code)
        
        # Generate quiz questions
        quiz = self._generate_quiz(verilog_code)
        
        return {
            'lines': line_explanations,
            'variables': variables,
            'concepts': concepts,
            'structure': structure,
            'quiz': quiz
        }
    
    def _parse_structure(self, code):
        """Parse code structure."""
        return {
            'module_name': self._extract_module_name(code),
            'num_inputs': len(re.findall(r'\binput\b', code)),
            'num_outputs': len(re.findall(r'\boutput\b', code)),
            'has_sequential': 'always @(posedge' in code or 'always @(negedge' in code,
            'has_combinational': 'assign' in code or 'always @(' in code,
            'complexity': self._estimate_complexity(code)
        }
    
    def _extract_module_name(self, code):
        """Extract module name."""
        match = re.search(r'module\s+(\w+)', code)
        return match.group(1) if match else 'unknown'
    
    def _estimate_complexity(self, code):
        """Estimate code complexity."""
        lines = len([l for l in code.split('\n') if l.strip() and not l.strip().startswith('//')])
        
        if lines < 20:
            return 'simple'
        elif lines < 50:
            return 'moderate'
        else:
            return 'complex'
    
    def _track_variables(self, code):
        """Track all variables and their properties."""
        variables = []
        
        # Track inputs
        for match in re.finditer(r'input\s+(?:\[(\d+):(\d+)\]\s+)?(\w+)', code):
            width = 1
            if match.group(1) and match.group(2):
                width = int(match.group(1)) - int(match.group(2)) + 1
            
            variables.append({
                'name': match.group(3),
                'type': 'input',
                'width': width,
                'description': f'{width}-bit input signal'
            })
        
        # Track outputs
        for match in re.finditer(r'output\s+(?:reg\s+)?(?:\[(\d+):(\d+)\]\s+)?(\w+)', code):
            width = 1
            if match.group(1) and match.group(2):
                width = int(match.group(1)) - int(match.group(2)) + 1
            
            is_reg = 'output reg' in code
            
            variables.append({
                'name': match.group(3),
                'type': 'output',
                'width': width,
                'storage': 'register' if is_reg else 'wire',
                'description': f'{width}-bit output signal'
            })
        
        # Track internal registers
        for match in re.finditer(r'reg\s+(?:\[(\d+):(\d+)\]\s+)?(\w+)', code):
            width = 1
            if match.group(1) and match.group(2):
                width = int(match.group(1)) - int(match.group(2)) + 1
            
            name = match.group(3)
            if not any(v['name'] == name for v in variables):
                variables.append({
                    'name': name,
                    'type': 'internal',
                    'width': width,
                    'storage': 'register',
                    'description': f'{width}-bit internal register'
                })
        
        # Track wires
        for match in re.finditer(r'wire\s+(?:\[(\d+):(\d+)\]\s+)?(\w+)', code):
            width = 1
            if match.group(1) and match.group(2):
                width = int(match.group(1)) - int(match.group(2)) + 1
            
            variables.append({
                'name': match.group(3),
                'type': 'internal',
                'width': width,
                'storage': 'wire',
                'description': f'{width}-bit internal wire'
            })
        
        return variables
    
    def _generate_line_explanations(self, code):
        """Generate line-by-line explanations using AI."""
        
        lines = code.strip().split('\n')
        explanations = []
        
        # Use AI for better explanations
        prompt = f"""You are a hardware design teacher. Explain this Verilog code line by line for students.

CODE:
{code}

Return JSON array:
[
  {{"line": 1, "code": "...", "explanation": "...", "category": "declaration", "concept": "module"}},
  ...
]

Categories: declaration, port, signal, sequential, combinational, logic, control
Concepts: module, port, register, wire, always_block, assign, clock, reset, combinational_logic, sequential_logic, state_machine, arithmetic

Be educational and clear. Return ONLY the JSON array."""

        try:
            response = self.client.chat.completions.create(
                model=Config.MODEL_NAME,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4000,
                temperature=0.3
            )
            
            content = response.choices[0].message.content
            
            # Extract JSON
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0]
            elif '```' in content:
                content = content.split('```')[1].split('```')[0]
            
            explanations = json.loads(content.strip())
            
        except Exception as e:
            print(f"AI explanation failed: {e}, using fallback")
            # Fallback to simple explanations
            for i, line in enumerate(lines, 1):
                if line.strip():
                    explanations.append({
                        'line': i,
                        'code': line,
                        'explanation': self._simple_explain_line(line),
                        'category': self._categorize_line(line),
                        'concept': 'basic'
                    })
        
        return explanations
    
    def _simple_explain_line(self, line):
        """Simple line explanation fallback."""
        stripped = line.strip()
        
        if 'module' in stripped:
            return 'Declares the module (hardware block) and its interface'
        elif 'input' in stripped:
            return 'Input port - data coming into the module'
        elif 'output' in stripped:
            return 'Output port - data going out of the module'
        elif 'reg' in stripped:
            return 'Register - storage element that holds state across clock cycles'
        elif 'wire' in stripped:
            return 'Wire - combinational connection, no storage'
        elif 'always @(posedge' in stripped:
            return 'Sequential logic block triggered on positive clock edge (creates flip-flops)'
        elif 'always @' in stripped:
            return 'Combinational logic block - output changes with input'
        elif 'assign' in stripped:
            return 'Continuous assignment - implements combinational logic'
        elif 'case' in stripped:
            return 'Case statement - selects between multiple options (multiplexer)'
        elif 'if' in stripped:
            return 'Conditional statement - creates selection logic'
        else:
            return 'Verilog statement'
    
    def _categorize_line(self, line):
        """Categorize a line of code."""
        stripped = line.strip().lower()
        
        if 'module' in stripped or 'endmodule' in stripped:
            return 'declaration'
        elif 'input' in stripped or 'output' in stripped:
            return 'port'
        elif 'reg' in stripped or 'wire' in stripped:
            return 'signal'
        elif 'always @(posedge' in stripped or 'always @(negedge' in stripped:
            return 'sequential'
        elif 'always @' in stripped:
            return 'combinational'
        elif 'assign' in stripped:
            return 'combinational'
        elif 'case' in stripped or 'if' in stripped:
            return 'control'
        else:
            return 'logic'
    
    def _extract_concepts(self, code):
        """Extract hardware design concepts used."""
        concepts = []
        
        if re.search(r'always\s*@\s*\(posedge', code):
            concepts.append({
                'name': 'Sequential Logic',
                'description': 'Logic that depends on clock edges and maintains state',
                'found_in': 'always @(posedge) blocks'
            })
        
        if 'assign' in code:
            concepts.append({
                'name': 'Combinational Logic',
                'description': 'Logic where output immediately follows input changes',
                'found_in': 'assign statements'
            })
        
        if re.search(r'\bcase\b', code):
            concepts.append({
                'name': 'Multiplexer',
                'description': 'Selects one of many inputs based on control signal',
                'found_in': 'case statements'
            })
        
        if re.search(r'\+|\-', code):
            concepts.append({
                'name': 'Arithmetic',
                'description': 'Mathematical operations implemented in hardware',
                'found_in': 'arithmetic operators (+, -)'
            })
        
        if re.search(r'&|\||\^', code):
            concepts.append({
                'name': 'Boolean Logic',
                'description': 'AND, OR, XOR operations on bits',
                'found_in': 'bitwise operators'
            })
        
        return concepts
    
    def _generate_quiz(self, code):
        """Generate quiz questions."""
        quiz = []
        
        # Count inputs
        num_inputs = len(re.findall(r'\binput\b', code))
        quiz.append({
            'question': 'How many input ports does this module have?',
            'answer': str(num_inputs),
            'type': 'number'
        })
        
        # Check if sequential
        is_sequential = bool(re.search(r'always\s*@\s*\(posedge', code))
        quiz.append({
            'question': 'Does this design contain sequential logic (flip-flops)?',
            'answer': 'Yes' if is_sequential else 'No',
            'type': 'boolean'
        })
        
        # Check for specific features
        has_mux = bool(re.search(r'\bcase\b|\?', code))
        if has_mux:
            quiz.append({
                'question': 'What hardware structure is implemented by case statements?',
                'answer': 'Multiplexer',
                'type': 'text'
            })
        
        return quiz
