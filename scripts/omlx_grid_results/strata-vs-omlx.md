# Strata vs oMLX

*Written 2026-11-15. Judged for the Home Assistant panel on this machine: Apple M2 Pro, 32 GB, also running a VM.*

*Strata sources: its README, `docs/MAC.md`, `QWEN36.md`, `CAPABILITIES.md`, `DETAILS.md`, `SAFETY.md` and `AGENTS.md` at <https://github.com/Niko1221/Strata> (v0.2.14, engine 0.1.60). Strata was not installed or run here. oMLX sources: the installed app (0.8.0rc1) and the grid results in this folder.*

---

## Verdict: stay on oMLX

Strata's Mac engine doesn't run any of the five models you tuned, and the one model it does run is too big for 32 GB to hold in memory.

- Strata's Mac engine runs **only Qwen3.8-Flash-Next**. Qwen3.6, Qwen3.8-27B and Gemma 4 don't run on it.
- Flash-Next's smallest pack is **37.6 GB**, so on 32 GB the experts stream from the SSD.
- Strata measured **14 tok/s** decode and **94 tok/s** prompt reading on a 32 GB Mac. A cold house prompt would take about 2 minutes.
- oMLX can already run Flash-Next through its Splash engine if you want to try that model.

## What each project is

| | **Strata** | **oMLX** |
|---|---|---|
| Purpose | Run one very large mixture-of-experts model on consumer GPUs by splitting the work across GPU, RAM and SSD | A model server built for Macs that runs many models and is tuned for Apple Silicon |
| Main platforms | NVIDIA and AMD first; Intel Arc, DGX Spark and Mac also supported | Apple Silicon only |
| Engine | Its own C++ engine with CUDA, HIP, SYCL and Metal kernels, built on parts of llama.cpp | Python on MLX with an engine pool; can hand a model to an external engine (Splash) |
| Model files | GGUF | MLX safetensors, plus its own oQ quants |
| License | MIT | Apache-2.0 |
| Maturity | v0.2.14; repo created 2026-09-24; about 44.5K stars; very active | 0.8.0rc1 installed here |

## Which models run on a Mac

| Model | Strata on a Mac | oMLX |
|---|---|---|
| Qwen3.8-Flash-Next | ✅ The only model it runs on a Mac | ✅ Through Splash; a `splash-m1` port covers M1 and M2 |
| Qwen3.6-35B-A3B | ❌ The docs say the Mac engine does not run it | ✅ Tuned in the grid |
| Qwen3.8-27B | ❌ | ✅ Tuned in the grid |
| Gemma 4 26B-A4B | ❌ Not supported on any platform | ✅ The pick for the house |
| DeepSeek V4.1-Flash | ❌ Dropped after 0.2.13 | Cache code for it exists; not tested here |

## What Strata would do on 32 GB

Flash-Next's smallest pack doesn't fit in 32 GB, so Strata keeps the most-used experts in RAM and reads the rest from the SSD for each token. Strata measured that on an M4 Mac mini with 32 GB. Nobody has tested an M2 Pro.

| | Strata, Flash-Next Q2_0 (M4 32 GB) | oMLX, Gemma 4 (this M2 Pro) |
|---|---|---|
| Decode | 14.1 tok/s (8.3 with less RAM free) | ~39 tok/s |
| Prompt reading | 93.6 tok/s at 4K | ~370 tok/s at 16K |
| Cold house prompt (11.4K tokens) | ~122 s | ~33 s (grid's cold run, model load included) |
| MTP | Off: slower on a Mac that streams | Off: slower for Gemma |
| Disk space | 37.6 + 28.8 (n-gram table) + ~40 GB (experts copy) | ~17 GB |
| Requirement | macOS 15+, model on the internal SSD | Already running |

That's about the speed of the dense Qwen3.8-27B already rejected. The VM shrinks the RAM Strata can keep experts in, which is how its decode fell to 8.3 tok/s.

## Features side by side

| Area | Strata | oMLX |
|---|---|---|
| APIs | OpenAI Chat Completions, Responses, Anthropic Messages | The same three, plus embeddings, rerank, speech-to-text, text-to-speech, tokenize, MCP and web search |
| Several models | One model per server | A pool of models with load and unload endpoints |
| Tool calls | Forgiving parser: fixes near-miss tool names and broken arguments. **`tool_choice` can't force a call.** | Its own tool-call parser |
| Structured JSON | Schema checked after generation, not enforced while generating | Enforced while generating (xgrammar) |
| Prompt cache | Up to 6 snapshots in RAM; the system prompt is kept for good; conversations parked in RAM | Paged KV cache on the SSD, plus the optional hot cache |
| Speculative decoding | MTP, prompt lookup, DFlash2 | MTP (Lightning and VLM), DFlash, SpecPrefill |
| KV-cache quantization | Not documented for the Mac | affine8, affine4, TurboQuant |
| Requests at once | `--parallel 1–8`; on an M5 Max, 4 requests gave 119–125 tok/s in total vs 85 for one | Continuous batching; on this Mac it *lowered* total throughput |
| Memory handling | Sizes its expert area under macOS's free memory; locks it in RAM on Macs with 64 GB or more | Memory-guard tiers and a custom ceiling |
| Models bigger than RAM | Streams experts from a rearranged copy on the SSD | MoE expert offload from the original files (see below) |
| Vision | GPU image reader, 0.45 s per picture on an M4 | Yes; 0.6 s on Gemma in the grid |
| Apps | Tauri desktop app, terminal monitor, `strata connect` for coding tools | Menu-bar app and admin web dashboard |
| Privacy | No telemetry; checks a signed update feed once a day | The built-in benchmark uploads results to omlx.ai (noted in `scripts/omlx.py`) |

## What matters for the house panel

**Strata**
- Works with Home Assistant's OpenAI-style connection through `/v1/chat/completions`.
- Its forgiving parser helps a model that makes small formatting slips. It wouldn't fix any of the grid's failures: asking for confirmation, skipping `get_history`, or claiming an action without calling the tool.
- You can't force a tool call with `tool_choice`.
- The kept system-prompt snapshot suits a long, stable house prompt.
- Flash-Next is a much bigger model, so tool calling would probably be better. Nobody has measured it on the 10 house cases.

**oMLX**
- Same Home Assistant connection.
- Gemma 4 passed 10/10 tool cases, the French brief and vision.
- The SSD prefix cache already gives 1.4 s answers once the house prompt is cached.
- Can enforce JSON output while generating.
- Can try Flash-Next later through Splash without a second server.

## If you want to try Flash-Next

1. **Try it through oMLX first.** Its Splash engine (`splash-m1` on an M2) runs Flash-Next without a second server.
2. **Run the house cases against it.** `ha_suite` in `scripts/omlx.py` only calls `/v1/chat/completions`, so it could also point at Strata on `127.0.0.1:8080` with small changes. The rest of the script depends on oMLX's admin API.
3. **Free memory first.** Stop the VM, or the model will have even less RAM to keep its experts in.
