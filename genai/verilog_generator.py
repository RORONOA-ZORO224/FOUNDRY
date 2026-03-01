from groq import Groq
from config import Config
import re
import html


class VerilogGenerator:
    """
    Generates Verilog RTL code using Groq LLM.
    Cleans markdown and HTML artifacts.
    """

    def __init__(self):
        self.client = Groq(api_key=Config.GROQ_API_KEY)

    # ==========================================================
    # MAIN GENERATE FUNCTION
    # ==========================================================

    def generate(self, description):
        """Generate Verilog code from text description."""

        prompt = f"""Generate synthesizable Verilog 2005 code.

DESCRIPTION:
{description}

STRICT RULES:
- No SystemVerilog.
- No explanation.
- Output ONLY Verilog code.
"""

        try:
            response = self.client.chat.completions.create(
                model=Config.MODEL_NAME,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a professional RTL design engineer.",
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                max_tokens=2000,
                temperature=0.4,
            )

            raw_output = response.choices[0].message.content

            # Extract and clean
            verilog = self._extract_verilog(raw_output)

            # Extra safety: remove any HTML tags
            verilog = re.sub(r"<[^>]+>", "", verilog)

            module_name = self._extract_module_name(verilog)

            return {
                "success": True,
                "verilog_code": verilog,
                "module_name": module_name,
            }

        except Exception as e:
            print(f"⚠️ Verilog generation failed: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    # ==========================================================
    # CLEAN LLM OUTPUT
    # ==========================================================

    def _extract_verilog(self, text):
        """Extract clean Verilog code from LLM response."""

        if "```verilog" in text:
            code = text.split("```verilog")[1].split("```")[0]
        elif "```v" in text:
            code = text.split("```v")[1].split("```")[0]
        elif "```" in text:
            parts = text.split("```")
            if len(parts) >= 3:
                code = parts[1]
            else:
                code = text
        else:
            code = text

        code = code.strip()
        code = html.unescape(code)
        code = re.sub(r"<[^>]+>", "", code)
        code = re.sub(r"\n{3,}", "\n\n", code)

        return code

    # ==========================================================
    # EXTRACT MODULE NAME
    # ==========================================================

    def _extract_module_name(self, verilog_code):
        """Extract module name from Verilog code."""
        match = re.search(r"module\s+(\w+)", verilog_code)
        if match:
            return match.group(1)
        return "generated_module"


# ==========================================================
# LOCAL TEST
# ==========================================================

if __name__ == "__main__":
    print("🧪 Testing VerilogGenerator...\n")

    gen = VerilogGenerator()
    result = gen.generate("Create a 4-bit adder with carry in and carry out")

    print("Generated Verilog:")
    print("=" * 60)
    print(result.get("verilog_code", "No code generated"))
    print("=" * 60)