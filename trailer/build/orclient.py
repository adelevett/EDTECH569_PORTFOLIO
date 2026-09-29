"""OpenRouter client for build scripts only. Loads key from repo-root .env.
Keeps a spend ledger (ledger.jsonl) and refuses new paid calls past the stop line."""
import base64, json, os, time, pathlib, requests

ROOT = pathlib.Path(__file__).resolve().parents[2]
BUILD = pathlib.Path(__file__).resolve().parent
LEDGER = BUILD / "ledger.jsonl"
STOP_AT = 9.00     # stop generating at $9
HARD_CAP = 10.00
API = "https://openrouter.ai/api/v1"


def _key():
    env = ROOT / ".env"
    for line in env.read_text().splitlines():
        if line.startswith("OPENROUTER_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("OPENROUTER_API_KEY missing from .env")


def _h(json_ct=True):
    h = {"Authorization": f"Bearer {_key()}", "X-Title": "TBM Sea-All trailer build"}
    if json_ct:
        h["Content-Type"] = "application/json"
    return h


def spent():
    if not LEDGER.exists():
        return 0.0
    return sum(json.loads(l).get("cost", 0) or 0 for l in LEDGER.read_text().splitlines() if l.strip())


def key_usage():
    r = requests.get(f"{API}/key", headers=_h(False), timeout=60)
    return r.json()["data"]["usage"]


def _log(entry):
    with LEDGER.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    print(f"  [ledger] {entry['kind']} {entry['model']} cost=${entry.get('cost', 0):.4f}  total=${spent():.4f}")


def guard(estimate=0.0):
    s = spent()
    if s + estimate >= STOP_AT:
        raise SystemExit(f"SPEND GUARD: spent ${s:.4f} + est ${estimate:.4f} would reach stop line ${STOP_AT}")


def _data_url(path):
    p = pathlib.Path(path)
    mt = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mt};base64," + base64.b64encode(p.read_bytes()).decode()


def image(model, prompt, out, aspect_ratio="16:9", quality=None, refs=(), estimate=0.3,
          extra=None, purpose=""):
    guard(estimate)
    body = {"model": model, "prompt": prompt, "n": 1}
    if aspect_ratio:
        body["aspect_ratio"] = aspect_ratio
    if quality:
        body["quality"] = quality
    if refs:
        body["input_references"] = [{"type": "image_url", "image_url": {"url": _data_url(r)}} for r in refs]
    if extra:
        body.update(extra)
    t0 = time.time()
    for attempt in range(3):
        r = requests.post(f"{API}/images", headers=_h(), json=body, timeout=600)
        if r.status_code == 200:
            break
        print("  image error", r.status_code, r.text[:500])
        if r.status_code in (400, 401, 402, 403):
            raise SystemExit("image request rejected")
        time.sleep(5 * (attempt + 1))
    j = r.json()
    usage = j.get("usage", {}) or {}
    cost = usage.get("cost")
    if cost is None:
        cost = estimate  # conservative if not reported
    d = j["data"][0]
    raw = base64.b64decode(d["b64_json"])
    out = pathlib.Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)
    _log({"t": time.time(), "kind": "image", "model": model, "purpose": purpose, "out": str(out.name),
          "quality": quality, "aspect": aspect_ratio, "refs": len(refs), "usage": usage, "cost": cost,
          "secs": round(time.time() - t0, 1), "media_type": d.get("media_type")})
    return out, usage


def generation_cost(gen_id, tries=8):
    for i in range(tries):
        r = requests.get(f"{API}/generation", params={"id": gen_id}, headers=_h(False), timeout=60)
        if r.status_code == 200:
            d = r.json().get("data", {})
            c = d.get("total_cost")
            if c is not None:
                return c, d
        time.sleep(2 + 2 * i)
    return None, None


def tts(model, text, voice, out, style=None, fmt="pcm", estimate=0.02, purpose="", provider_opts=None,
        speed=None):
    guard(estimate)
    body = {"model": model, "input": text, "voice": voice, "response_format": fmt}
    if speed:
        body["speed"] = speed
    if style or provider_opts:
        body["provider"] = {"options": provider_opts or {"google-ai-studio": {"speech_metadata": {"style": style}}}}
    t0 = time.time()
    r = requests.post(f"{API}/audio/speech", headers=_h(), json=body, timeout=300)
    if r.status_code != 200:
        print("  tts error", r.status_code, r.text[:500])
        raise SystemExit("tts failed")
    out = pathlib.Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(r.content)
    gid = r.headers.get("X-Generation-Id")
    cost, meta = generation_cost(gid) if gid else (None, None)
    _log({"t": time.time(), "kind": "tts", "model": model, "purpose": purpose, "out": out.name, "voice": voice,
          "chars": len(text), "gen_id": gid, "cost": cost if cost is not None else estimate,
          "cost_reported": cost is not None, "ctype": r.headers.get("Content-Type"),
          "secs": round(time.time() - t0, 1)})
    return out, r.headers


def chat_audio(model, messages, out_prefix, estimate=0.1, purpose="", extra=None):
    """Music generation through chat/completions with audio output (streamed)."""
    guard(estimate)
    body = {"model": model, "messages": messages, "modalities": ["text", "audio"], "stream": True}
    if extra:
        body.update(extra)
    t0 = time.time()
    r = requests.post(f"{API}/chat/completions", headers=_h(), json=body, stream=True, timeout=900)
    if r.status_code != 200:
        print("  chat_audio error", r.status_code, r.text[:800])
        raise SystemExit("chat audio failed")
    audio_chunks, text_chunks, gid, usage, fmt_hint = [], [], None, None, None
    for line in r.iter_lines():
        if not line:
            continue
        s = line.decode("utf-8", "ignore")
        if not s.startswith("data: "):
            continue
        data = s[6:]
        if data.strip() == "[DONE]":
            break
        try:
            ch = json.loads(data)
        except Exception:
            continue
        gid = ch.get("id", gid)
        if ch.get("usage"):
            usage = ch["usage"]
        for c in ch.get("choices", []):
            delta = c.get("delta", {}) or {}
            a = delta.get("audio") or {}
            if a.get("data"):
                audio_chunks.append(a["data"])
            if a.get("format"):
                fmt_hint = a["format"]
            if delta.get("content"):
                text_chunks.append(delta["content"])
    raw = base64.b64decode("".join(audio_chunks)) if audio_chunks else b""
    out = pathlib.Path(out_prefix)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)
    cost = (usage or {}).get("cost")
    if cost is None and gid:
        cost, _ = generation_cost(gid)
    _log({"t": time.time(), "kind": "music", "model": model, "purpose": purpose, "out": out.name,
          "bytes": len(raw), "fmt_hint": fmt_hint, "gen_id": gid, "usage": usage,
          "cost": cost if cost is not None else estimate, "cost_reported": cost is not None,
          "text": "".join(text_chunks)[:500], "secs": round(time.time() - t0, 1)})
    return out, "".join(text_chunks), usage
