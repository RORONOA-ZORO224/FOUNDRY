// 8-bit barrel shifter
module barrel_shifter (
    input  [7:0] data_in,
    input  [2:0] shift_amt,
    input        shift_dir,  // 0=left, 1=right
    output reg [7:0] data_out
);

    always @(*) begin
        if (shift_dir == 1'b0)
            data_out = data_in << shift_amt;
        else
            data_out = data_in >> shift_amt;
    end

endmodule
