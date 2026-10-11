import os
import json
import time
import httpx
from typing import Optional, List, Dict, Any
from app.core.config import settings

# Supported AI Providers & recommended models
AI_PROVIDERS = {
    "gemini": {
        "name": "Google Gemini",
        "default_model": "gemini-3.8-flash",
        "models": [
            {"id": "gemini-3.8-flash", "label": "Gemini 3.8 Flash (Generasi Terbaru - Super Cepat & Cerdas)", "category": "terkini"},
            {"id": "gemini-3.8-pro", "label": "Gemini 3.8 Pro (Generasi Terbaru - Flagship Reasoning & Analisis)", "category": "terkini"},
            {"id": "gemini-3.6-flash", "label": "Gemini 3.6 Flash (Generasi 3 - Kecepatan & Akurasi Tinggi)", "category": "terkini"},
            {"id": "gemini-3.6-pro", "label": "Gemini 3.6 Pro (Generasi 3 - Penalaran Kuantitatif Kompleks)", "category": "terkini"},
            {"id": "gemini-3.0-flash", "label": "Gemini 3.0 Flash (Generasi 3)", "category": "terkini"},
            {"id": "gemini-3.0-pro", "label": "Gemini 3.0 Pro (Generasi 3)", "category": "terkini"},
            {"id": "gemini-2.5-flash", "label": "Gemini 2.5 Flash (Generasi 2.5 - Multimodal)", "category": "stabil"},
            {"id": "gemini-2.5-pro", "label": "Gemini 2.5 Pro (Generasi 2.5)", "category": "stabil"},
            {"id": "gemini-2.0-flash", "label": "Gemini 2.0 Flash (Stabil & Cepat)", "category": "stabil"},
            {"id": "gemini-2.0-flash-lite", "label": "Gemini 2.0 Flash Lite (Ultra Ringan)", "category": "cepat"},
            {"id": "gemini-2.0-flash-thinking-exp-01-21", "label": "Gemini 2.0 Flash Thinking Exp (Deep Reasoning)", "category": "reasoning"},
            {"id": "gemini-2.0-pro-exp-02-05", "label": "Gemini 2.0 Pro Experimental", "category": "reasoning"},
            {"id": "gemini-1.5-flash", "label": "Gemini 1.5 Flash (Standar 1.5)", "category": "legacy"},
            {"id": "gemini-1.5-flash-8b", "label": "Gemini 1.5 Flash 8B", "category": "legacy"},
            {"id": "gemini-1.5-pro", "label": "Gemini 1.5 Pro (Long Context)", "category": "legacy"},
            {"id": "gemini-1.0-pro", "label": "Gemini 1.0 Pro", "category": "legacy"}
        ],
        "base_url": "https://generativelanguage.googleapis.com/v1beta"
    },
    "openai": {
        "name": "OpenAI",
        "default_model": "gpt-4o-mini",
        "models": [
            {"id": "gpt-4o", "label": "GPT-4o (Flagship Multimodal Omnichannel)", "category": "flagship"},
            {"id": "gpt-4o-mini", "label": "GPT-4o Mini (Rekomendasi - Ringan & Hemat)", "category": "rekomendasi"},
            {"id": "gpt-4.5-preview", "label": "GPT-4.5 Preview (Next-Gen Flagship OpenAI)", "category": "terkini"},
            {"id": "o3-mini", "label": "o3-mini (High-Speed Reasoning Model)", "category": "reasoning"},
            {"id": "o1", "label": "o1 (Full Reasoning Penalaran Tingkat Tinggi)", "category": "reasoning"},
            {"id": "o1-mini", "label": "o1-mini (Reasoning Ringkas & Cepat)", "category": "reasoning"},
            {"id": "gpt-4-turbo", "label": "GPT-4 Turbo (High Context 128k)", "category": "standar"},
            {"id": "gpt-3.5-turbo", "label": "GPT-3.5 Turbo (Legacy)", "category": "legacy"}
        ],
        "base_url": "https://api.openai.com/v1"
    },
    "deepseek": {
        "name": "DeepSeek",
        "default_model": "deepseek-chat",
        "models": [
            {"id": "deepseek-chat", "label": "DeepSeek-V3 Chat (Cepat, Akurat & Super Hemat)", "category": "rekomendasi"},
            {"id": "deepseek-reasoner", "label": "DeepSeek-R1 (Penalaran Kuantitatif / Reasoning)", "category": "reasoning"}
        ],
        "base_url": "https://api.deepseek.com"
    },
    "groq": {
        "name": "Groq",
        "default_model": "llama-3.3-70b-versatile",
        "models": [
            {"id": "llama-3.3-70b-versatile", "label": "Llama 3.3 70B Versatile (Rekomendasi Groq)", "category": "rekomendasi"},
            {"id": "deepseek-r1-distill-llama-70b", "label": "DeepSeek R1 Distill 70B (LPU Ultra-Fast Reasoning)", "category": "reasoning"},
            {"id": "llama-3.1-70b-versatile", "label": "Llama 3.1 70B Versatile", "category": "standar"},
            {"id": "llama-3.1-8b-instant", "label": "Llama 3.1 8B Instant (Ultra Cepat <150ms)", "category": "cepat"},
            {"id": "mixtral-8x7b-32768", "label": "Mixtral 8x7B (32k Context)", "category": "standar"},
            {"id": "gemma2-9b-it", "label": "Gemma 2 9B IT (Google on Groq)", "category": "standar"}
        ],
        "base_url": "https://api.groq.com/openai/v1"
    },
    "custom": {
        "name": "Custom OpenAI-Compatible",
        "default_model": "custom-model",
        "models": [
            {"id": "custom-model", "label": "Custom Model (Ollama / vLLM / Local)", "category": "custom"}
        ],
        "base_url": "http://localhost:11434/v1"
    }
}

def resolve_api_credentials(provider: str = None, api_key: str = None, model: str = None, base_url: str = None):
    """
    Menyelesaikan kredensial API: memprioritaskan parameter request pengguna dari UI,
    jika kosong mengambil dari env settings.
    """
    prov = (provider or settings.DEFAULT_AI_PROVIDER or "openai").lower()
    
    key = api_key
    if not key:
        if prov == "openai":
            key = settings.OPENAI_API_KEY
        elif prov == "gemini":
            key = settings.GEMINI_API_KEY
        elif prov == "deepseek":
            key = settings.DEEPSEEK_API_KEY
        elif prov == "groq":
            key = settings.GROQ_API_KEY

    target_model = model
    if not target_model:
        provider_cfg = AI_PROVIDERS.get(prov, {})
        target_model = provider_cfg.get("default_model", "gpt-4o-mini")

    target_base_url = base_url or AI_PROVIDERS.get(prov, {}).get("base_url", "")
    
    return prov, key, target_model, target_base_url

async def verify_ai_connection(provider: str, api_key: str, model: str = None, base_url: str = None) -> dict:
    """
    Menguji koneksi ke endpoint AI API untuk memverifikasi validitas API key dan mengukur latensi.
    """
    if not api_key or len(api_key.strip()) < 5:
        return {
            "success": False,
            "message": "API key tidak boleh kosong atau terlalu pendek.",
            "latency_ms": 0,
            "provider": provider,
            "model": model
        }

    prov, key, target_model, target_base_url = resolve_api_credentials(provider, api_key, model, base_url)
    start_time = time.time()

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            if prov == "gemini":
                clean_model = (target_model or "gemini-2.0-flash").replace("models/", "").strip()
                url = f"{target_base_url}/models/{clean_model}:generateContent?key={key}"
                body = {
                    "contents": [{"parts": [{"text": "Hello, ping test. Reply with 'OK'."}]}]
                }
                res = await client.post(url, json=body)
                latency = int((time.time() - start_time) * 1000)
                if res.status_code == 200:
                    return {
                        "success": True,
                        "message": f"Koneksi Google Gemini ({clean_model}) berhasil diverifikasi!",
                        "latency_ms": latency,
                        "provider": prov,
                        "model": clean_model
                    }
                else:
                    err_msg = res.json().get("error", {}).get("message", res.text)
                    return {
                        "success": False,
                        "message": f"Gagal ({res.status_code}): {err_msg}",
                        "latency_ms": latency,
                        "provider": prov,
                        "model": clean_model
                    }

            elif prov in ["openai", "deepseek", "groq", "custom"]:
                endpoint = f"{target_base_url}/chat/completions" if not target_base_url.endswith("/chat/completions") else target_base_url
                headers = {
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json"
                }
                body = {
                    "model": target_model,
                    "messages": [{"role": "user", "content": "Ping test. Reply with OK."}],
                    "max_tokens": 10
                }
                res = await client.post(endpoint, headers=headers, json=body)
                latency = int((time.time() - start_time) * 1000)
                if res.status_code == 200:
                    return {
                        "success": True,
                        "message": f"Koneksi {AI_PROVIDERS.get(prov, {}).get('name', prov)} ({target_model}) aktif & valid!",
                        "latency_ms": latency,
                        "provider": prov,
                        "model": target_model
                    }
                else:
                    err_data = res.json() if "application/json" in res.headers.get("content-type", "") else {"error": res.text}
                    err_msg = err_data.get("error", {}).get("message", res.text) if isinstance(err_data.get("error"), dict) else str(err_data.get("error", res.text))
                    return {
                        "success": False,
                        "message": f"Gagal ({res.status_code}): {err_msg[:200]}",
                        "latency_ms": latency,
                        "provider": prov,
                        "model": target_model
                    }
            else:
                return {
                    "success": False,
                    "message": f"Provider '{prov}' belum didukung.",
                    "latency_ms": 0,
                    "provider": prov,
                    "model": target_model
                }

    except Exception as e:
        latency = int((time.time() - start_time) * 1000)
        return {
            "success": False,
            "message": f"Kesalahan koneksi: {str(e)}",
            "latency_ms": latency,
            "provider": prov,
            "model": target_model
        }

async def fetch_remote_models(provider: str, api_key: str = None, base_url: str = None) -> dict:
    """
    Mengambil daftar model secara dinamis langsung dari API Google Generative AI,
    OpenAI, Groq, atau DeepSeek menggunakan API Key pengguna.
    """
    prov, key, _, target_base_url = resolve_api_credentials(provider, api_key, None, base_url)
    default_list = AI_PROVIDERS.get(prov, {}).get("models", [])
    
    if not key or len(key.strip()) < 5:
        return {
            "success": True,
            "is_live": False,
            "models": default_list,
            "default_model": AI_PROVIDERS.get(prov, {}).get("default_model", "")
        }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if prov == "gemini":
                url = f"{target_base_url}/models?key={key}"
                res = await client.get(url)
                if res.status_code == 200:
                    data = res.json()
                    models_list = []
                    for m in data.get("models", []):
                        methods = m.get("supportedGenerationMethods", [])
                        if "generateContent" in methods:
                            model_id = m.get("name", "").replace("models/", "")
                            display_name = m.get("displayName", model_id)
                            models_list.append({
                                "id": model_id,
                                "label": f"{display_name} ({model_id})",
                                "description": m.get("description", "")
                            })
                    if models_list:
                        return {
                            "success": True,
                            "is_live": True,
                            "models": models_list,
                            "default_model": "gemini-2.0-flash" if any(x["id"] == "gemini-2.0-flash" for x in models_list) else models_list[0]["id"]
                        }
            elif prov in ["openai", "deepseek", "groq", "custom"]:
                endpoint = f"{target_base_url}/models"
                headers = {"Authorization": f"Bearer {key}"}
                res = await client.get(endpoint, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    raw_models = data.get("data", [])
                    models_list = []
                    for m in raw_models:
                        model_id = m.get("id", "")
                        if prov == "openai" and not any(model_id.startswith(p) for p in ["gpt", "o1", "o3", "chat"]):
                            continue
                        models_list.append({
                            "id": model_id,
                            "label": model_id,
                            "description": ""
                        })
                    models_list.sort(key=lambda x: x["id"])
                    if models_list:
                        return {
                            "success": True,
                            "is_live": True,
                            "models": models_list,
                            "default_model": AI_PROVIDERS.get(prov, {}).get("default_model", "")
                        }
    except Exception:
        pass

    return {
        "success": True,
        "is_live": False,
        "models": default_list,
        "default_model": AI_PROVIDERS.get(prov, {}).get("default_model", "")
    }

async def _call_llm(
    provider: str,
    api_key: str,
    model: str,
    base_url: str,
    prompt: str,
    system_prompt: str = "Anda adalah Chief Quantitative Market Analyst & Algorithmic Trading Strategist profesional.",
    json_format: bool = True
) -> dict:
    """
    Eksekutor pemanggilan LLM multi-provider asinkron.
    """
    async with httpx.AsyncClient(timeout=18.0) as client:
        if provider == "gemini":
            clean_model = (model or "gemini-2.0-flash").replace("models/", "").strip()
            url = f"{base_url}/models/{clean_model}:generateContent?key={api_key}"
            payload = {
                "contents": [
                    {"role": "user", "parts": [{"text": f"SYSTEM INSTRUCTION: {system_prompt}\n\nUSER PROMPT: {prompt}"}]}
                ]
            }
            if json_format:
                payload["generationConfig"] = {
                    "responseMimeType": "application/json",
                    "temperature": 0.2
                }
            else:
                payload["generationConfig"] = {
                    "temperature": 0.4
                }

            res = await client.post(url, json=payload)
            if res.status_code == 200:
                data = res.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                if json_format:
                    clean_text = text.strip()
                    if clean_text.startswith("```json"):
                        clean_text = clean_text[7:]
                    if clean_text.endswith("```"):
                        clean_text = clean_text[:-3]
                    return json.loads(clean_text.strip())
                return {"text": text}
            else:
                raise Exception(f"Gemini API error ({res.status_code}): {res.text}")

        else:
            # OpenAI, DeepSeek, Groq, Custom
            endpoint = f"{base_url}/chat/completions" if not base_url.endswith("/chat/completions") else base_url
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            body = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3
            }
            if json_format and provider in ["openai", "deepseek", "groq"]:
                body["response_format"] = {"type": "json_object"}

            res = await client.post(endpoint, headers=headers, json=body)
            if res.status_code == 200:
                content = res.json()["choices"][0]["message"]["content"]
                if json_format:
                    clean_text = content.strip()
                    if clean_text.startswith("```json"):
                        clean_text = clean_text[7:]
                    if clean_text.endswith("```"):
                        clean_text = clean_text[:-3]
                    return json.loads(clean_text.strip())
                return {"text": content}
            else:
                raise Exception(f"{provider} API error ({res.status_code}): {res.text}")

async def generate_ai_analysis(
    mode: str = "overview",
    asset_data: dict = None,
    technical_data: dict = None,
    dev_data: dict = None,
    macro_data: dict = None,
    custom_prompt: str = None,
    provider: str = None,
    api_key: str = None,
    model: str = None,
    base_url: str = None
) -> dict:
    """
    Engine Analisa Kuantitatif Multi-Opsi yang terhubung ke AI (atau Heuristic Fallback):
    - mode: 'overview' | 'scalping' | 'swing' | 'investing' | 'scenarios' | 'chat'
    """
    asset_data = asset_data or {}
    technical_data = technical_data or {}
    dev_data = dev_data or {}
    macro_data = macro_data or {}

    symbol = asset_data.get("symbol", "ASSET")
    price = asset_data.get("price", 0.0)
    change_pct = asset_data.get("change_pct", 0.0)

    pattern = technical_data.get("pattern", "Channel / Range")
    pattern_type = technical_data.get("type", "Neutral")
    direction = technical_data.get("direction") or technical_data.get("tp_sl", {}).get("direction", "LONG")
    is_bearish = technical_data.get("is_bearish") if "is_bearish" in technical_data else (direction == "SHORT" or "BEAR" in str(pattern_type).upper())
    rsi = technical_data.get("rsi", 50.0)
    atr = technical_data.get("atr", max(0.01, price * 0.015))
    macd = technical_data.get("macd", {})
    bb = technical_data.get("bollinger_bands", {})
    vol_anomaly = technical_data.get("volume_anomaly", False)
    tp = technical_data.get("tp_sl", {}).get("tp", price * (0.95 if is_bearish else 1.05))
    sl = technical_data.get("tp_sl", {}).get("sl", price * (1.05 if is_bearish else 0.95))
    rr = technical_data.get("tp_sl", {}).get("risk_reward", 2.0)
    swing_high = technical_data.get("swing_high", price * 1.04)
    swing_low = technical_data.get("swing_low", price * 0.96)

    dev_score = dev_data.get("dev_score", 0) if dev_data else 0
    fed_rate = macro_data.get("fed_rate", "5.25% - 5.50%")
    cpi = macro_data.get("cpi_yoy", "3.1%")
    sentiment = macro_data.get("market_sentiment", "Neutral")

    prov, key, target_model, target_base_url = resolve_api_credentials(provider, api_key, model, base_url)
    has_api_key = bool(key and len(key.strip()) > 8)

    # 1. Jika API key tersedia, lakukan pemanggilan ke Neural Model
    if has_api_key:
        try:
            start_ts = time.time()
            prompt = _build_prompt_for_mode(
                mode=mode,
                symbol=symbol,
                price=price,
                change_pct=change_pct,
                pattern=pattern,
                pattern_type=pattern_type,
                direction=direction,
                is_bearish=is_bearish,
                rsi=rsi,
                atr=atr,
                macd=macd,
                bb=bb,
                vol_anomaly=vol_anomaly,
                tp=tp,
                sl=sl,
                rr=rr,
                swing_high=swing_high,
                swing_low=swing_low,
                dev_score=dev_score,
                fed_rate=fed_rate,
                cpi=cpi,
                sentiment=sentiment,
                custom_prompt=custom_prompt
            )

            is_chat = (mode == "chat")
            ai_res = await _call_llm(
                provider=prov,
                api_key=key,
                model=target_model,
                base_url=target_base_url,
                prompt=prompt,
                json_format=not is_chat
            )

            latency = int((time.time() - start_ts) * 1000)
            
            # Format output jika chat
            if is_chat:
                return {
                    "mode": "chat",
                    "answer": ai_res.get("text", ""),
                    "provider": prov,
                    "model": target_model,
                    "is_live_ai": True,
                    "latency_ms": latency
                }

            # Merge metadata
            ai_res["provider"] = prov
            ai_res["model"] = target_model
            ai_res["is_live_ai"] = True
            ai_res["latency_ms"] = latency
            ai_res["mode"] = mode
            return ai_res

        except Exception as e:
            # Jika panggilan AI gagal (misal rate limit / kuota habis), log dan fallback ke Heuristic Engine
            print(f"Peringatan: Panggilan AI ({prov}/{target_model}) gagal: {e}. Menggunakan Quantitative Fallback.")

    # 2. Intelligent Quantitative Fallback Engine (Zero-Key & Zero-Cost)
    return _generate_heuristic_fallback(
        mode=mode,
        symbol=symbol,
        price=price,
        change_pct=change_pct,
        pattern=pattern,
        pattern_type=pattern_type,
        direction=direction,
        is_bearish_param=is_bearish,
        rsi=rsi,
        atr=atr,
        macd=macd,
        bb=bb,
        vol_anomaly=vol_anomaly,
        tp=tp,
        sl=sl,
        rr=rr,
        swing_high=swing_high,
        swing_low=swing_low,
        dev_score=dev_score,
        fed_rate=fed_rate,
        cpi=cpi,
        sentiment=sentiment,
        custom_prompt=custom_prompt,
        prov=prov,
        target_model=target_model
    )

def _build_prompt_for_mode(
    mode: str, symbol: str, price: float, change_pct: float,
    pattern: str, pattern_type: str, direction: str, is_bearish: bool,
    rsi: float, atr: float,
    macd: dict, bb: dict, vol_anomaly: bool, tp: float, sl: float,
    rr: float, swing_high: float, swing_low: float,
    dev_score: int, fed_rate: str, cpi: str, sentiment: str,
    custom_prompt: str = None
) -> str:
    """Menyusun prompt analitik sesuai mode yang diminta."""
    pos_str = "SHORT / SELL (Jual)" if is_bearish else "LONG / BUY (Beli)"
    context = f"""
DATA PASAR REAL-TIME:
- Aset: {symbol} | Harga Saat Ini: ${price:,.4f} ({change_pct:+.2f}%)
- Sinyal & Posisi Rekomendasi: {direction} ({pos_str}) | Bias Pola: {pattern_type}
- Pola Geometris: {pattern}
- Indikator Momentum: RSI={rsi:.2f}, ATR={atr:.4f}, Volume Anomaly={vol_anomaly}
- MACD: {macd.get('macd', 0)}, Signal: {macd.get('signal', 0)}, Hist: {macd.get('histogram', 0)}
- Bollinger Bands: Upper=${bb.get('upper', 0)}, Mid=${bb.get('middle', 0)}, Lower=${bb.get('lower', 0)}
- Level Kunci: Swing High=${swing_high:,.4f}, Swing Low=${swing_low:,.4f}
- Kalkulasi TP/SL: TP=${tp:,.4f} ({'di bawah entry' if is_bearish else 'di atas entry'}), SL=${sl:,.4f} ({'di atas entry' if is_bearish else 'di bawah entry'}), R:R=1:{rr}
- Skor Dev/OnChain: {dev_score}/100
- Makro: Fed Rate {fed_rate}, CPI YoY {cpi}, Sentiment {sentiment}
"""

    if mode == "scalping":
        return f"""{context}
Tugas: Buat analisis strategi SCALPING (Timeframe 1m - 15m) untuk aset {symbol}.
Jawab dalam Bahasa Indonesia dengan format JSON persis:
{{
  "headline": "Ringkasan setup scalping 1 kalimat",
  "scalp_bias": "STRONG_LONG" / "LONG" / "NEUTRAL" / "SHORT" / "STRONG_SHORT",
  "execution_trigger": "Kondisi pemicu eksekusi order instan",
  "entry_zone": {{"min": {price * 0.998}, "max": {price * 1.002}}},
  "take_profit_1": {price + atr * 0.8},
  "take_profit_2": {price + atr * 1.5},
  "stop_loss_tight": {price - atr * 0.6},
  "volume_verdict": "Penjelasan lonjakan volume / likuiditas",
  "invalidation_condition": "Kondisi yang langsung membatalkan setup scalping",
  "tips": ["Tip 1 manajemen eksekusi", "Tip 2 slippage/spread"]
}}
"""

    elif mode == "swing":
        return f"""{context}
Tugas: Buat analisis strategi SWING TRADING (Timeframe 4h - 1D) untuk aset {symbol}.
Jawab dalam Bahasa Indonesia dengan format JSON persis:
{{
  "headline": "Judul rencana swing trade komprehensif",
  "swing_bias": "BULLISH" / "BEARISH" / "ACCUMULATION",
  "key_support_zone": {{"level1": {swing_low}, "level2": {swing_low * 0.98}}},
  "key_resistance_zone": {{"level1": {swing_high}, "level2": {swing_high * 1.02}}},
  "fibonacci_levels": {{
    "fib_0382": {swing_low + (swing_high - swing_low) * 0.382},
    "fib_0500": {swing_low + (swing_high - swing_low) * 0.500},
    "fib_0618": {swing_low + (swing_high - swing_low) * 0.618}
  }},
  "entry_strategy": "Penjelasan di mana dan bagaimana melakukan entry bertahap",
  "trailing_stop_rule": "Aturan menggeser stop loss untuk mengamankan profit",
  "target_swing_tp": {tp},
  "risk_reward": "1:{rr}",
  "catalyst_watchlist": ["Katalis 1", "Katalis 2"]
}}
"""

    elif mode == "investing":
        return f"""{context}
Tugas: Buat analisis fundamental & makro untuk INVESTASI JANGKA PANJANG (Multi-Bulan/Tahun) aset {symbol}.
Jawab dalam Bahasa Indonesia dengan format JSON persis:
{{
  "headline": "Thesis investasi jangka panjang",
  "verdict": "STRONG_BUY" / "ACCUMULATE" / "HOLD" / "REDUCE",
  "macro_impact_analysis": "Penjelasan pengaruh Fed Rate & inflasi terhadap aset ini",
  "dev_ecosystem_health": "Interpretasi skor aktivitas developer GitHub ({dev_score}/100)",
  "dca_accumulation_tiers": [
    {{"tier": "Tier 1 (Current Entry)", "price_target": {price * 0.97}, "allocation_pct": 30}},
    {{"tier": "Tier 2 (Strong Support)", "price_target": {price * 0.90}, "allocation_pct": 40}},
    {{"tier": "Tier 3 (Deep Value Panic)", "price_target": {price * 0.82}, "allocation_pct": 30}}
  ],
  "target_12m_valuation": {price * 1.25},
  "primary_risks": ["Risiko regulasi/makro", "Risiko likuiditas"]
}}
"""

    elif mode == "scenarios":
        return f"""{context}
Tugas: Buat simulasi MULTI-SKENARIO KUANTITATIF (Bullish, Base, Bearish) untuk aset {symbol}.
Jawab dalam Bahasa Indonesia dengan format JSON persis:
{{
  "headline": "Simulasi Probabilitas 3 Skenario Pasar",
  "bull_case": {{
    "probability_pct": 55,
    "target_price": {swing_high * 1.08},
    "catalyst": "Katalis pemicu reli penguatan",
    "action": "Tindakan trading yang disarankan jika terjadi"
  }},
  "base_case": {{
    "probability_pct": 30,
    "target_range": "{price * 0.98:,.2f} - {price * 1.02:,.2f}",
    "catalyst": "Katalis konsolidasi / pergerakan sideways",
    "action": "Strategi range-bound trading"
  }},
  "bear_case": {{
    "probability_pct": 15,
    "target_price": {swing_low * 0.92},
    "catalyst": "Katalis pemicu breakdown & koreksi",
    "invalidation_level": {swing_low},
    "action": "Rencana cut loss & proteksi modal"
  }},
  "recommended_overall_posture": "Postur portofolio keseluruhan (Agresif / Terukur / Defensif)"
}}
"""

    elif mode == "chat":
        user_query = custom_prompt or "Bagaimana pandangan analitik Anda terhadap kondisi aset ini saat ini?"
        return f"""{context}
Pertanyaan Trader: "{user_query}"

Jawab pertanyaan di atas secara tajam, objektif, profesional, dan berbasis data kuantitatif yang tercantum di atas dalam Bahasa Indonesia.
Sertakan rekomendasi aksi spesifik (Entry, Exit, Wait & See) beserta alasan matematis dan batas risiko yang tegas.
"""

    else:
        # Default 'overview'
        return f"""{context}
Tugas: Buat ringkasan eksekutif 3-layer (Teknikal, Dev/On-Chain, Makro) untuk aset {symbol}.
Jawab dalam Bahasa Indonesia dengan format JSON persis:
{{
  "headline": "Ringkasan singkat setup",
  "verdict": "BULLISH" / "BEARISH" / "NEUTRAL",
  "confidence": 80,
  "key_points": ["Poin 1", "Poin 2", "Poin 3"],
  "summary_text": "Deskripsi naratif 2-3 paragraf komprehensif",
  "parameters": {{
    "entry": {price},
    "tp": {tp},
    "sl": {sl},
    "risk_reward": "1:{rr}",
    "rsi": {rsi},
    "fed_rate": "{fed_rate}"
  }}
}}
"""

def _generate_heuristic_fallback(
    mode: str, symbol: str, price: float, change_pct: float,
    pattern: str, pattern_type: str, rsi: float, atr: float,
    macd: dict, bb: dict, vol_anomaly: bool, tp: float, sl: float,
    rr: float, swing_high: float, swing_low: float,
    dev_score: int, fed_rate: str, cpi: str, sentiment: str,
    custom_prompt: str = None, prov: str = "openai", target_model: str = "local-heuristic",
    direction: str = "LONG", is_bearish_param: Optional[bool] = None
) -> dict:
    """
    Fallback Kuantitatif Berbasis Formula Matematis jika API key belum dimasukkan.
    Menghasilkan data analisis lengkap dan kaya untuk setiap mode.
    """
    if is_bearish_param is not None:
        is_bearish = is_bearish_param
        is_bullish = not is_bearish
    elif str(direction).upper() == "SHORT" or any(w in str(pattern_type).upper() for w in ["BEAR", "SHORT"]):
        is_bearish = True
        is_bullish = False
    elif str(direction).upper() == "LONG" or any(w in str(pattern_type).upper() for w in ["BULL", "LONG"]):
        is_bullish = True
        is_bearish = False
    else:
        is_bullish = (rsi < 42 and vol_anomaly)
        is_bearish = (rsi > 68 and not vol_anomaly)

    verdict = "BEARISH" if is_bearish else ("BULLISH" if is_bullish else "NEUTRAL")
    confidence = 85 if (vol_anomaly and is_bullish) or (rsi > 70 and is_bearish) else 75

    base_meta = {
        "provider": prov,
        "model": "Local Quantitative Heuristic Engine",
        "is_live_ai": False,
        "latency_ms": 1,
        "mode": mode
    }

    if mode == "scalping":
        entry_offset = atr * 0.15
        if is_bearish:
            scalp_bias = "STRONG_SHORT" if vol_anomaly else "SHORT"
            tp1 = round(price - atr * 0.9, 2 if price > 10 else 4)
            tp2 = round(price - atr * 1.8, 2 if price > 10 else 4)
            sl_tight = round(price + atr * 0.75, 2 if price > 10 else 4)
            exec_trigger = f"Konfirmasi breakdown candle 5m di bawah ${price - entry_offset:,.2f} dengan peningkatan volume order jual."
            inv_cond = f"Candle 5m ditutup berbalik arah menembus level ${swing_high:,.2f}."
        else:
            scalp_bias = "STRONG_LONG" if (is_bullish and vol_anomaly) else ("LONG" if is_bullish else "NEUTRAL")
            tp1 = round(price + atr * 0.9, 2 if price > 10 else 4)
            tp2 = round(price + atr * 1.8, 2 if price > 10 else 4)
            sl_tight = round(price - atr * 0.75, 2 if price > 10 else 4)
            exec_trigger = f"Konfirmasi breakout candle 5m di atas ${price + entry_offset:,.2f} dengan volume akumulasi di atas rata-rata."
            inv_cond = f"Candle 5m ditutup berlawanan arah menembus level ${swing_low:,.2f}."

        return {
            **base_meta,
            "headline": f"Setup Scalping {scalp_bias} pada {symbol} (ATR Momentum Index)",
            "scalp_bias": scalp_bias,
            "execution_trigger": exec_trigger,
            "entry_zone": {
                "min": round(price - entry_offset, 2 if price > 10 else 4),
                "max": round(price + entry_offset, 2 if price > 10 else 4)
            },
            "take_profit_1": tp1,
            "take_profit_2": tp2,
            "stop_loss_tight": sl_tight,
            "volume_verdict": "Lonjakan volume terdeteksi (>1.5x MA-20), likuiditas order book mendukung eksekusi cepat." if vol_anomaly else "Volume transaksi stabil dalam rentang normal, hindari overtrading.",
            "invalidation_condition": inv_cond,
            "tips": [
                "Gunakan limit order pada zona entri untuk meminimalisir slippage.",
                "Pindahkan stop loss ke Breakeven (BEP) segera setelah Target TP1 tercapai."
            ]
        }

    elif mode == "swing":
        fib_range = max(0.0001, swing_high - swing_low)
        swing_bias = "BEARISH" if is_bearish else ("BULLISH" if is_bullish else "ACCUMULATION")
        entry_strategy = (
            f"Eksekusi posisi Short pada retest resistance level ${swing_high:,.2f} atau rejection pada Golden Pocket Fibonacci 0.618 (${swing_high - fib_range * 0.382:,.2f})."
            if is_bearish else
            f"Akumulasi bertahap pada konvergensi Golden Pocket Fibonacci 0.618 (${swing_low + fib_range * 0.618:,.2f}) atau saat retest pola {pattern}."
        )
        trailing_rule = (
            f"Trailing stop dinamis 1.5x ATR (${atr * 1.5:,.2f}) di atas swing high terakhir pada grafik 4-Jam."
            if is_bearish else
            f"Trailing stop dinamis 1.5x ATR (${atr * 1.5:,.2f}) di bawah swing low terakhir pada grafik 4-Jam."
        )

        return {
            **base_meta,
            "headline": f"Struktur Swing Trade {pattern}: Pivot Fib Retracement & Trend Expansion",
            "swing_bias": swing_bias,
            "key_support_zone": {
                "level1": round(swing_low, 2 if price > 10 else 4),
                "level2": round(swing_low - atr, 2 if price > 10 else 4)
            },
            "key_resistance_zone": {
                "level1": round(swing_high, 2 if price > 10 else 4),
                "level2": round(swing_high + atr, 2 if price > 10 else 4)
            },
            "fibonacci_levels": {
                "fib_0382": round(swing_low + fib_range * 0.382, 2 if price > 10 else 4),
                "fib_0500": round(swing_low + fib_range * 0.500, 2 if price > 10 else 4),
                "fib_0618": round(swing_low + fib_range * 0.618, 2 if price > 10 else 4)
            },
            "entry_strategy": entry_strategy,
            "trailing_stop_rule": trailing_rule,
            "target_swing_tp": round(tp, 2 if price > 10 else 4),
            "risk_reward": f"1:{rr}",
            "catalyst_watchlist": [
                f"Sinyal konvergensi MACD Histogram ({macd.get('histogram', 0):+.4f}) terhadap garis sinyal.",
                f"Sikap pasar terhadap rilis suku bunga Federal Reserve ({fed_rate})."
            ]
        }

    elif mode == "investing":
        return {
            **base_meta,
            "headline": f"Thesis Alokasi Portofolio Jangka Panjang & Siklus Makro {symbol}",
            "verdict": "ACCUMULATE" if is_bullish else ("HOLD" if not is_bearish else "REDUCE"),
            "macro_impact_analysis": f"Suku bunga acuan {fed_rate} dan inflasi CPI {cpi} mengindikasikan fase siklus moneter ketat. Aset dengan keunggulan likuiditas dan aktivitas ekosistem tinggi cenderung memimpin saat pelonggaran terjadi.",
            "dev_ecosystem_health": f"Skor aktivitas developer repositori berada pada level {dev_score}/100. Menunjukkan komitmen riset dan pengembangan tim inti yang berkesinambungan.",
            "dca_accumulation_tiers": [
                {"tier": "Tier 1 (Market Entry)", "price_target": round(price * 0.97, 2 if price > 10 else 4), "allocation_pct": 30},
                {"tier": "Tier 2 (Major Support Dip)", "price_target": round(price * 0.89, 2 if price > 10 else 4), "allocation_pct": 40},
                {"tier": "Tier 3 (Deep Value Panic)", "price_target": round(price * 0.78, 2 if price > 10 else 4), "allocation_pct": 30}
            ],
            "target_12m_valuation": round(price * (1.35 if is_bullish else 1.15), 2 if price > 10 else 4),
            "primary_risks": [
                "Volatilitas makro global dan penguatan indeks Dolar AS.",
                "Rotasi likuiditas institusional pada instrumen pasar uang berimbal hasil tinggi."
            ]
        }

    elif mode == "scenarios":
        bull_prob = 60 if is_bullish else (25 if is_bearish else 45)
        bear_prob = 15 if is_bullish else (55 if is_bearish else 25)
        base_prob = 100 - bull_prob - bear_prob

        return {
            **base_meta,
            "headline": f"Model Simulasi Monte-Carlo & Skenario Probabilitas {symbol}",
            "bull_case": {
                "probability_pct": bull_prob,
                "target_price": round(swing_high + atr * 2.5, 2 if price > 10 else 4),
                "catalyst": f"Breakout terkonfirmasi dari pola geometris {pattern} didukung lonjakan volume akumulasi institusi.",
                "action": "Tambah posisi beli (pyramiding) dengan trailing stop di level breakout."
            },
            "base_case": {
                "probability_pct": base_prob,
                "target_range": f"${price * 0.97:,.2f} - ${price * 1.03:,.2f}",
                "catalyst": "Konsolidasi di dalam range batas Bollinger Bands sambil menyerap penawaran likuiditas pasar.",
                "action": "Buy low sell high di dekat batas support/resisten range terdekat."
            },
            "bear_case": {
                "probability_pct": bear_prob,
                "target_price": round(swing_low - atr * 2.0, 2 if price > 10 else 4),
                "catalyst": f"Penembusan ke bawah level support swing low ${swing_low:,.2f} diiringi sentimen penghindaran risiko.",
                "invalidation_level": round(swing_low, 2 if price > 10 else 4),
                "action": "Eksekusi proteksi stop loss ketat atau lindung nilai (hedging)."
            },
            "recommended_overall_posture": "Terukur & Berdisiplin (Gunakan alokasi modal bertahap dengan rasio R:R minimum 1:2.0)."
        }

    elif mode == "chat":
        q = custom_prompt or "Bagaimana setup terbaik?"
        answer = (
            f"**Analisis Kuantitatif untuk {symbol}:**\n\n"
            f"Berdasarkan algoritma matematis saat ini pada harga **${price:,.2f}** ({change_pct:+.2f}%):\n\n"
            f"1. **Pola & Sinyal:** Terkonfirmasi pembentukan pola **{pattern}** dengan bias **{pattern_type}** (Posisi: **{'SHORT / SELL' if is_bearish else 'LONG / BUY'}**). Indikator RSI berada di {rsi:.1f}, "
            f"mengindikasikan {'kondisi oversold berpotensi rebound' if rsi < 40 else ('kondisi overbought waspada koreksi' if rsi > 65 else 'momentum berada di area ekuilibrium netral')}.\n"
            f"2. **Batas Risiko Terhitung (ATR):** Rekomendasi target Take Profit berada di **${tp:,.2f}** dan Stop Loss protektif di **${sl:,.2f}** (Rasio R:R 1:{rr}).\n"
            f"3. **Jawaban Pertanyaan:** Menanggapi pertanyaan Anda *\"{q}\"*, postur yang paling direkomendasikan adalah "
            f"**{'Mempersiapkan posisi Short/Jual' if is_bearish else ('Mempersiapkan posisi Long/Beli' if is_bullish else 'Menunggu konfirmasi breakout range')}** "
            f"dengan batas risiko yang telah ditentukan. *(Catatan: Masukkan API Key Anda di Pengaturan AI untuk analisis reasoning neural yang lebih mendalam)*."
        )
        return {
            **base_meta,
            "answer": answer
        }

    else:
        # Overview
        vol_text = "Tercatat lonjakan volume signifikan (>1.5x rata-rata 20 hari)" if vol_anomaly else "Volume transaksi bergerak normal dalam batas rata-rata"
        rsi_text = "zona oversold (potensi akumulasi)" if rsi < 35 else ("zona overbought (waspada pullback)" if rsi > 68 else "momentum seimbang")

        key_points = [
            f"Struktur chart terkonfirmasi membentuk pola geometris **{pattern}** dengan sinyal **{pattern_type}** ({'Posisi Direkomendasikan: SHORT' if is_bearish else 'Posisi Direkomendasikan: LONG'}).",
            f"Indikator momentum RSI berada di level {rsi:.1f} ({rsi_text}). {vol_text}.",
            f"Kalkulasi ATR mengindikasikan target Take Profit di **${tp:,.2f}** dan proteksi Stop Loss di **${sl:,.2f}** (Rasio R:R 1:{rr})."
        ]
        if dev_score > 0:
            key_points.append(f"Aktivitas tim developer repositori menunjukkan skor keaktifan {dev_score}/100 dengan commit dan merge stabil.")

        headline = f"Setup {verdict} ({'SHORT / SELL' if is_bearish else 'LONG / BUY'}) Terdeteksi pada {symbol} dengan Pola {pattern}"
        summary_text = (
            f"{symbol} saat ini diperdagangkan pada level ${price:,.2f} ({change_pct:+.2f}%). "
            f"Algoritma kuantitatif mendeteksi konvergensi pola {pattern} yang didukung sinyal teknikal {pattern_type} ({'Posisi Direkomendasikan: SHORT' if is_bearish else 'Posisi Direkomendasikan: LONG'}). "
            f"{vol_text}. Dalam konteks makro dengan suku bunga {fed_rate}, "
            f"manajemen risiko dengan disiplin rasio Risk-Reward 1:{rr} sangat direkomendasikan."
        )

        return {
            **base_meta,
            "headline": headline,
            "verdict": verdict,
            "confidence": confidence,
            "key_points": key_points,
            "summary_text": summary_text,
            "parameters": {
                "entry": price,
                "tp": tp,
                "sl": sl,
                "risk_reward": f"1:{rr}",
                "rsi": rsi,
                "fed_rate": fed_rate,
                "direction": "SHORT" if is_bearish else "LONG"
            }
        }

# Backwards compatibility alias
async def generate_ai_narrative(asset_data: dict, technical_data: dict, dev_data: dict = None, macro_data: dict = None) -> dict:
    return await generate_ai_analysis(
        mode="overview",
        asset_data=asset_data,
        technical_data=technical_data,
        dev_data=dev_data,
        macro_data=macro_data
    )
