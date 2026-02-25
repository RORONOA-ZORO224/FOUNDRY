// 8-bit shift register with load
module shift_register_8bit (
    input        clk,
    input        rst,
    input        load,
    input        shift,
    input  [7:0] data_in,
    input        serial_in,
    output [7:0] data_out
);

    reg [7:0] shift_reg;

    always @(posedge clk) begin
        if (rst)
            shift_reg <= 8'd0;
        else if (load)
            shift_reg <= data_in;
        else if (shift)
            shift_reg <= {shift_reg[6:0], serial_in};
    end

    assign data_out = shift_reg;

endmodule
