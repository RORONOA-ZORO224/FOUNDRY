from flask import Flask, request, jsonify
from flask_cors import CORS
from verilog_validator import VerilogValidator
from waveform_converter import WaveformConverter

app = Flask(__name__)
CORS(app)

validator = VerilogValidator()
converter = WaveformConverter()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "service": "validator"})

@app.route('/validate', methods=['POST'])
def validate():
    """Validate Verilog syntax."""
    data = request.json
    code = data.get('verilog_code', '')
    module_name = data.get('module_name', 'top')
    
    success, errors = validator.validate_syntax(code, module_name)
    
    return jsonify({
        'success': success,
        'errors': errors
    })

@app.route('/simulate', methods=['POST'])
def simulate():
    """Run simulation with testbench."""
    data = request.json
    code = data.get('verilog_code', '')
    testbench = data.get('testbench_code', '')
    module_name = data.get('module_name', 'top')
    
    success, vcd_content, output = validator.simulate(code, testbench, module_name)
    
    result = {
        'success': success,
        'output': output
    }
    
    if vcd_content:
        result['waveform'] = converter.vcd_to_json(vcd_content)
    
    return jsonify(result)

if __name__ == '__main__':
    print("🚀 Validator service starting on http://localhost:5001")
    app.run(host='0.0.0.0', port=5001, debug=True)
