// Button debouncer
module debouncer (
    input  clk,
    input  rst,
    input  button_in,
    output reg button_out
);

    reg [15:0] counter;
    reg button_sync;

    // Synchronizer
    always @(posedge clk) begin
        if (rst)
            button_sync <= 1'b0;
        else
            button_sync <= button_in;
    end

    // Debounce logic
    always @(posedge clk) begin
        if (rst) begin
            counter <= 16'd0;
            button_out <= 1'b0;
        end else begin
            if (button_sync != button_out) begin
                counter <= counter + 1;
                if (counter == 16'hFFFF)
                    button_out <= button_sync;
            end else begin
                counter <= 16'd0;
            end
        end
    end

endmodule
