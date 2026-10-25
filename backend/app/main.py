from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.api_router import api_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="ATRED v3.0 — 3-Layer Quantitative, MEXC Derivatives & Orderflow Intelligence Engine (100% Crypto USDT-M & Spot)",
    version="3.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
async def root():
    return {
        "platform": settings.PROJECT_NAME,
        "version": "3.0.0",
        "exchange": "MEXC_USDT_M",
        "status": "online",
        "docs": "/docs",
        "endpoints": {
            "screener": f"{settings.API_V1_STR}/screener",
            "crypto": f"{settings.API_V1_STR}/crypto/tokens",
            "derivatives": f"{settings.API_V1_STR}/derivatives/BTC_USDT",
            "analysis": f"{settings.API_V1_STR}/analysis/BTC_USDT",
            "similarity": f"{settings.API_V1_STR}/analysis/BTC_USDT/similarity",
            "ws_ticks": f"{settings.API_V1_STR}/ws/ticks",
        },
    }


@app.get("/health")
async def health_check():
    return {"status": "ok", "engine": "atred-mexc-quant-v3.0"}
