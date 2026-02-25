// Simple 8-entry FIFO
module fifo_simple (
    input        clk,
    input        rst,
    input        wr_en,
    input        rd_en,
    input  [7:0] data_in,
    output [7:0] data_out,
    output       full,
    output       empty
);

    reg [7:0] mem [0:7];
    reg [2:0] wr_ptr, rd_ptr;
    reg [3:0] count;

    assign full = (count == 4'd8);
    assign empty = (count == 4'd0);
    assign data_out = mem[rd_ptr];

    // Write pointer
    always @(posedge clk) begin
        if (rst)
            wr_ptr <= 3'd0;
        else if (wr_en && !full)
            wr_ptr <= wr_ptr + 1;
    end

    // Read pointer
    always @(posedge clk) begin
        if (rst)
            rd_ptr <= 3'd0;
        else if (rd_en && !empty)
            rd_ptr <= rd_ptr + 1;
    end

    // Count
    always @(posedge clk) begin
        if (rst)
            count <= 4'd0;
        else begin
            case ({wr_en && !full, rd_en && !empty})
                2'b10: count <= count + 1;
                2'b01: count <= count - 1;
                default: count <= count;
            endcase
        end
    end

    // Memory write
    always @(posedge clk) begin
        if (wr_en && !full)
            mem[wr_ptr] <= data_in;
    end

endmodule
