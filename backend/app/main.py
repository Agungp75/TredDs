from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.api_router import api_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Engine Kuantitatif & API Analitik Scalping Terpadu (Kripto & Forex / Gold: 1 Detik - 1 Hari)",
    version="2.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Hubungkan aggregated router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
async def root():
    return {
        "platform": settings.PROJECT_NAME,
        "status": "online",
        "docs": "/docs",
        "endpoints": {
            "screener": f"{settings.API_V1_STR}/screener",
            "crypto": f"{settings.API_V1_STR}/crypto/tokens",
            "forex": f"{settings.API_V1_STR}/forex/pairs",
            "analysis": f"{settings.API_V1_STR}/analysis/BTC-USD",
            "ws_ticks": f"{settings.API_V1_STR}/ws/ticks"
        }
    }

@app.get("/health")
async def health_check():
    return {"status": "ok", "engine": "fastapi-quantitative-v1"}
