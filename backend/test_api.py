import asyncio
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_api_endpoints():
    print("Testing FastAPI endpoints...")
    
    # 1. Health check
    res = client.get("/health")
    assert res.status_code == 200
    print("  [OK] /health ->", res.json())
    
    # 2. Screener
    res = client.get("/api/screener")
    assert res.status_code == 200
    screener_data = res.json()
    print(f"  [OK] /api/screener -> {screener_data['total']} items found")
    assert screener_data['total'] > 0
    top_pick = screener_data['items'][0]
    print(f"       Top Pick: {top_pick['symbol']} ({top_pick['name']}) - Score: {top_pick['score']} - Pattern: {top_pick['pattern']}")
    
    # 3. Stocks list & indices
    res = client.get("/api/stocks/indices")
    assert res.status_code == 200
    print(f"  [OK] /api/stocks/indices -> {len(res.json())} indices")
    
    res = client.get("/api/stocks/list")
    assert res.status_code == 200
    print(f"  [OK] /api/stocks/list -> {len(res.json())} stocks")
    
    # 4. Crypto tokens
    res = client.get("/api/crypto/tokens")
    assert res.status_code == 200
    print(f"  [OK] /api/crypto/tokens -> {len(res.json())} tokens")
    
    # 5. Forex pairs & correlation
    res = client.get("/api/forex/pairs")
    assert res.status_code == 200
    print(f"  [OK] /api/forex/pairs -> {len(res.json())} pairs")
    
    res = client.get("/api/forex/correlation")
    assert res.status_code == 200
    print(f"  [OK] /api/forex/correlation -> {len(res.json()['currencies'])} currencies matrix")
    
    res = client.get("/api/forex/calendar")
    assert res.status_code == 200
    print(f"  [OK] /api/forex/calendar -> {len(res.json())} calendar events")
    
    # 6. Deep Analysis 3-Layer
    res = client.get("/api/analysis/BTC-USD")
    assert res.status_code == 200
    analysis_data = res.json()
    print("  [OK] /api/analysis/BTC-USD -> Deep Analysis loaded")
    print(f"       Layer 1 Technical Pattern: {analysis_data['layer_1_technical']['pattern']} ({analysis_data['layer_1_technical']['type']})")
    print(f"       Layer 1 TP/SL: TP=${analysis_data['layer_1_technical']['tp_sl']['tp']} | SL=${analysis_data['layer_1_technical']['tp_sl']['sl']}")
    print(f"       Layer 2 Dev Score: {analysis_data['layer_2_dev_onchain']['dev_metrics']['dev_score']}/100")
    # 7. AI Providers & Options
    res = client.get("/api/analysis/ai/providers")
    assert res.status_code == 200
    providers_data = res.json()
    print(f"  [OK] /api/analysis/ai/providers -> {len(providers_data['providers'])} AI providers listed")
    assert "openai" in providers_data["providers"]
    assert "gemini" in providers_data["providers"]

    # 8. AI Key Validation Endpoint Test
    res = client.post("/api/analysis/ai/test-key", json={"provider": "openai", "api_key": ""})
    assert res.status_code == 200
    key_test_data = res.json()
    print(f"  [OK] /api/analysis/ai/test-key (empty validation check) -> success={key_test_data['success']}")
    assert key_test_data["success"] is False

    # 9. AI Query: Scalping, Swing, Scenarios, Chat
    res = client.post("/api/analysis/BTC-USD/ai-query", json={"mode": "scalping"})
    assert res.status_code == 200
    scalp_res = res.json()
    print(f"  [OK] /api/analysis/BTC-USD/ai-query [scalping] -> Bias={scalp_res.get('scalp_bias')}, TP1={scalp_res.get('take_profit_1')}")
    assert "take_profit_1" in scalp_res

    res = client.post("/api/analysis/BTC-USD/ai-query", json={"mode": "scenarios"})
    assert res.status_code == 200
    scenarios_res = res.json()
    print(f"  [OK] /api/analysis/BTC-USD/ai-query [scenarios] -> Bull={scenarios_res.get('bull_case', {}).get('probability_pct')}%, Bear={scenarios_res.get('bear_case', {}).get('probability_pct')}%")
    assert "bull_case" in scenarios_res

    res = client.post("/api/analysis/BTC-USD/ai-query", json={"mode": "chat", "custom_prompt": "Apakah aman beli sekarang?"})
    assert res.status_code == 200
    chat_res = res.json()
    print(f"  [OK] /api/analysis/BTC-USD/ai-query [chat] -> Response generated ({len(chat_res.get('answer', ''))} chars)")
    assert len(chat_res.get("answer", "")) > 10

    print("\nAll FastAPI endpoints tested successfully!")

if __name__ == "__main__":
    test_api_endpoints()
