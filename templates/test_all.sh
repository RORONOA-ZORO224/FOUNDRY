#!/bin/bash

echo "Testing all Verilog templates..."
FAILED=0

for file in *.v; do
    echo -n "Testing $file... "
    iverilog -o /tmp/test.out "$file" 2>&1 | grep -i error
    if [ $? -eq 1 ]; then
        echo "✅ PASS"
    else
        echo "❌ FAIL"
        FAILED=$((FAILED + 1))
    fi
done

rm -f /tmp/test.out
echo ""
if [ $FAILED -eq 0 ]; then
    echo "✅ All templates compiled successfully!"
else
    echo "❌ $FAILED templates failed"
fi
