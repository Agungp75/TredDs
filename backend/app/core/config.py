import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Multi-Asset Trading Analysis Platform"
    API_V1_STR: str = "/api"
    BACKEND_CORS_ORIGINS: list[str] = ["*"]
    
    # Optional API Keys with sensible defaults
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    DEFAULT_AI_PROVIDER: str = os.getenv("DEFAULT_AI_PROVIDER", "gemini")
    DEFAULT_AI_MODEL: str = os.getenv("DEFAULT_AI_MODEL", "gemini-3.8-flash")
    GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
    FRED_API_KEY: str = os.getenv("FRED_API_KEY", "")
    
    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()
