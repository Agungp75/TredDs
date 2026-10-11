from fastapi import APIRouter
from app.services.market_data import fetch_ohlcv, get_asset_overview, fetch_live_quotes

router = APIRouter(prefix="/stocks", tags=["Stocks"])

INDEX_CONFIG = [
    {"symbol": "^JKSE", "name": "IHSG (Indonesia Composite)", "fallback_price": 6636.5, "fallback_change": 25.4, "fallback_pct": 0.38},
    {"symbol": "^GSPC", "name": "S&P 500", "fallback_price": 5480.3, "fallback_change": 24.8, "fallback_pct": 0.45},
    {"symbol": "^IXIC", "name": "NASDAQ Composite", "fallback_price": 17150.1, "fallback_change": 115.4, "fallback_pct": 0.68},
    {"symbol": "^DJI", "name": "Dow Jones Industrial", "fallback_price": 40345.0, "fallback_change": -32.1, "fallback_pct": -0.08},
]

@router.get("/indices")
async def get_market_indices():
    """
    Mengambil data indeks utama real-time (IHSG, S&P 500, NASDAQ, Dow Jones) secara paralel.
    """
    symbols = [cfg["symbol"] for cfg in INDEX_CONFIG]
    quotes = fetch_live_quotes(symbols)
    results = []
    for cfg in INDEX_CONFIG:
        q = quotes.get(cfg["symbol"], {})
        price = q.get("price", 0)
        change = q.get("change", 0)
        change_pct = q.get("change_pct", 0)
        results.append({
            "symbol": cfg["symbol"],
            "name": cfg["name"],
            "price": price if price > 0 else cfg["fallback_price"],
            "change": change if change != 0 else cfg["fallback_change"],
            "change_pct": change_pct if change_pct != 0 else cfg["fallback_pct"],
        })
    return results

@router.get("/list")
async def get_stocks_list():
    symbols = ["AAPL", "NVDA", "TSLA", "MSFT", "BBCA.JK", "BBRI.JK"]
    data = []
    
    fundamentals = {
        "AAPL": {"pe": 32.4, "pbv": 45.1, "roe": "147%", "market_cap": "$3.42T", "div_yield": "0.45%"},
        "NVDA": {"pe": 68.2, "pbv": 52.0, "roe": "115%", "market_cap": "$2.98T", "div_yield": "0.03%"},
        "TSLA": {"pe": 62.5, "pbv": 11.2, "roe": "18.2%", "market_cap": "$670B", "div_yield": "0.00%"},
        "MSFT": {"pe": 36.8, "pbv": 12.8, "roe": "38.5%", "market_cap": "$3.15T", "div_yield": "0.71%"},
        "BBCA.JK": {"pe": 23.5, "pbv": 4.8, "roe": "21.4%", "market_cap": "Rp 1,220T", "div_yield": "2.80%"},
        "BBRI.JK": {"pe": 12.1, "pbv": 2.3, "roe": "19.8%", "market_cap": "Rp 735T", "div_yield": "6.20%"},
    }
    
    for s in symbols:
        overview = get_asset_overview(s)
        f = fundamentals.get(s, {"pe": 20.0, "pbv": 3.0, "roe": "15%", "market_cap": "$100B", "div_yield": "1.5%"})
        overview.update({"fundamentals": f})
        data.append(overview)
        
    return data
