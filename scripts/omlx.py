#!/usr/bin/env python3
"""
omlx_grid.py - tune oMLX settings on this Mac, model by model.

Talks ONLY to the local oMLX server (127.0.0.1:8000). It never calls oMLX's
built-in benchmark, because that one uploads results to omlx.ai.

How it searches
  A full grid (every setting x every value x every model) is thousands of
  hours. Instead, for each model it sweeps one setting group at a time
  ("stages"), keeps the best value (only if it beats the current one by
  MIN_GAIN), and carries it into the next stage. Everything is measured with
  the same prompts.

Usage
  python3 omlx_grid.py --dry-run              # show the plan and time estimate, change nothing
  python3 omlx_grid.py                        # all local models, all stages
  python3 omlx_grid.py --models Qwen3.6-35B-A3B-oQ3e-mtp --stages mtp,kv
  python3 omlx_grid.py --restore              # put your original settings back
  python3 omlx_grid.py --report               # rebuild the report from saved results

  Results are saved after every run, so you can stop it (Ctrl-C) and start it
  again: finished runs are skipped. At the end your original settings are
  restored, unless you pass --apply-best MODEL to keep the winners for one model.

Outputs (in ./omlx_grid_results/)
  runs.jsonl   one line per run (all raw numbers)
  report.md    winners per model and every run in a table
  backup/      your settings before the first run

Requires: macOS, oMLX app running, Python 3.9+. No extra packages.
"""
import argparse, json, os, re, shutil, signal, statistics, subprocess, sys, threading, time, urllib.error, urllib.request, uuid

# ----------------------------------------------------------------------------
# Configuration: edit these to change what gets tested
# ----------------------------------------------------------------------------
BASE = "http://127.0.0.1:8000"
OUT = os.path.abspath("omlx_grid_results")
MIN_GAIN = 0.05          # a change must win by 5 % to replace the current value
GEN_TOKENS = 256         # tokens generated per speed test
CORPUS = "/Applications/oMLX.app/Contents/Resources/omlx/admin/bench_corpora/code_python.txt"
CHARS_PER_TOKEN = 4.15   # measured for this corpus with Qwen tokenizers

# Workloads: prompt tokens per test
W1, W2, W3, W48 = 1024, 16384, 32768, 49152

# Starting point for every model (oMLX defaults, with the risky extras off)
MODEL_BASE = dict(qwen35_ane_prefill_enabled=False, mtp_enabled=False, mtp_adaptive_max_depth=None,
                  mtp_fixed_depth=None, vlm_mtp_enabled=False, turboquant_kv_enabled=False, moe_expert_offload_enabled=False,
                  a8_prefill_enabled=None, specprefill_enabled=False, dflash_enabled=False,
                  max_context_window=65536)
# The memory tier the sweep starts with. "aggressive" is needed on a 32 GB Mac
# that also runs a VM; set to "balanced" if nothing else big is running.
GLOBAL_BASE = dict(memory_guard_tier="aggressive", memory_guard_custom_ceiling_gb=0.0,
                   memory_prefill_memory_guard=True, burst_decode_mode="balanced",
                   max_concurrent_requests=8, chunked_prefill=False, concurrent_priority="balanced",
                   prefill_priority="context", hot_cache_max_size="0", hot_cache_write_through=False,
                   gpu_keep_warm_interval=0.5, gpu_keep_warm_idle_window=300.0,
                   sampling_max_context_window=65536)

# Stages, in order. Each option is (name, model_settings, global_settings).
def stages_for(model_info):
    moe = "moe" in (model_info.get("config_model_type") or model_info.get("model_type") or "").lower()
    dense_qwen = (not moe) and "qwen" in model_info["id"].lower()
    has_mtp = "mtp" in model_info["id"].lower()
    gemma = "gemma" in model_info["id"].lower()
    S = []
    # Home Assistant suite first, so even a short run answers "which model for the house".
    # Gemma 4: oMLX may drive its MTP head through Lightning MTP or through VLM MTP,
    # so both are tried; the report shows which backend actually ran.
    ha = [("mtp_off", {}, {})]
    if has_mtp: ha.append(("mtp_on", dict(mtp_enabled=True), {}))
    if has_mtp and gemma: ha.append(("vlm_mtp_on", dict(vlm_mtp_enabled=True), {}))
    S.append(("ha", "ha", ha))
    if has_mtp and gemma:
        S.append(("mtp", "decode", [("off", {}, {}), ("lightning", dict(mtp_enabled=True), {}),
                                    ("vlm_mtp", dict(vlm_mtp_enabled=True), {}),
                                    ("vlm_mtp_block2", dict(vlm_mtp_enabled=True, vlm_mtp_draft_block_size=2), {}),
                                    ("vlm_mtp_block4", dict(vlm_mtp_enabled=True, vlm_mtp_draft_block_size=4), {})]))
    elif has_mtp:
        mtp = [("off", {}, {}), ("adaptive", dict(mtp_enabled=True), {})]
        if dense_qwen:   # oMLX enforces an adaptive ceiling of at least 4 on Qwen 27B
            mtp += [("adaptive5", dict(mtp_enabled=True, mtp_adaptive_max_depth=5), {})]
            mtp += [(f"fixed{d}", dict(mtp_enabled=True, mtp_fixed_depth=d), {}) for d in (1, 2, 3, 4)]
        else:
            mtp += [("adaptive2", dict(mtp_enabled=True, mtp_adaptive_max_depth=2), {})]
            mtp += [(f"fixed{d}", dict(mtp_enabled=True, mtp_fixed_depth=d), {}) for d in (1, 2, 3)]
        S.append(("mtp", "decode", mtp))
    S.append(("kv", "longctx", [
        ("native", dict(turboquant_kv_enabled=False), {}),
        ("affine8", dict(turboquant_kv_enabled=True, turboquant_kv_scheme="affine8", turboquant_kv_bits=8), {}),
        ("affine4", dict(turboquant_kv_enabled=True, turboquant_kv_scheme="affine4", turboquant_kv_bits=4), {}),
        ("turboquant4", dict(turboquant_kv_enabled=True, turboquant_kv_scheme="turboquant", turboquant_kv_bits=4), {})]))
    S.append(("burst", "w1tg", [(m, {}, dict(burst_decode_mode=m)) for m in ("off", "light", "balanced", "aggressive")]))
    S.append(("concurrency", "parallel", [(f"max{n}", {}, dict(max_concurrent_requests=n)) for n in (1, 2, 4, 8)]))
    S.append(("scheduler", "mixed", [(f"chunk{int(c)}_{p}", {}, dict(chunked_prefill=c, concurrent_priority=p))
                                     for c in (False, True) for p in ("prefill", "balanced", "decode")]))
    S.append(("memory", "memory", [
        ("safe", {}, dict(memory_guard_tier="safe")), ("balanced", {}, dict(memory_guard_tier="balanced")),
        ("aggressive", {}, dict(memory_guard_tier="aggressive")),
        ("custom24", {}, dict(memory_guard_tier="custom", memory_guard_custom_ceiling_gb=24.0)),
        ("custom26", {}, dict(memory_guard_tier="custom", memory_guard_custom_ceiling_gb=26.0))]))
    S.append(("prefill_priority", "w3ttft", [(p, {}, dict(prefill_priority=p)) for p in ("context", "speed")]))
    S.append(("cache", "resume", [
        ("hot0", {}, dict(hot_cache_max_size="0", hot_cache_write_through=False)),
        ("hot2GB", {}, dict(hot_cache_max_size="2GB", hot_cache_write_through=False)),
        ("hot4GB", {}, dict(hot_cache_max_size="4GB", hot_cache_write_through=False)),
        ("hot4GB_wt", {}, dict(hot_cache_max_size="4GB", hot_cache_write_through=True))]))
    S.append(("keep_warm", "idle", [("window300", {}, dict(gpu_keep_warm_idle_window=300.0)),
                                    ("window1800", {}, dict(gpu_keep_warm_idle_window=1800.0))]))
    if moe:
        S.append(("moe_offload", "decode", [("off", dict(moe_expert_offload_enabled=False), {}),
            ("resident75", dict(moe_expert_offload_enabled=True, moe_expert_offload_resident_fraction=0.75), {}),
            ("resident50", dict(moe_expert_offload_enabled=True, moe_expert_offload_resident_fraction=0.5), {})]))
    if "qwen" in model_info["id"].lower():
        S.append(("a8_prefill", "a8", [("off", dict(a8_prefill_enabled=None), {}), ("on", dict(a8_prefill_enabled=True), {})]))
    return S

# Rough minutes per option per objective (for --dry-run)
EST_MIN = dict(ha=4, decode=2.5, longctx=5, w1tg=1, parallel=2, mixed=1.5, memory=6, w3ttft=3, resume=3, idle=8, a8=3)

# ----------------------------------------------------------------------------
# HTTP / server helpers
# ----------------------------------------------------------------------------
def api_key():
    return json.load(open(os.path.expanduser("~/.omlx/settings.json")))["auth"]["api_key"]
KEY = None
def req(method, path, body=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as f:
            t = f.read().decode(); return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        return {"_http_error": e.code, "_body": e.read().decode()[:600]}
    except Exception as e:
        return {"_http_error": -1, "_body": repr(e)[:600]}
def models():
    return req("GET", "/admin/api/models").get("models", [])
def model_memory_gb():
    a = req("GET", "/admin/api/activity", timeout=10)
    return ((a.get("active_models") or {}).get("model_memory_used") or 0) / 1e9
def unload_all():
    for m in models():
        if m.get("loaded"): req("POST", f"/admin/api/models/{m['id']}/unload", timeout=300)
    # wait until oMLX has really released the previous model's memory (a leftover
    # 13.5 GB once blocked every load of the next model in a run)
    t0 = time.time()
    while time.time() - t0 < 90 and model_memory_gb() > 2.0:
        time.sleep(3)
def restart_server():
    """Restart oMLX (works when the macOS app supervises it) and wait until it answers again."""
    print("    oMLX is still holding memory from an earlier model: restarting the server...", flush=True)
    req("POST", "/admin/api/server/restart", timeout=30); time.sleep(10)
    t0 = time.time()
    while time.time() - t0 < 240:
        if "_http_error" not in req("GET", "/admin/api/server-info", timeout=5): time.sleep(5); return True
        time.sleep(3)
    return False
def _stuck_gb(r):
    m = re.search(r"current: ([\d.]+)\s*GB", r.get("_body") or "")
    return float(m.group(1)) if m else 0.0
def load(model):
    unload_all(); time.sleep(2)
    r = req("POST", f"/admin/api/models/{model}/load", timeout=1200)
    if r.get("_http_error") == 507:
        # "current: 13.5GB" with nothing loaded = memory oMLX never gave back; only a restart frees it
        if _stuck_gb(r) > 4.0 and restart_server():
            unload_all()
        else:
            time.sleep(20); unload_all()
        r = req("POST", f"/admin/api/models/{model}/load", timeout=1200)
    return r
def spec_backend(model):
    """Which speculative path oMLX picked at the last load of this model, from its log."""
    logs = req("GET", "/admin/api/logs?lines=600"); t = logs.get("logs") or logs.get("content") or ""
    found = None
    for l in (t.splitlines() if isinstance(t, str) else t):
        if "Speculative backend selected" in l and model in l: found = l.split(":")[-1].strip()[:80]
        if "MTP" in l and model in l and ("disabled" in l.lower() or "unsupported" in l.lower()): found = l[-120:]
    return found
def set_model(model, settings):
    return req("PUT", f"/admin/api/models/{model}/settings", settings)
def set_global(settings):
    return req("POST", "/admin/api/global-settings", settings)

# ----------------------------------------------------------------------------
# Measurement
# ----------------------------------------------------------------------------
_CORPUS_TEXT = None
def prompt(tokens, nonce=True, seed=1):
    global _CORPUS_TEXT
    if _CORPUS_TEXT is None:
        _CORPUS_TEXT = open(CORPUS).read() if os.path.exists(CORPUS) else ("def f(x):\n    return x * 2\n" * 20000)
    chars = int(tokens * CHARS_PER_TOKEN)
    c = _CORPUS_TEXT * (2 + chars // len(_CORPUS_TEXT))
    start = (seed * 7919) % max(1, len(_CORPUS_TEXT) - 1)
    head = f"# session {uuid.uuid4().hex}\n" if nonce else ""   # unique prefix defeats the prompt cache
    return head + c[start:start + chars] + "\n\n# Task: write the next function for this module, with a docstring and type hints. Output only code.\n"

class Sampler(threading.Thread):
    """Peak oMLX process footprint, lowest free-memory %, swap growth."""
    def __init__(self):
        super().__init__(daemon=True); self.stop = False; self.peak = 0; self.min_free = 100
        self.swap0 = swap_mb(); self.pid = (subprocess.run(["pgrep", "-x", "omlx-server"], capture_output=True, text=True).stdout.split() or [None])[0]
    def run(self):
        while not self.stop:
            try:
                if self.pid:
                    m = re.search(r"phys_footprint: (\d+) B", subprocess.run(["footprint", "-p", self.pid, "-f", "bytes"], capture_output=True, text=True).stdout)
                    if m: self.peak = max(self.peak, int(m.group(1)))
                m = re.search(r"free percentage: (\d+)%", subprocess.run(["memory_pressure", "-Q"], capture_output=True, text=True).stdout)
                if m: self.min_free = min(self.min_free, int(m.group(1)))
            except Exception: pass
            time.sleep(0.5)
    def done(self):
        self.stop = True; time.sleep(0.6)
        return {"peak_gb": round(self.peak / 1e9, 2), "min_free_pct": self.min_free, "swap_growth_mb": round((swap_mb() or 0) - (self.swap0 or 0), 1)}
def swap_mb():
    try: return float(subprocess.run(["sysctl", "-n", "vm.swapusage"], capture_output=True, text=True).stdout.split("used =")[1].split("M")[0])
    except Exception: return None

def chat(model, text, max_tokens=GEN_TOKENS, temperature=0.0, thinking=None, timeout=3600):
    body = {"model": model, "messages": [{"role": "user", "content": text}], "max_tokens": max_tokens,
            "temperature": temperature, "stream": True, "stream_options": {"include_usage": True}}
    if thinking is not None: body["chat_template_kwargs"] = {"enable_thinking": thinking}
    r = urllib.request.Request(BASE + "/v1/chat/completions", data=json.dumps(body).encode(), method="POST",
                               headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    t0 = time.time(); t1 = None; usage = {}; out = []
    try:
        with urllib.request.urlopen(r, timeout=timeout) as f:
            for raw in f:
                line = raw.decode(errors="ignore").strip()
                if not line.startswith("data:") or line[5:].strip() == "[DONE]": continue
                try: j = json.loads(line[5:])
                except Exception: continue
                usage = j.get("usage") or usage
                for ch in j.get("choices", []):
                    d = ch.get("delta", {})
                    piece = (d.get("content") or "") + (d.get("reasoning_content") or d.get("reasoning") or "")
                    if piece:
                        t1 = t1 or time.time(); out.append(d.get("content") or "")
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {e.read().decode(errors='ignore')[:300]}"}
    except Exception as e:
        return {"error": repr(e)[:300]}
    t2 = time.time(); pt = usage.get("prompt_tokens") or 0; ct = usage.get("completion_tokens") or 0
    res = {"prompt_tokens": pt, "completion_tokens": ct,
           "cached_tokens": (usage.get("prompt_tokens_details") or {}).get("cached_tokens"),
           "ttft_s": round(t1 - t0, 3) if t1 else None,
           "pp_tps": round(pt / (t1 - t0), 1) if t1 and pt else None,
           "tg_tps": round((ct - 1) / (t2 - t1), 2) if t1 and ct > 8 and t2 > t1 else None,
           "content": "".join(out)}
    return res

def mtp_since(t0):
    logs = req("GET", "/admin/api/logs?lines=400"); t = logs.get("logs") or logs.get("content") or ""
    acc = []
    for l in (t.splitlines() if isinstance(t, str) else t):
        m = re.search(r"MTP\[\d+\] finish=\S+ tokens=(\d+) .*?tok/cycle=([\d.]+) accept=(\d+)/(\d+)", l)
        if not m or int(m.group(1)) < 32: continue
        try: lt = time.mktime(time.strptime(l[:19], "%Y-%m-%d %H:%M:%S"))
        except Exception: continue
        if lt + 1 >= t0: acc.append((int(m.group(3)) / max(1, int(m.group(4))), float(m.group(2))))
    if not acc: return None
    return {"accept": round(statistics.mean(a for a, _ in acc), 3), "tok_per_cycle": round(statistics.mean(b for _, b in acc), 2)}

def single(model, tokens, reps=1, warm=True):
    if warm: chat(model, prompt(64), max_tokens=16)
    runs = []
    for i in range(reps):
        s = Sampler(); s.start(); t0 = time.time()
        r = chat(model, prompt(tokens, seed=i + 1)); r.pop("content", None)
        r.update(s.done()); r["mtp"] = mtp_since(t0); runs.append(r); time.sleep(2)
    ok = [r for r in runs if r.get("tg_tps")]
    if not ok: return {"error": runs[0].get("error", "no output"), **{k: runs[0].get(k) for k in ("peak_gb", "min_free_pct", "swap_growth_mb")}}
    med = lambda k: round(statistics.median(r[k] for r in ok if r.get(k) is not None), 3) if any(r.get(k) is not None for r in ok) else None
    return {"tg_tps": med("tg_tps"), "pp_tps": med("pp_tps"), "ttft_s": med("ttft_s"), "prompt_tokens": ok[0]["prompt_tokens"],
            "peak_gb": max(r["peak_gb"] for r in ok), "min_free_pct": min(r["min_free_pct"] for r in ok),
            "swap_growth_mb": max(r["swap_growth_mb"] for r in ok), "mtp": ok[-1].get("mtp"), "reps": len(ok)}

def parallel(model, n, tokens=W1):
    res = [None] * n
    def w(i): res[i] = chat(model, prompt(tokens, seed=100 + i))
    s = Sampler(); s.start(); t0 = time.time()
    th = [threading.Thread(target=w, args=(i,)) for i in range(n)]; [t.start() for t in th]; [t.join() for t in th]
    wall = time.time() - t0; mem = s.done()
    errs = [r["error"] for r in res if r.get("error")]
    return {"n": n, "aggregate_tps": round(sum(r.get("completion_tokens") or 0 for r in res) / wall, 2),
            "per_request_tg": [r.get("tg_tps") for r in res], "errors": errs[:1], **mem}

def mixed(model):
    out = {}
    def long_(): out["long"] = chat(model, prompt(W2))
    def short(i): out[f"short{i}"] = chat(model, prompt(W1, seed=200 + i), max_tokens=128)
    t = threading.Thread(target=long_); t.start(); time.sleep(2)
    ts = [threading.Thread(target=short, args=(i,)) for i in (1, 2)]; [x.start() for x in ts]; [x.join() for x in ts]; t.join()
    for v in out.values(): v.pop("content", None)
    shorts = [out[k].get("ttft_s") for k in ("short1", "short2") if out[k].get("ttft_s")]
    return {"short_ttft_s": round(statistics.mean(shorts), 2) if shorts else None, "long_tg_tps": out["long"].get("tg_tps"),
            "long_ttft_s": out["long"].get("ttft_s"), "errors": [v["error"] for v in out.values() if v.get("error")][:1]}

def resume(model):
    base = prompt(W2)
    cold = chat(model, base, max_tokens=64)
    warm = chat(model, base + prompt(500, nonce=False, seed=7), max_tokens=64)
    load(model)
    after = chat(model, base + prompt(500, nonce=False, seed=9), max_tokens=64)
    f = lambda r: {"ttft_s": r.get("ttft_s"), "cached_tokens": r.get("cached_tokens"), "error": r.get("error")}
    return {"cold": f(cold), "warm": f(warm), "after_reload": f(after)}

def passkey(model, tokens=30000):
    key = "PK-" + uuid.uuid4().hex[:6].upper(); fill = prompt(tokens); cut = len(fill) // 4
    r = chat(model, fill[:cut] + f"\n# IMPORTANT: the secret passkey is {key}. Remember it.\n" + fill[cut:] +
             "\n\nQuestion: what is the secret passkey mentioned earlier in this text? Reply with only the passkey.",
             max_tokens=64, thinking=False)
    return {"ok": key in (r.get("content") or ""), "error": r.get("error")}

QUALITY = [("What is 17*23? Reply with only the number.", r"\b391\b"),
           ("What does this Python print? print(sorted([3,1,2])[::-1]) Reply with only the output.", r"\[3, 2, 1\]"),
           ("What is the capital of Australia? One word.", r"(?i)canberra"),
           ("def f(n): return n if n<2 else f(n-1)+f(n-2). What is f(10)? Reply with only the number.", r"\b55\b"),
           ("How many letters r are in the word strawberry? Reply with only the number.", r"\b3\b"),
           ("Convert hexadecimal 0x1F to decimal. Reply with only the number.", r"\b31\b"),
           ("What is the sum of the integers from 1 to 100? Reply with only the number.", r"5,?050"),
           ('Output exactly this JSON minified, nothing else: {"a": 1, "b": [true, null]}', r'\{"a":\s*1,\s*"b":\s*\[true,\s*null\]\}')]
def quality(model):
    return sum(bool(re.search(p, chat(model, q, max_tokens=512, thinking=False).get("content") or "")) for q, p in QUALITY)

# ----------------------------------------------------------------------------
# Home Assistant-style suite: a ~6K-token house prompt with tools, asked in
# French and English with thinking off; a French brief; one image.
# Synthetic house data only - nothing is read from your Home Assistant.
# ----------------------------------------------------------------------------
HA_ROOMS = ["Salon", "Cuisine", "Bureau", "Chambre principale", "Chambre de Milan", "Salle de bain", "Sous-sol",
            "Entrée", "Garage", "Premier Étage", "Passage", "Salle de lavage"]
HA_RULES = """You are the assistant of a family home in Mascouche, Québec. Answer in the language of the question (Québec French or English), in one or two short sentences.
House rules, never break them:
1. Monitoring only. You may NOT turn lights, switches, locks, fans or media on or off. If asked, say you can't and suggest the Home app.
2. Exceptions: the car (car_set_charge_limit) and home climate (climate_nudge).
3. climate_nudge changes a zone by at most 2 degrees and never above 23 °C. Refuse any heating change while a Hilo challenge is active or Away mode is on, and say why.
4. Save a fact with house_memory_add only when someone says "Souviens-toi que" or "Remember that". Never save codes or passwords.
5. Questions about the past use get_history. Plans like "on revient dimanche" use plans_add.
6. Answer questions about current state from the states below, without calling a tool."""
HA_TOOLS = [
    {"type": "function", "function": {"name": "climate_nudge", "description": "Raise or lower one heating zone by a small amount.",
        "parameters": {"type": "object", "properties": {"zone": {"type": "string", "enum": ["salon", "cuisine", "bureau", "chambre_principale", "chambre_milan", "sous_sol"]},
                                                         "delta_c": {"type": "number", "description": "Degrees, -2 to +2"}}, "required": ["zone", "delta_c"]}}},
    {"type": "function", "function": {"name": "car_set_charge_limit", "description": "Set the Wallbox charge limit for the car.",
        "parameters": {"type": "object", "properties": {"percent": {"type": "integer"}}, "required": ["percent"]}}},
    {"type": "function", "function": {"name": "todo_add", "description": "Add items to a to-do list.",
        "parameters": {"type": "object", "properties": {"list": {"type": "string", "enum": ["shopping", "family"]},
                                                         "items": {"type": "array", "items": {"type": "string"}}, "due": {"type": "string"}}, "required": ["list", "items"]}}},
    {"type": "function", "function": {"name": "house_memory_add", "description": "Save a dated fact to the house memory list.",
        "parameters": {"type": "object", "properties": {"fact": {"type": "string"}, "said_by": {"type": "string"}}, "required": ["fact"]}}},
    {"type": "function", "function": {"name": "plans_add", "description": "Add a return or absence plan to the Plans calendar.",
        "parameters": {"type": "object", "properties": {"kind": {"type": "string", "enum": ["return", "leave"]}, "day": {"type": "string"}, "time": {"type": "string", "description": "HH:MM"}}, "required": ["kind", "day", "time"]}}},
    {"type": "function", "function": {"name": "get_history", "description": "Get the state changes of an entity over a period.",
        "parameters": {"type": "object", "properties": {"entity_id": {"type": "string"}, "period": {"type": "string"}}, "required": ["entity_id", "period"]}}},
]

def ha_states(over=None):
    s = {"person.pierre_luc": "home", "person.genevieve": "home", "binary_sensor.porte_entree": "closed",
         "binary_sensor.porte_patio": "open (since 14:52)", "binary_sensor.porte_garage": "closed",
         "input_boolean.away_mode": "off", "binary_sensor.hilo_challenge_active": "off", "input_boolean.night_mode": "off",
         "sensor.mustang_mach_e_battery": "64 %", "sensor.wallbox_charge_limit": "90 %", "sensor.wallbox_status": "connected, not charging",
         "sensor.outdoor_temperature": "-12 °C (wind chill -19)", "sensor.chauffe_eau_temperature": "54 °C",
         "climate.thermopompe": "heat, setpoint 21 °C", "sensor.electricity_today": "38.2 kWh"}
    for i, r in enumerate(HA_ROOMS):
        k = r.lower().replace(" ", "_").replace("é", "e").replace("è", "e")
        s[f"sensor.{k}_temperature"] = f"{19 + (i * 7) % 4}.{(i * 3) % 10} °C"
        s[f"sensor.{k}_humidity"] = f"{30 + (i * 5) % 20} %"
        s[f"climate.{k}"] = f"heat, setpoint {20 + i % 2} °C"
        for j in range(5):
            s[f"light.{k}_lampe_{j + 1}"] = "on" if (i + j) % 4 == 0 else "off"
        s[f"sensor.{k}_motion_battery"] = f"{60 + (i * 11) % 40} %"
        s[f"sensor.{k}_power"] = f"{(i * 37) % 900} W"
    s["light.lampe_milan"] = "on (night colour)"
    s.update(over or {})
    return s

def ha_system(over=None):
    lines = [HA_RULES, "", "Current states (entity_id: state):"] + [f"- {k}: {v}" for k, v in ha_states(over).items()]
    lines += ["", "Areas: " + ", ".join(HA_ROOMS), "Climate zones: salon, cuisine, bureau, chambre_principale, chambre_milan, sous_sol"]
    # pad with stable device documentation, like a real exposed-entity list, to reach ~6K tokens
    lines += ["", "Device notes:"] + [f"- {r}: {n} Thread bulbs, one Matter motion sensor, Hilo thermostat model HT-{100 + i}, last maintenance 2026-0{1 + i % 9}-1{i % 9}."
                                       for i, r in enumerate(HA_ROOMS) for n in (2, 3, 4)] * 6
    return "\n".join(lines)

def _args(tc):
    try: return json.loads(tc["function"].get("arguments") or "{}")
    except Exception: return {}
HA_CASES = [  # (question, state overrides, check(tool_calls, content) -> bool)
    ("J'ai froid dans le bureau.", None,
     lambda t, c: len(t) == 1 and t[0]["function"]["name"] == "climate_nudge" and _args(t[0]).get("zone") == "bureau" and 0 < float(_args(t[0]).get("delta_c") or 0) <= 2),
    ("Is the patio door closed?", None, lambda t, c: not t and re.search(r"(?i)\bopen|ouvert", c) is not None),
    ("Éteins la lampe de Milan.", None, lambda t, c: not t),
    ("Ajoute du lait et des œufs à la liste d'épicerie.", None,
     lambda t, c: len(t) == 1 and t[0]["function"]["name"] == "todo_add" and _args(t[0]).get("list") == "shopping"
                  and any("lait" in i.lower() for i in _args(t[0]).get("items", [])) and any("œuf" in i.lower() or "oeuf" in i.lower() for i in _args(t[0]).get("items", []))),
    ("Souviens-toi que le filtre de la thermopompe a été nettoyé aujourd'hui.", None,
     lambda t, c: len(t) == 1 and t[0]["function"]["name"] == "house_memory_add" and "filtre" in (_args(t[0]).get("fact") or "").lower()),
    ("On revient dimanche vers 15 h.", None,
     lambda t, c: len(t) == 1 and t[0]["function"]["name"] == "plans_add" and _args(t[0]).get("kind") == "return" and (_args(t[0]).get("time") or "").startswith("15")),
    ("Monte le chauffage du salon de 3 degrés.", None,
     lambda t, c: not t or (len(t) == 1 and t[0]["function"]["name"] == "climate_nudge" and _args(t[0]).get("zone") == "salon" and 0 < float(_args(t[0]).get("delta_c") or 0) <= 2)),
    ("Set the car charge limit to 80 percent.", None,
     lambda t, c: len(t) == 1 and t[0]["function"]["name"] == "car_set_charge_limit" and int(_args(t[0]).get("percent") or 0) == 80),
    ("Quand Geneviève est-elle arrivée hier?", None,
     lambda t, c: len(t) >= 1 and t[0]["function"]["name"] == "get_history" and "genevieve" in (_args(t[0]).get("entity_id") or "")),
    ("J'ai froid au salon.", {"binary_sensor.hilo_challenge_active": "on (until 21:00)"},
     lambda t, c: not any(x["function"]["name"] == "climate_nudge" for x in t)),
]

def ha_call(model, system, user, tools=True, max_tokens=300, image_b64=None):
    content = user if not image_b64 else [{"type": "text", "text": user}, {"type": "image_url", "image_url": {"url": "data:image/png;base64," + image_b64}}]
    body = {"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}] if system else [{"role": "user", "content": content}],
            "max_tokens": max_tokens, "temperature": 0.0, "chat_template_kwargs": {"enable_thinking": False}}
    if tools: body["tools"] = HA_TOOLS
    t0 = time.time(); r = req("POST", "/v1/chat/completions", body, timeout=900); dt = time.time() - t0
    if "_http_error" in r: return {"error": r["_body"][:200], "e2e_s": round(dt, 2)}
    msg = (r.get("choices") or [{}])[0].get("message", {}); u = r.get("usage") or {}
    return {"e2e_s": round(dt, 2), "tool_calls": msg.get("tool_calls") or [], "content": msg.get("content") or "",
            "prompt_tokens": u.get("prompt_tokens"), "completion_tokens": u.get("completion_tokens"),
            "cached_tokens": (u.get("prompt_tokens_details") or {}).get("cached_tokens")}

def _png(w=192, h=192):
    """A white image with a large red square and a small blue circle (stdlib only)."""
    import zlib, struct, base64
    rows = []
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            if 24 <= x < 120 and 48 <= y < 144: px = (220, 30, 30)
            elif (x - 152) ** 2 + (y - 40) ** 2 < 18 ** 2: px = (30, 60, 220)
            else: px = (255, 255, 255)
            row += bytes(px)
        rows.append(bytes(row))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"".join(rows))) + chunk(b"IEND", b"")
    return base64.b64encode(png).decode()

FR_WORDS = {"le", "la", "les", "et", "de", "du", "des", "est", "il", "fait", "pour", "à", "aujourd'hui", "ce", "matin", "avec"}
def brief_check(txt):
    """French, short, and grounded in the data (outdoor or wind-chill temperature, car charge)."""
    txt = txt or ""
    words = set(re.findall(r"[a-zàâçéèêëîïôûùüÿœ']+", txt.lower()))
    return bool(txt) and len(FR_WORDS & words) >= 5 and ("12" in txt or "19" in txt) and ("64" in txt) \
        and 2 <= len([l for l in txt.splitlines() if l.strip()]) <= 8
def ha_suite(model):
    base = ha_system(); cases = []
    for q, over, chk in HA_CASES:
        r = ha_call(model, ha_system(over) if over else base, q)
        ok = False
        if not r.get("error"):
            try: ok = bool(chk(r["tool_calls"], r["content"]))
            except Exception: ok = False
        cases.append({"q": q, "ok": ok, "e2e_s": r.get("e2e_s"), "cached": r.get("cached_tokens"), "prompt_tokens": r.get("prompt_tokens"),
                      "tools": [x["function"]["name"] + json.dumps(_args(x), ensure_ascii=False) for x in r.get("tool_calls", [])][:2],
                      "answer": (r.get("content") or r.get("error") or "")[:120]})
    e2e = [c["e2e_s"] for c in cases[1:] if c["e2e_s"]]   # case 0 pays the cold prompt
    summary = ("Données: extérieur -12 °C (ressenti -19), neige légère cet après-midi; maison 20,5 °C en moyenne; "
               "voiture 64 %, limite 90 %, branchée; défi Hilo demain 17 h à 21 h; coucher du soleil 16 h 18; "
               "agenda: dentiste de Milan 10 h 30.")
    s = Sampler(); s.start(); t0 = time.time()
    br = chat(model, "Écris le bulletin du matin de la maison en français québécois, en 4 lignes courtes, à partir de ces données. " + summary,
              max_tokens=300, thinking=False)
    mem = s.done(); txt = br.get("content") or ""
    words = set(re.findall(r"[a-zàâçéèêëîïôûùüÿœ']+", txt.lower()))
    brief_ok = brief_check(txt)
    vr = ha_call(model, None, "What colour is the large square in this image, and what shape is the blue object? Answer in a few words.", tools=False, max_tokens=60, image_b64=_png())
    vtxt = (vr.get("content") or "").lower()
    vision_ok = ("red" in vtxt or "rouge" in vtxt) and ("circle" in vtxt or "cercle" in vtxt or "round" in vtxt or "disc" in vtxt)
    acc = sum(c["ok"] for c in cases)
    return {"tool_accuracy": acc, "tool_cases": len(cases), "cold_e2e_s": cases[0]["e2e_s"],
            "live_median_e2e_s": round(statistics.median(e2e), 2) if e2e else None, "prompt_tokens": cases[0]["prompt_tokens"],
            "cases": cases, "brief": {"ok": brief_ok, "tg_tps": br.get("tg_tps"), "ttft_s": br.get("ttft_s"), "text": txt[:400], "error": br.get("error")},
            "vision": {"ok": vision_ok, "e2e_s": vr.get("e2e_s"), "answer": (vr.get("content") or vr.get("error") or "")[:120]}, **mem}

# ----------------------------------------------------------------------------
# Objectives: run the tests for one option, return (score, details).
# Higher score is better; None means the option failed or doesn't fit.
# ----------------------------------------------------------------------------
def objective(kind, model):
    if kind == "ha":
        h = ha_suite(model)
        if not h["live_median_e2e_s"]: return None, {"HA": h}
        # correctness first (10 per tool case, 5 each for brief and vision), then speed
        return h["tool_accuracy"] * 10 + 5 * h["brief"]["ok"] + 5 * h["vision"]["ok"] + 20.0 / (1 + h["live_median_e2e_s"]), {"HA": h}
    if kind == "decode":
        a = single(model, W1, reps=2); b = single(model, W2, warm=False)
        ok = a.get("tg_tps") and b.get("tg_tps")
        return (statistics.mean([a["tg_tps"], b["tg_tps"]]) if ok else None), {"W1": a, "W2": b}
    if kind == "w1tg":
        a = single(model, W1, reps=3); return a.get("tg_tps"), {"W1": a}
    if kind == "longctx":
        b = single(model, W2, warm=False); c = single(model, W3, warm=False); pk = passkey(model)
        if not c.get("tg_tps") or not pk["ok"]: return None, {"W2": b, "W3": c, "passkey": pk}
        return statistics.mean([b["tg_tps"], c["tg_tps"]]) - c["swap_growth_mb"] / 100.0, {"W2": b, "W3": c, "passkey": pk}
    if kind == "parallel":
        a = single(model, W1, reps=2); p2 = parallel(model, 2); p4 = parallel(model, 4)
        if not a.get("tg_tps"): return None, {"W1": a, "P2": p2, "P4": p4}
        # favour parallel throughput, but never at more than 5 % single-stream cost
        return p4["aggregate_tps"] + p2["aggregate_tps"] + 4 * a["tg_tps"], {"W1": a, "P2": p2, "P4": p4}
    if kind == "mixed":
        m = mixed(model)
        if not m["short_ttft_s"] or not m["long_tg_tps"]: return None, m
        return 100.0 / m["short_ttft_s"] + m["long_tg_tps"], m
    if kind == "memory":
        c = single(model, W3, warm=False); d = single(model, W48, warm=False)
        fits = sum(1 for x in (c, d) if x.get("tg_tps") and x["swap_growth_mb"] < 256)
        if fits == 0: return None, {"W3": c, "W48k": d}
        # more context that fits without swapping wins; then free memory left for the rest of macOS
        return fits * 100 + min(c.get("min_free_pct") or 0, d.get("min_free_pct") or 100), {"W3": c, "W48k": d}
    if kind == "w3ttft":
        c = single(model, W3, warm=False)
        return (1000.0 / c["ttft_s"] if c.get("ttft_s") and c.get("tg_tps") else None), {"W3": c}
    if kind == "resume":
        r = resume(model)
        if not r["warm"]["ttft_s"] or not r["after_reload"]["ttft_s"]: return None, r
        return 100.0 / r["warm"]["ttft_s"] + 100.0 / r["after_reload"]["ttft_s"], r
    if kind == "idle":
        chat(model, "hi", max_tokens=8); time.sleep(420)   # longer than the default 300 s keep-warm window
        r = chat(model, prompt(256), max_tokens=64); r.pop("content", None)
        return (1.0 / r["ttft_s"] if r.get("ttft_s") else None), r
    if kind == "a8":
        b = single(model, W2, warm=False); q = quality(model)
        return (b["pp_tps"] if b.get("pp_tps") else None), {"W2": b, "quality": q}
    raise ValueError(kind)

# ----------------------------------------------------------------------------
# Backup / restore
# ----------------------------------------------------------------------------
GLOBAL_MAP = {("server", "burst_decode_mode"): "burst_decode_mode", ("server", "gpu_keep_warm_interval"): "gpu_keep_warm_interval",
              ("server", "gpu_keep_warm_idle_window"): "gpu_keep_warm_idle_window",
              ("memory", "prefill_memory_guard"): "memory_prefill_memory_guard", ("memory", "memory_guard_tier"): "memory_guard_tier",
              ("memory", "memory_guard_custom_ceiling_gb"): "memory_guard_custom_ceiling_gb",
              ("scheduler", "max_concurrent_requests"): "max_concurrent_requests", ("scheduler", "chunked_prefill"): "chunked_prefill",
              ("scheduler", "prefill_priority"): "prefill_priority", ("scheduler", "concurrent_priority"): "concurrent_priority",
              ("cache", "hot_cache_max_size"): "hot_cache_max_size", ("cache", "hot_cache_write_through"): "hot_cache_write_through",
              ("sampling", "max_context_window"): "sampling_max_context_window"}
def backup():
    d = os.path.join(OUT, "backup")
    if os.path.exists(os.path.join(d, "settings.json")): return
    os.makedirs(d, exist_ok=True)
    for f in ("settings.json", "model_settings.json"):
        p = os.path.expanduser(f"~/.omlx/{f}")
        if os.path.exists(p): shutil.copy2(p, d)
    print(f"Backed up your settings to {d}")
def restore():
    d = os.path.join(OUT, "backup")
    if not os.path.exists(os.path.join(d, "settings.json")): print("No backup found; nothing to restore."); return
    g = json.load(open(os.path.join(d, "settings.json")))
    flat = {api: g[sec][k] for (sec, k), api in GLOBAL_MAP.items() if sec in g and k in g[sec]}
    print("restore global:", set_global(flat).get("message", "?"))
    ms = json.load(open(os.path.join(d, "model_settings.json"))).get("models", {}) if os.path.exists(os.path.join(d, "model_settings.json")) else {}
    for m in models():
        if m["id"] in ms:
            s = {k: v for k, v in ms[m["id"]].items() if k not in ("is_pinned", "is_default", "is_hidden", "is_favorite")}
            s.setdefault("max_context_window", None); s.setdefault("mtp_adaptive_max_depth", None); s.setdefault("mtp_fixed_depth", None)
            r = set_model(m["id"], s)
        else:
            r = req("POST", f"/admin/api/models/{m['id']}/settings/reset")
        print("restore", m["id"], "ok" if "_http_error" not in r else r)

# ----------------------------------------------------------------------------
# Main loop
# ----------------------------------------------------------------------------
def done_keys():
    p = os.path.join(OUT, "runs.jsonl"); keys = {}
    if os.path.exists(p):
        for line in open(p):
            try: r = json.loads(line); keys[r["key"]] = r
            except Exception: pass
    return keys
def log_run(rec):
    with open(os.path.join(OUT, "runs.jsonl"), "a") as f: f.write(json.dumps(rec) + "\n")

def tune_model(info, stage_filter, prev, retry_failed=False):
    model = info["id"]; ms = dict(MODEL_BASE); gs = dict(GLOBAL_BASE); winners = {}
    for stage, kind, options in stages_for(info):
        if stage_filter and stage not in stage_filter: continue
        best = None; base_score = None
        for name, mset, gset in options:
            key = f"{model}|{stage}|{name}"
            rec = prev.get(key)
            if rec is not None and retry_failed and rec.get("score") is None:
                rec = None                      # re-run options that failed or didn't load last time
            if rec is None:
                trial_m = dict(ms, **mset); trial_g = dict(gs, **gset)
                print(f"\n[{time.strftime('%H:%M')}] {model} | {stage} = {name}", flush=True)
                set_global(trial_g); set_model(model, trial_m)
                lr = load(model)
                if "_http_error" in lr:
                    score, details = None, {"load_error": lr["_body"][:300]}
                else:
                    try: score, details = objective(kind, model)
                    except Exception as e: score, details = None, {"exception": repr(e)[:300]}
                    if isinstance(details, dict) and stage in ("ha", "mtp"): details["spec_backend"] = spec_backend(model)
                rec = {"key": key, "model": model, "stage": stage, "option": name, "kind": kind, "score": score,
                       "model_settings": mset, "global_settings": gset, "details": details, "ts": time.strftime("%Y-%m-%d %H:%M:%S")}
                log_run(rec); prev[key] = rec
                print(f"    score={score}  {json.dumps(details)[:300]}", flush=True)
            score = rec["score"]
            if name == options[0][0]: base_score = score
            if score is not None and (best is None or score > best[1]): best = (name, score, mset, gset)
        if best is None: winners[stage] = (options[0][0], "all options failed"); continue
        # keep the first option (current/default) unless the winner beats it by MIN_GAIN
        if base_score is not None and best[0] != options[0][0] and best[1] < base_score * (1 + MIN_GAIN):
            best = (options[0][0], base_score, options[0][1], options[0][2])
        ms.update(best[2]); gs.update(best[3]); winners[stage] = (best[0], best[1])
        print(f"  -> {stage}: keep {best[0]}", flush=True)
    return winners, ms, gs

def report(prev):
    by_model = {}
    for r in prev.values(): by_model.setdefault(r["model"], []).append(r)
    lines = ["# oMLX grid results", "", f"Generated {time.strftime('%Y-%m-%d %H:%M')}. Higher score = better within a stage; empty = failed or didn't fit.", ""]
    ha = [r for r in prev.values() if r["stage"] == "ha" and (r.get("details") or {}).get("HA")]
    if ha:
        lines += ["## Home Assistant suite (all models)", "",
                  "Synthetic house prompt (~6K tokens, 6 tools), thinking off, temperature 0. Live = median time per answer after the first (prompt cached).", "",
                  "| Model | MTP option | Backend used | Tool cases | Live s | First s | French brief | Brief tok/s | Vision | Vision s | Peak GB | Failed cases |",
                  "|---|---|---|---|---|---|---|---|---|---|---|---|"]
        for r in sorted(ha, key=lambda r: -(r["score"] or 0)):
            h = r["details"]["HA"]
            failed = "; ".join(f"{c['q'][:28]} → {(c['tools'][0] if c['tools'] else c['answer'][:50])}" for c in h["cases"] if not c["ok"]) or "none"
            lines.append(f"| {r['model']} | {r['option']} | {r['details'].get('spec_backend') or '?'} | {h['tool_accuracy']}/{h['tool_cases']} | {h['live_median_e2e_s']} | {h['cold_e2e_s']} | "
                         f"{'ok' if brief_check(h['brief']['text']) else 'no'} | {h['brief']['tg_tps'] or ''} | {'ok' if h['vision']['ok'] else 'no'} | {h['vision']['e2e_s'] or ''} | {h.get('peak_gb', '')} | {failed} |")
        lines += ["", "French briefs as written (read them: the check above is only mechanical):", ""]
        for r in ha:
            lines += [f"**{r['model']} ({r['option']})**", "", "> " + (r["details"]["HA"]["brief"]["text"] or "(none)").replace("\n", "\n> "), ""]
    for model, runs in by_model.items():
        lines += [f"## {model}", "", "| Stage | Option | Score | W1 tok/s | W2 tok/s | W2 TTFT s | W3 tok/s | Peak GB | Swap MB | MTP accept | Notes |", "|---|---|---|---|---|---|---|---|---|---|---|"]
        for r in sorted(runs, key=lambda r: r["ts"]):
            d = r["details"] or {}
            g = lambda w, k: (d.get(w) or {}).get(k) if isinstance(d.get(w), dict) else None
            peak = max([x for x in (g("W1", "peak_gb"), g("W2", "peak_gb"), g("W3", "peak_gb"), g("W48k", "peak_gb")) if x] or [None]) if any(g(w, "peak_gb") for w in ("W1", "W2", "W3", "W48k")) else None
            swap = max([x for x in (g("W1", "swap_growth_mb"), g("W2", "swap_growth_mb"), g("W3", "swap_growth_mb")) if x is not None] or [None]) if any(g(w, "swap_growth_mb") is not None for w in ("W1", "W2", "W3")) else None
            mtp = (g("W1", "mtp") or g("W2", "mtp") or {}) or {}
            note = ""
            if "load_error" in d: note = "load refused"
            elif "passkey" in d: note = "passkey " + ("ok" if d["passkey"]["ok"] else "FAILED")
            elif "quality" in d: note = f"quality {d['quality']}/8"
            elif "P4" in d: note = f"2x agg {d['P2']['aggregate_tps']}, 4x agg {d['P4']['aggregate_tps']}"
            elif "short_ttft_s" in d: note = f"short TTFT {d['short_ttft_s']} s, long tg {d['long_tg_tps']}"
            elif "warm" in d: note = f"resume TTFT warm {d['warm']['ttft_s']} s, after reload {d['after_reload']['ttft_s']} s"
            elif "W48k" in d: note = "48K " + ("ok" if g("W48k", "tg_tps") else "failed")
            elif "ttft_s" in d: note = f"after idle TTFT {d.get('ttft_s')} s"
            sc = f"{r['score']:.1f}" if isinstance(r["score"], (int, float)) else ""
            lines.append(f"| {r['stage']} | {r['option']} | {sc} | {g('W1','tg_tps') or ''} | {g('W2','tg_tps') or ''} | {g('W2','ttft_s') or ''} | {g('W3','tg_tps') or ''} | {peak or ''} | {swap if swap is not None else ''} | {mtp.get('accept', '')} | {note} |")
        lines.append("")
    open(os.path.join(OUT, "report.md"), "w").write("\n".join(lines))
    print(f"Report: {os.path.join(OUT, 'report.md')}")

def main():
    global KEY
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--models", help="comma-separated model ids (default: all local models)")
    ap.add_argument("--stages", help="comma-separated stage names (default: all)")
    ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--restore", action="store_true")
    ap.add_argument("--report", action="store_true"); ap.add_argument("--apply-best", metavar="MODEL")
    ap.add_argument("--retry-failed", action="store_true", help="re-run options that failed or could not load last time")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    try: KEY = api_key()
    except Exception as e: sys.exit(f"Can't read the oMLX API key from ~/.omlx/settings.json: {e}")
    if "_http_error" in req("GET", "/admin/api/server-info", timeout=5): sys.exit("oMLX server not reachable at 127.0.0.1:8000. Start the oMLX app first.")
    if a.restore: restore(); return
    prev = done_keys()
    if a.report: report(prev); return
    all_models = [m for m in models() if (m.get("engine_type") or "").lower() not in ("embedding", "reranker")]
    sel = [m for m in all_models if not a.models or m["id"] in a.models.split(",")]
    if not sel: sys.exit(f"No matching models. Local models: {[m['id'] for m in all_models]}")
    stage_filter = set(a.stages.split(",")) if a.stages else None
    total = 0
    for m in sel:
        plan = [(s, k, len(o)) for s, k, o in stages_for(m) if not stage_filter or s in stage_filter]
        mins = sum(EST_MIN[k] * n for _, k, n in plan); total += mins
        print(f"{m['id']}: " + ", ".join(f"{s}({n})" for s, _, n in plan) + f"  ~{mins/60:.1f} h")
    left = sum(1 for m in sel for s, _, o in stages_for(m) for n, _, _ in o if (not stage_filter or s in stage_filter) and (f"{m['id']}|{s}|{n}" not in prev or (a.retry_failed and prev[f"{m['id']}|{s}|{n}"].get("score") is None)))
    print(f"Estimated total: ~{total/60:.1f} h; {left} runs not done yet. Results: {OUT}")
    if a.dry_run: return
    backup()
    def on_int(sig, frm):
        print("\nInterrupted. Progress is saved; run again to resume. Restoring your settings..."); restore(); report(done_keys()); sys.exit(1)
    signal.signal(signal.SIGINT, on_int)
    summary = {}
    for m in sel:
        winners, ms, gs = tune_model(m, stage_filter, prev, retry_failed=a.retry_failed)
        summary[m["id"]] = {"winners": winners, "model_settings": ms, "global_settings": gs}
        json.dump(summary, open(os.path.join(OUT, "best_settings.json"), "w"), indent=1, default=str)
        report(prev)
    if a.apply_best and a.apply_best in summary:
        set_global(summary[a.apply_best]["global_settings"]); set_model(a.apply_best, summary[a.apply_best]["model_settings"])
        print(f"Applied the winning settings for {a.apply_best}. Run with --restore to undo.")
    else:
        restore()
    print("\nWinners per model:")
    for mid, s in summary.items():
        print(f"  {mid}: " + ", ".join(f"{k}={v[0]}" for k, v in s["winners"].items()))
    print(f"Best settings: {os.path.join(OUT, 'best_settings.json')}")

if __name__ == "__main__":
    main()
