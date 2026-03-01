# FOUNDRY – AI-Powered Verilog Development Platform

FOUNDRY is a full-stack AI-assisted Verilog development environment built with:

- GenAI (LLM-based Verilog generation & auto-fix)
- Validator (Icarus Verilog compilation + simulation)
- FPGA resource estimation
- Schematic visualization (Cytoscape)
-  Learning mode (line-by-line explanations)
-  React frontend
-  Fully configured for WSL development

---

#  Features

## 🔹 1. Verilog Generation
- Generate synthesizable Verilog from natural language.
- Uses Groq LLM (LLaMA model).
- Auto-detects module name.

## 🔹 2. Automatic Error Fixing
- Validates generated Verilog.
- If compilation fails → AI attempts automatic fixes.
- Configurable max fix attempts.

## 🔹 3. Testbench Generation
- Automatically generates testbench.
- Runs simulation through Validator
- also generates Waveform using GTK wave.

## 🔹 4. FPGA Resource Estimation
- Estimates:
  - LUT usage
  - Flip-Flop usage
  - Device fit suggestions

## 🔹 5. Schematic Viewer
- Parses Verilog
- Generates nodes & edges
- Visualized using:
  - `cytoscape`
  - `cytoscape-dagre`

## 🔹 6. Learning Mode
- Generates line-by-line explanation of Verilog code.
- Designed for ECE students.

---

FURTHER IMPLEMENTATION:
want to give more data sets(Verilog examples) to make it more efficient and accurate.

