from flask import Flask, request, jsonify
from flask_cors import CORS
from verilog_generator import VerilogGenerator
from testbench_generator import TestbenchGenerator
import requests
from config import Config

app = Flask(__name__)
CORS(app)

verilog_gen = VerilogGenerator()
testbench_gen = TestbenchGenerator()


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "service": "genai",
        "model": Config.MODEL_NAME
    })


@app.route('/generate', methods=['POST'])
def generate():
    data = request.json
    description = data.get('description', '')

    if not description:
        return jsonify({'success': False, 'error': 'No description provided'}), 400

    # Step 1: Generate Verilog
    result = verilog_gen.generate(description)
    if not result['success']:
        return jsonify(result), 500

    verilog_code = result['verilog_code']
    module_name = result['module_name']

    # Step 2: Generate testbench
    testbench_code = testbench_gen.generate(verilog_code, module_name)

    # Step 3: Validate
    try:
        validation_response = requests.post(
            f"{Config.VALIDATOR_URL}/validate",
            json={'verilog_code': verilog_code, 'module_name': module_name},
            timeout=30
        )
        validation = validation_response.json()
    except Exception as e:
        validation = {'success': False, 'error': f'Validator unavailable: {str(e)}'}

    # Step 4: Simulate if validation passed
    simulation = None
    if validation.get('success'):
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
        except Exception as e:
            simulation = {'success': False, 'error': f'Simulation error: {str(e)}'}

    return jsonify({
        'success': True,
        'verilog_code': verilog_code,
        'testbench_code': testbench_code,
        'module_name': module_name,
        'explanation': result.get('explanation', ''),
        'validation': validation,
        'simulation': simulation
    })


if __name__ == '__main__':
    print("🚀 GenAI service starting on http://localhost:5000")
    print(f"Using model: {Config.MODEL_NAME}")
    app.run(host='0.0.0.0', port=5000, debug=True)