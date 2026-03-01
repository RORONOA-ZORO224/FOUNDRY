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
    return jsonify({
        'service': 'validator',
        'status': 'ok'
    })

@app.route('/validate', methods=['POST'])
def validate():
    """Validate Verilog syntax."""
    data = request.json
    code = data.get('verilog_code', '')
    module_name = data.get('module_name', 'top')
    
    if not code:
        return jsonify({'success': False, 'error': 'No code provided'}), 400
    
    print(f"\n{'='*60}")
    print(f"🔍 VALIDATION REQUEST: {module_name}")
    print(f"{'='*60}")
    
    success, errors = validator.validate_syntax(code, module_name)
    
    if success:
        print(f"✅ Validation PASSED")
    else:
        print(f"❌ Validation FAILED: {len(errors)} errors")
    
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
    
    if not code or not testbench:
        return jsonify({'success': False, 'error': 'Missing code or testbench'}), 400
    
    print(f"\n{'='*60}")
    print(f"🧪 SIMULATION REQUEST: {module_name}")
    print(f"{'='*60}")
    
    success, vcd_content, output = validator.simulate(code, testbench, module_name)
    
    result = {
        'success': success,
        'output': output
    }
    
    # Convert VCD to waveform JSON
    if vcd_content:
        print(f"📊 Converting VCD to waveform...")
        waveform_data = converter.vcd_to_json(vcd_content)
        result['waveform'] = waveform_data
        print(f"✅ Waveform added: {len(waveform_data.get('signals', []))} signals")
    else:
        print(f"⚠️ No VCD content - waveform not available")
    
    print(f"{'='*60}\n")
    
    return jsonify(result)

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 Validator Service Starting")
    print(f"📡 Listening on: http://0.0.0.0:5001")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5001, debug=True)
