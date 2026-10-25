from fastapi import APIRouter
from app.api.routers import crypto, screener, analysis, similarity, derivatives, ws

api_router = APIRouter()

api_router.include_router(crypto.router)
api_router.include_router(screener.router)
api_router.include_router(analysis.router)
api_router.include_router(similarity.router)
api_router.include_router(derivatives.router)
api_router.include_router(ws.router)
