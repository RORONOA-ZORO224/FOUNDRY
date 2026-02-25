// 4-bit Johnson counter
module johnson_counter (
    input        clk,
    input        rst,
    output reg [3:0] count
);

    always @(posedge clk) begin
        if (rst)
            count <= 4'b0000;
        else
            count <= {count[2:0], ~count[3]};
    end

endmodule
