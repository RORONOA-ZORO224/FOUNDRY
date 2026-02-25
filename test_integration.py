import requests

print("🧪 Testing Foundry Integration\n")

print("1. Health checks...")
r1 = requests.get('http://localhost:5001/health')
r2 = requests.get('http://localhost:5000/health')
print(f"   Validator: {r1.json()}")
print(f"   GenAI:     {r2.json()}\n")

print("2. Generating 4-bit adder...")
response = requests.post(
    'http://localhost:5000/generate',
    json={'description': 'Create a 4-bit adder with carry-in and carry-out'},
    timeout=60
)
result = response.json()

if result['success']:
    print("   ✅ Generation successful!")
    print(f"   Module:     {result['module_name']}")
    print(f"   Validation: {'✅ PASS' if result['validation']['success'] else '❌ FAIL'}")
    if result['simulation']:
        print(f"   Simulation: {'✅ PASS' if result['simulation']['success'] else '❌ FAIL'}")
    print("\n   Code preview:")
    for line in result['verilog_code'].split('\n')[:8]:
        print(f"   {line}")
else:
    print(f"   ❌ Failed: {result.get('error')}")

print("\n✅ Done!")