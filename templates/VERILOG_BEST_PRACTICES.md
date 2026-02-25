# Verilog Best Practices for AI Generation

## Naming Conventions
- Module names: lowercase with underscores (e.g., `counter_8bit`)
- Signals: lowercase with underscores (e.g., `data_valid`)
- Parameters: UPPERCASE (e.g., `WIDTH`)
- State names: UPPERCASE (e.g., `IDLE`, `BUSY`)

## Always Block Rules
- **Sequential logic**: `always @(posedge clk)` with non-blocking assignments (`<=`)
- **Combinational logic**: `always @(*)` with blocking assignments (`=`)
- Always include synchronous reset: `if (rst)`

## Signal Declarations
- Use `reg` for signals assigned in `always` blocks
- Use `wire` for continuous assignments with `assign`
- Always specify bit widths: `[7:0]` not implicit

## Reset Logic
- Always use synchronous reset (inside `@(posedge clk)`)
- Reset to known state: `counter <= 8'd0;` not `counter <= 8'bx;`
- Reset is active high

## Sensitivity Lists
- Use `always @(*)` for combinational (not `always @(a or b or c)`)
- Use `always @(posedge clk)` for sequential (not `always @(clk)`)

## Avoid
- ❌ Latches: always have `else` in combinational blocks
- ❌ Implicit nets: declare all signals
- ❌ Mixing blocking/non-blocking in same always block
- ❌ Multiple clocks in same always block

## Default Cases
- Always include `default:` in `case` statements
- Assign safe values in default case

## Example Template
```verilog
module example (
    input        clk,
    input        rst,
    input  [7:0] data_in,
    output reg [7:0] data_out
);

    always @(posedge clk) begin
        if (rst)
            data_out <= 8'd0;
        else
            data_out <= data_in;
    end

endmodule
```
