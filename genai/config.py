import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

class Config:
    """Configuration for GenAI service using Groq."""
    
    GROQ_API_KEY = os.getenv('GROQ_API_KEY')
    
    MODEL_NAME = 'llama-3.3-70b-versatile'  
    
    MAX_TOKENS = 3000
    TEMPERATURE = 0.7
   
    MAX_FIX_ATTEMPTS = 3
    FIX_TEMPERATURE = 0.3
    
    VALIDATOR_URL = 'http://localhost:5001'  

    TEMPLATES_DIR = Path(__file__).parent.parent / 'templates'
    
    @classmethod
    def validate(cls):
        """Check required config."""
        if not cls.GROQ_API_KEY:
            raise ValueError(
                "GROQ_API_KEY not found. "
                "Create .env file with: GROQ_API_KEY=gsk_..."
            )
        if not cls.TEMPLATES_DIR.exists():
            raise ValueError(f"Templates directory not found: {cls.TEMPLATES_DIR}")
        return True

Config.validate()