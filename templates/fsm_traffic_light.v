// Simple traffic light FSM
module fsm_traffic_light (
    input        clk,
    input        rst,
    output reg [2:0] light  // {red, yellow, green}
);

    // State encoding
    localparam RED    = 2'b00;
    localparam GREEN  = 2'b01;
    localparam YELLOW = 2'b10;

    reg [1:0] state, next_state;
    reg [3:0] counter;

    // State register
    always @(posedge clk) begin
        if (rst)
            state <= RED;
        else
            state <= next_state;
    end

    // Counter
    always @(posedge clk) begin
        if (rst || (counter == 4'd15))
            counter <= 4'd0;
        else
            counter <= counter + 1;
    end

    // Next state logic
    always @(*) begin
        case (state)
            RED: begin
                light = 3'b100;
                if (counter == 4'd15)
                    next_state = GREEN;
                else
                    next_state = RED;
            end
            GREEN: begin
                light = 3'b001;
                if (counter == 4'd15)
                    next_state = YELLOW;
                else
                    next_state = GREEN;
            end
            YELLOW: begin
                light = 3'b010;
                if (counter == 4'd15)
                    next_state = RED;
                else
                    next_state = YELLOW;
            end
            default: begin
                light = 3'b100;
                next_state = RED;
            end
        endcase
    end

endmodule
