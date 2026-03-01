from flask import Flask, request, jsonify
from flask_cors import CORS
from verilog_generator import VerilogGenerator
from testbench_generator import TestbenchGenerator
from error_fixer import ErrorFixer
import requests
from config import Config
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

app = Flask(__name__)
CORS(app)

verilog_gen = VerilogGenerator()
testbench_gen = TestbenchGenerator()
error_fixer = ErrorFixer()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "service": "genai"})

@app.route('/generate', methods=['POST'])
def generate():
    """Generate Verilog with automatic error fixing."""
    data = request.json
    description = data.get('description', '')
    
    if not description:
        return jsonify({'success': False, 'error': 'No description'}), 400
    
    print(f"\n{'='*60}")
    print(f"📝 NEW REQUEST: {description}")
    print(f"{'='*60}\n")
    
    print("🤖 Generating Verilog...")
    result = verilog_gen.generate(description)
    
    if not result['success']:
        return jsonify(result), 500
    
    verilog_code = result['verilog_code']
    module_name = result['module_name']
    explanation = result.get('explanation', '')
    
    print(f"✅ Generated module: {module_name}\n")
    
    print("🧪 Generating testbench...")
    testbench_code = testbench_gen.generate(verilog_code, module_name)
    print("✅ Testbench ready\n")
    
    validation = None
    simulation = None
    fix_history = []
    attempt = 0
    
    while attempt <= Config.MAX_FIX_ATTEMPTS:
        attempt += 1
        
        print(f"🔍 Validation attempt {attempt}...")
        try:
            validation_response = requests.post(
                f"{Config.VALIDATOR_URL}/validate",
                json={'verilog_code': verilog_code, 'module_name': module_name},
                timeout=30
            )
            validation = validation_response.json()
        except Exception as e:
            validation = {'success': False, 'error': f'Validator error: {str(e)}'}
            print(f"❌ Validator connection failed: {e}\n")
            break
        
        if validation.get('success'):
            print(f"✅ Validation passed!\n")
            break
        else:
            errors = validation.get('errors', ['Unknown error'])
            print(f"❌ Validation failed:")
            for err in errors:
                print(f"   {err}")
            
            if attempt > Config.MAX_FIX_ATTEMPTS:
                print(f"⚠️  Max attempts reached\n")
                break
            
            print(f"🔧 Attempting auto-fix (attempt {attempt})...")
            fix_result = error_fixer.fix(verilog_code, errors, module_name, attempt)
            
            if fix_result['success']:
                fixed_code = fix_result['fixed_code']
                print(f"✅ Fix generated\n")
                fix_history.append({
                    'attempt': attempt,
                    'original_errors': errors,
                    'fixed': True
                })
                verilog_code = fixed_code
            else:
                print(f"❌ Fix generation failed: {fix_result.get('error')}\n")
                fix_history.append({
                    'attempt': attempt,
                    'original_errors': errors,
                    'fixed': False,
                    'error': fix_result.get('error')
                })
                break
    
    if validation and validation.get('success'):
        print("🧪 Running simulation...")
        try:
            sim_response = requests.post(
                f"{Config.VALIDATOR_URL}/simulate",
                json={
                    'verilog_code': verilog_code,
                    'testbench_code': testbench_code,
                    'module_name': module_name
                },
                timeout=60
            )
            simulation = sim_response.json()
            
            if simulation.get('success'):
                print("✅ Simulation passed!\n")
            else:
                print(f"❌ Simulation failed\n")
        except Exception as e:
            simulation = {'success': False, 'error': f'Simulation error: {str(e)}'}
            print(f"❌ Simulation error: {e}\n")
    
    return jsonify({
        'success': True,
        'verilog_code': verilog_code,
        'testbench_code': testbench_code,
        'module_name': module_name,
        'explanation': explanation,
        'validation': validation,
        'simulation': simulation,
        'fix_history': fix_history,
        'auto_fixed': len(fix_history) > 0
    })

@app.route('/schematic', methods=['POST'])
def generate_schematic():
    """Generate schematic data from Verilog."""
    print(f"\n🔷 SCHEMATIC REQUEST")
    try:
        from schematic.verilog_parser import VerilogParser
        
        data = request.json
        verilog_code = data.get('verilog_code', '')
        
        if not verilog_code:
            return jsonify({'success': False, 'error': 'No code provided'}), 400
        
        parser = VerilogParser()
        schematic = parser.parse(verilog_code)
        print(f"✅ Schematic: {len(schematic['nodes'])} nodes, {len(schematic['edges'])} edges\n")
        
        return jsonify({'success': True, 'schematic': schematic})
    except Exception as e:
        print(f"❌ Schematic failed: {e}\n")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/fpga', methods=['POST'])
def analyze_fpga():
    """Analyze FPGA resource usage."""
    print(f"\n📊 FPGA ANALYSIS REQUEST")
    try:
        from fpga.estimator import FPGAEstimator
        
        data = request.json
        verilog_code = data.get('verilog_code', '')
        
        if not verilog_code:
            return jsonify({'success': False, 'error': 'No code provided'}), 400
        
        estimator = FPGAEstimator()
        analysis = estimator.estimate(verilog_code)
        print(f"✅ FPGA: {analysis['luts']} LUTs, {analysis['ffs']} FFs, fits {len(analysis['fits'])} devices\n")
        
        return jsonify({'success': True, 'analysis': analysis})
    except Exception as e:
        print(f"❌ FPGA analysis failed: {e}\n")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/learning', methods=['POST'])
def learning_mode():
    """Generate line-by-line explanations."""
    print(f"\n🎓 LEARNING MODE REQUEST")
    try:
        from learning.explainer import LearningExplainer
        
        data = request.json
        verilog_code = data.get('verilog_code', '')
        
        if not verilog_code:
            return jsonify({'success': False, 'error': 'No code provided'}), 400
        
        explainer = LearningExplainer()
        explanations = explainer.explain(verilog_code)
        print(f"✅ Learning: {len(explanations)} line explanations\n")
        
        return jsonify({'success': True, 'explanations': explanations})
    except Exception as e:
        print(f"❌ Learning mode failed: {e}\n")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 GenAI Service Starting")
    print(f"📡 Port: 5000")
    print(f"🤖 Model: {Config.MODEL_NAME}")
    print(f"🔗 Validator: {Config.VALIDATOR_URL}")
    print("=" * 60)
    print("\nRegistered routes:")
    print("  GET  /health")
    print("  POST /generate")
    print("  POST /schematic")
    print("  POST /fpga")
    print("  POST /learning")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)
