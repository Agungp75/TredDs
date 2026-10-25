import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "ATRED v3.0 — MEXC Crypto Quantitative & Derivatives Platform"
    VERSION: str = "3.0.0"
    API_V1_STR: str = "/api"
    BACKEND_CORS_ORIGINS: list[str] = ["*"]

    # MEXC Native Endpoints & Live Mirror (Zero Synthetic Fallback)
    MEXC_CONTRACT_BASE_URL: str = os.getenv("MEXC_CONTRACT_BASE_URL", "https://contract.mexc.com/api/v1/contract")
    MEXC_SPOT_BASE_URL: str = os.getenv("MEXC_SPOT_BASE_URL", "https://api.mexc.com/api/v3")
    LIVE_CRYPTO_MIRROR_URL: str = os.getenv("LIVE_CRYPTO_MIRROR_URL", "https://data-api.binance.vision/api/v3")
    MEXC_WS_URL: str = os.getenv("MEXC_WS_URL", "wss://contract.mexc.com/edge")

    # MEXC Fee Structure & Execution Thresholds
    MEXC_MAKER_FEE_PCT: float = 0.00       # 0.00% Maker Fee di MEXC
    MEXC_TAKER_FEE_PCT: float = 0.02       # 0.02% per sisi (0.04% Round-Trip Taker Fee)
    STALE_DATA_THRESHOLD_SECONDS: int = 60 # Circuit breaker batas usia data (60 detik)
    MAX_FAIR_LAST_DEVIATION_PCT: float = 0.25
    MIN_NET_EV_PCT: float = 0.15
    MIN_NET_RR: float = 1.50

    # Optional AI / External API Keys
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    DEFAULT_AI_PROVIDER: str = os.getenv("DEFAULT_AI_PROVIDER", "gemini")
    DEFAULT_AI_MODEL: str = os.getenv("DEFAULT_AI_MODEL", "gemini-2.5-flash")
    GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()
