"""genai/api.py — Foundry backend, all routes"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from verilog_generator import VerilogGenerator
from testbench_generator import TestbenchGenerator
from error_fixer import ErrorFixer
import requests
from config import Config
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

app = Flask(__name__)
CORS(app)

verilog_gen   = VerilogGenerator()
testbench_gen = TestbenchGenerator()
error_fixer   = ErrorFixer()

VALID_MODELING = {'behavioral', 'dataflow', 'gate_level', 'structural'}


@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "service": "genai"})


@app.route('/generate', methods=['POST'])
def generate():
    data          = request.json or {}
    description   = data.get('description', '').strip()
    modeling_type = data.get('modeling_type', 'behavioral')
    if modeling_type not in VALID_MODELING:
        modeling_type = 'behavioral'
    if not description:
        return jsonify({'success': False, 'error': 'No description'}), 400

    print(f"\n{'='*55}\n📝 {description}\n🔧 {modeling_type}\n{'='*55}")

    result = verilog_gen.generate(description, modeling_type=modeling_type)
    if not result['success']:
        return jsonify(result), 500

    verilog_code  = result['verilog_code']
    module_name   = result['module_name']
    explanation   = result.get('explanation', '')

    # For structural: include ALL module definitions when compiling
    testbench_code = testbench_gen.generate(verilog_code, module_name)

    validation = None; simulation = None; fix_history = []; attempt = 0

    while attempt <= Config.MAX_FIX_ATTEMPTS:
        attempt += 1
        try:
            r = requests.post(f"{Config.VALIDATOR_URL}/validate",
                              json={'verilog_code': verilog_code, 'module_name': module_name},
                              timeout=30)
            validation = r.json()
        except Exception as e:
            validation = {'success': False, 'error': str(e)}; break

        if validation.get('success'): break
        errors = validation.get('errors', ['Unknown error'])
        if attempt > Config.MAX_FIX_ATTEMPTS: break

        fix = error_fixer.fix(verilog_code, errors, module_name, attempt)
        if fix['success']:
            verilog_code = fix['fixed_code']
            fix_history.append({'attempt': attempt, 'original_errors': errors, 'fixed': True})
        else:
            fix_history.append({'attempt': attempt, 'original_errors': errors,
                                 'fixed': False, 'error': fix.get('error')})
            break

    if validation and validation.get('success'):
        try:
            sr = requests.post(
                f"{Config.VALIDATOR_URL}/simulate",
                json={'verilog_code': verilog_code, 'testbench_code': testbench_code,
                      'module_name': module_name},
                timeout=60)
            simulation = sr.json()
        except Exception as e:
            simulation = {'success': False, 'error': str(e)}

    return jsonify({
        'success': True,
        'verilog_code': verilog_code,
        'testbench_code': testbench_code,
        'module_name': module_name,
        'explanation': explanation,
        'modeling_type': modeling_type,
        'validation': validation,
        'simulation': simulation,
        'fix_history': fix_history,
        'auto_fixed': len(fix_history) > 0,
    })


@app.route('/schematic', methods=['POST'])
def generate_schematic():
    try:
        from schematic.verilog_parser import VerilogParser
        code = (request.json or {}).get('verilog_code', '')
        if not code: return jsonify({'success': False, 'error': 'No code'}), 400
        sch = VerilogParser().parse(code)
        return jsonify({'success': True, 'schematic': sch})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/fpga', methods=['POST'])
def analyze_fpga():
    try:
        from fpga.estimator import FPGAEstimator
        code = (request.json or {}).get('verilog_code', '')
        if not code: return jsonify({'success': False, 'error': 'No code'}), 400
        analysis = FPGAEstimator().estimate(code)
        return jsonify({'success': True, 'analysis': analysis})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/circuit', methods=['POST'])
def generate_circuit():
    try:
        from schematic.circuit_extractor import CircuitExtractor
        data  = request.json or {}
        code  = data.get('verilog_code', '')
        mtype = data.get('modeling_type', 'behavioral')
        if not code: return jsonify({'success': False, 'error': 'No code'}), 400
        # extract() now accepts modeling_type
        circuit = CircuitExtractor().extract(code, modeling_type=mtype)
        return jsonify({'success': True, 'circuit': circuit})
    except Exception as e:
        print(f"❌ Circuit extraction failed: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/learning', methods=['POST'])
def learning_mode():
    try:
        from learning.explainer import LearningExplainer
        data  = request.json or {}
        code  = data.get('verilog_code', '')
        mtype = data.get('modeling_type', 'behavioral')
        if not code: return jsonify({'success': False, 'error': 'No code'}), 400
        # Pass modeling_type so explainer tailors explanations
        explanations = LearningExplainer().explain(code, modeling_type=mtype)
        return jsonify({'success': True, 'explanations': explanations})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    print("🚀 Foundry GenAI | Port 5000")
    print("Routes: /health /generate /schematic /fpga /circuit /learning")
    app.run(host='0.0.0.0', port=5000, debug=True)