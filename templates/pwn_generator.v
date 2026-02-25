// PWM generator
module pwm_generator (
    input        clk,
    input        rst,
    input  [7:0] duty_cycle,  // 0-255
    output       pwm_out
);

    reg [7:0] counter;

    always @(posedge clk) begin
        if (rst)
            counter <= 8'd0;
        else
            counter <= counter + 1;
    end

    assign pwm_out = (counter < duty_cycle);

endmodule
