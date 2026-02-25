// Simple SPI master
module spi_master_simple (
    input        clk,
    input        rst,
    input        start,
    input  [7:0] data_in,
    output reg [7:0] data_out,
    output reg   sclk,
    output reg   mosi,
    input        miso,
    output reg   cs,
    output reg   busy
);

    localparam IDLE = 2'b00;
    localparam TRANSFER = 2'b01;
    localparam DONE = 2'b10;

    reg [1:0] state;
    reg [2:0] bit_cnt;
    reg [7:0] shift_reg;

    always @(posedge clk) begin
        if (rst) begin
            state <= IDLE;
            sclk <= 1'b0;
            cs <= 1'b1;
            busy <= 1'b0;
            bit_cnt <= 3'd0;
        end else begin
            case (state)
                IDLE: begin
                    sclk <= 1'b0;
                    cs <= 1'b1;
                    busy <= 1'b0;
                    if (start) begin
                        shift_reg <= data_in;
                        state <= TRANSFER;
                        cs <= 1'b0;
                        busy <= 1'b1;
                        bit_cnt <= 3'd0;
                    end
                end
                TRANSFER: begin
                    if (sclk == 1'b0) begin
                        sclk <= 1'b1;
                        mosi <= shift_reg[7];
                    end else begin
                        sclk <= 1'b0;
                        shift_reg <= {shift_reg[6:0], miso};
                        if (bit_cnt == 3'd7) begin
                            state <= DONE;
                            data_out <= {shift_reg[6:0], miso};
                        end else begin
                            bit_cnt <= bit_cnt + 1;
                        end
                    end
                end
                DONE: begin
                    cs <= 1'b1;
                    state <= IDLE;
                end
            endcase
        end
    end

endmodule
