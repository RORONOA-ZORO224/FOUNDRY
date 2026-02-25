// Simple UART transmitter (8N1)
module uart_tx_simple (
    input        clk,
    input        rst,
    input        tx_start,
    input  [7:0] tx_data,
    output reg   tx,
    output reg   tx_busy
);

    localparam IDLE  = 2'b00;
    localparam START = 2'b01;
    localparam DATA  = 2'b10;
    localparam STOP  = 2'b11;

    reg [1:0] state;
    reg [2:0] bit_idx;
    reg [7:0] data_reg;

    always @(posedge clk) begin
        if (rst) begin
            state <= IDLE;
            tx <= 1'b1;
            tx_busy <= 1'b0;
            bit_idx <= 3'd0;
        end else begin
            case (state)
                IDLE: begin
                    tx <= 1'b1;
                    tx_busy <= 1'b0;
                    if (tx_start) begin
                        data_reg <= tx_data;
                        state <= START;
                        tx_busy <= 1'b1;
                    end
                end
                START: begin
                    tx <= 1'b0;
                    state <= DATA;
                    bit_idx <= 3'd0;
                end
                DATA: begin
                    tx <= data_reg[bit_idx];
                    if (bit_idx == 3'd7)
                        state <= STOP;
                    else
                        bit_idx <= bit_idx + 1;
                end
                STOP: begin
                    tx <= 1'b1;
                    state <= IDLE;
                end
            endcase
        end
    end

endmodule
