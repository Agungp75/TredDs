from fastapi import APIRouter
from app.api.routers import crypto, forex, stocks, screener, analysis, similarity, ws

api_router = APIRouter()

api_router.include_router(crypto.router)
api_router.include_router(forex.router)
api_router.include_router(stocks.router)
api_router.include_router(screener.router)
api_router.include_router(analysis.router)
api_router.include_router(similarity.router)
api_router.include_router(ws.router)
