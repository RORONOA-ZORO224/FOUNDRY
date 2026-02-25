import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    GROQ_API_KEY = os.getenv('GROQ_API_KEY')
    MODEL_NAME = 'llama-3.3-70b-versatile'
    MAX_TOKENS = 3000
    TEMPERATURE = 0.7
    MAX_FIX_ATTEMPTS = 3
    FIX_TEMPERATURE = 0.3
    VALIDATOR_URL = 'http://localhost:5001'
    TEMPLATES_DIR = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        'templates'
    )

    @classmethod
    def validate(cls):
        if not cls.GROQ_API_KEY:
            raise ValueError(
                "GROQ_API_KEY not found. "
                "Create .env file with: GROQ_API_KEY=gsk_..."
            )
        return True

Config.validate()