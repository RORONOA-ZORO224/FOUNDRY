from flask import Flask, request, jsonify
from flask_cors import CORS
from verilog_generator import VerilogGenerator
from testbench_generator import TestbenchGenerator
from error_fixer import ErrorFixer
import requests
from config import Config

app = Flask(__name__)
CORS(app)

verilog_gen = VerilogGenerator()
testbench_gen = TestbenchGenerator()
error_fixer = ErrorFixer()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "service": "genai",
        "model": Config.MODEL_NAME,
        "validator": Config.VALIDATOR_URL
    })

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
    
    # Step 1: Generate initial Verilog
    print("🤖 Generating Verilog...")
    result = verilog_gen.generate(description)
    
    if not result['success']:
        return jsonify(result), 500
    
    verilog_code = result['verilog_code']
    module_name = result['module_name']
    explanation = result.get('explanation', '')
    
    print(f"✅ Generated module: {module_name}\n")
    
    # Step 2: Generate testbench
    print("🧪 Generating testbench...")
    testbench_code = testbench_gen.generate(verilog_code, module_name)
    print("✅ Testbench ready\n")
    
    # Step 3: Validation loop with auto-fix
    validation = None
    simulation = None
    fix_history = []
    attempt = 0
    
    while attempt <= Config.MAX_FIX_ATTEMPTS:
        attempt += 1
        
        # Validate
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
            # Validation failed
            errors = validation.get('errors', ['Unknown error'])
            print(f"❌ Validation failed:")
            for err in errors:
                print(f"   {err}")
            
            if attempt > Config.MAX_FIX_ATTEMPTS:
                print(f"⚠️  Max attempts reached\n")
                break
            
            # Try to fix
            print(f"🔧 Attempting auto-fix (attempt {attempt})...")
            fix_result = error_fixer.fix(verilog_code, errors, module_name, attempt)
            
            if fix_result['success']:
                fixed_code = fix_result['fixed_code']
                print(f"✅ Fix generated\n")
                
                # Record the fix
                fix_history.append({
                    'attempt': attempt,
                    'original_errors': errors,
                    'fixed': True
                })
                
                # Use the fixed code for next iteration
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
    
    # Step 4: Simulate if validation passed
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
    
    # Return complete result
    return jsonify({
        'success': True,
        'verilog_code': verilog_code,
        'testbench_code': testbench_code,
        'module_name': module_name,
        'explanation': explanation,
        'validation': validation,
        'simulation': simulation,
        'fix_history': fix_history,  # NEW: Show what was fixed
        'auto_fixed': len(fix_history) > 0  # NEW: Flag if auto-fix was used
    })

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 GenAI Service with Auto-Fix Starting")
    print(f"📡 Listening on: http://0.0.0.0:5000")
    print(f"🤖 Model: {Config.MODEL_NAME}")
    print(f"🔗 Validator: {Config.VALIDATOR_URL}")
    print(f"🔧 Auto-fix: Enabled (max {Config.MAX_FIX_ATTEMPTS} attempts)")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)