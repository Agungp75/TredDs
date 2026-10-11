from fastapi import APIRouter
from app.services.market_data import get_asset_overview

router = APIRouter(prefix="/forex", tags=["Forex"])

@router.get("/pairs")
async def get_forex_pairs():
    pairs = ["GC=F", "EURUSD=X", "GBPUSD=X", "USDJPY=X", "AUDUSD=X", "USDCHF=X"]
    spreads = {
        "GC=F": 1.8,
        "EURUSD=X": 0.8,
        "GBPUSD=X": 1.2,
        "USDJPY=X": 0.9,
        "AUDUSD=X": 1.1,
        "USDCHF=X": 1.4,
    }
    
    results = []
    for p in pairs:
        ov = get_asset_overview(p)
        ov["spread_pips"] = spreads.get(p, 1.0)
        results.append(ov)
        
    return results

@router.get("/correlation")
async def get_correlation_matrix():
    """
    Matriks korelasi mata uang forex (nilai -1.0 hingga +1.0)
    """
    currencies = ["USD", "EUR", "GBP", "JPY", "AUD", "CHF"]
    matrix = {
        "USD": {"USD": 1.00, "EUR": -0.88, "GBP": -0.82, "JPY": 0.74, "AUD": -0.79, "CHF": 0.68},
        "EUR": {"USD": -0.88, "EUR": 1.00, "GBP": 0.85, "JPY": -0.65, "AUD": 0.72, "CHF": -0.58},
        "GBP": {"USD": -0.82, "EUR": 0.85, "GBP": 1.00, "JPY": -0.61, "AUD": 0.78, "CHF": -0.52},
        "JPY": {"USD": 0.74, "EUR": -0.65, "GBP": -0.61, "JPY": 1.00, "AUD": -0.55, "CHF": 0.82},
        "AUD": {"USD": -0.79, "EUR": 0.72, "GBP": 0.78, "JPY": -0.55, "AUD": 1.00, "CHF": -0.48},
        "CHF": {"USD": 0.68, "EUR": -0.58, "GBP": -0.52, "JPY": 0.82, "AUD": -0.48, "CHF": 1.00},
    }
    return {"currencies": currencies, "matrix": matrix}

@router.get("/calendar")
async def get_economic_calendar():
    """
    Kalender berita ekonomi berdampak tinggi (High Impact News)
    """
    events = [
        {
            "id": "1",
            "time": "19:30 WIB",
            "currency": "USD",
            "event": "US Core CPI (MoM / YoY)",
            "impact": "HIGH",
            "forecast": "3.1%",
            "previous": "3.2%",
            "description": "Indeks Harga Konsumen menentukan arah kebijakan suku bunga Federal Reserve."
        },
        {
            "id": "2",
            "time": "21:00 WIB",
            "currency": "USD",
            "event": "FOMC Interest Rate Decision",
            "impact": "HIGH",
            "forecast": "5.50%",
            "previous": "5.50%",
            "description": "Keputusan suku bunga acuan The Fed berdampak volatilitas masif pada DXY dan pasangan mata uang."
        },
        {
            "id": "3",
            "time": "15:30 WIB",
            "currency": "GBP",
            "event": "UK GDP (QoQ)",
            "impact": "HIGH",
            "forecast": "0.6%",
            "previous": "0.7%",
            "description": "Pertumbuhan ekonomi kuartalan Inggris mempengaruhi prospek suku bunga Bank of England."
        },
        {
            "id": "4",
            "time": "16:00 WIB",
            "currency": "EUR",
            "event": "Eurozone Consumer Confidence",
            "impact": "MEDIUM",
            "forecast": "-13.0",
            "previous": "-14.0",
            "description": "Tingkat optimisme konsumen di kawasan Euro."
        },
        {
            "id": "5",
            "time": "08:30 WIB",
            "currency": "AUD",
            "event": "Australia Employment Change",
            "impact": "HIGH",
            "forecast": "25.0K",
            "previous": "50.2K",
            "description": "Data penyerapan tenaga kerja Australia penggerak utama Aussie Dollar."
        }
    ]
    return events
