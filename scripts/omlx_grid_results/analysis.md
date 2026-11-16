# oMLX grid: analysis

*Written 2026-11-15 from the raw runs in `runs.jsonl`, the generated `report.md` and the scorer in `scripts/omlx.py`. 211 runs, 2026-11-14 22:24 → 2026-11-15 12:32 (about 14 h), on a 32 GB Mac that also runs a VM.*

> `report.md` is rebuilt by `omlx.py --report`; this file is hand-written and is not overwritten.

---

## TL;DR

**Use `gemma-4-26B-A4B-it-oQ4e-mtp` with MTP off for the house.** It is the only model that passed everything: 10/10 tool cases, the French brief and vision. A live answer takes about 1.4 s, decode runs at about 39 tok/s, and peak memory is 19–21 GB.

**Suggested settings for Gemma**

| Setting | Value | Why |
|---|---|---|
| MTP | off | MTP lowers Gemma's decode speed (36.6 → 33.6 tok/s) |
| KV cache | `affine8` | +15 % on long context, passkey test passed |
| Memory tier | `aggressive` (or custom 24 GB) | `safe` won't load it; `balanced` can't fit 32K or 48K |
| `max_concurrent_requests` | 1 | Parallel requests lower total throughput |
| Chunked prefill | off | No measurable effect |
| Everything else | default | Noise (see below) |

**Don't apply `best_settings.json` as-is.** See [Caveats](#caveats-about-the-run-itself).

---

## Model comparison

| Model | Tool cases | Live answer | Short decode | 32K TTFT | Prefill | Peak RAM | Verdict |
|---|---|---|---|---|---|---|---|
| **gemma-4 26B-A4B oQ4** | **10/10** | 1.41 s | 39 tok/s | ~122 s | — | 19–21 GB | ✅ **Pick** |
| Qwen3.6-35B-A3B oQ3 | 8/10 | 1.26 s | 64 tok/s (MTP) | ~88 s | ~438 tok/s | 19–22 GB | ⚡ Fastest, but fails 2 cases |
| Qwen3.6-35B-A3B oQ4 | 8/10 | 1.24 s | 65 tok/s (MTP) | ~115 s | ~371 tok/s | 24–26.6 GB | ⚠️ Same failures, near the memory limit |
| Qwen3.8-27B oQ4 | 10/10 | 3.03 s | ~19 tok/s (MTP) | ~440 s | ~89 tok/s | 20–26 GB | 🐢 Correct but too slow |
| Qwen3.8-27B oQ3 | 9/10 | 3.79 s | ~18 tok/s (MTP) | ~380 s | ~91 tok/s | 18–25 GB | ❌ Claims actions it didn't take |

*Live answer = median time per HA question with the ~11.4K-token house prompt cached. 32K TTFT = time to first token for a cold 32K-token prompt.*

### Why the dense 27B is out

Prefill runs at about 90 tok/s, so a cold house prompt (11,357 tokens) takes about **2 minutes**, and a 48K prompt takes 10–15 minutes. Even with the prompt cached, answers take 3–5 s. That's too slow for a wall panel.

---

## Quality findings

The suite runs at temperature 0, so each failure repeats on every run. Every failure below shows up the same way with both quants and both MTP settings.

### Tool-calling failures

| Model | Question | What it did | Severity |
|---|---|---|---|
| Qwen3.6-35B (oQ3 + oQ4) | *J'ai froid dans le bureau.* | Asked *« Souhaitez-vous que je le fasse ? »* instead of calling `climate_nudge` | Medium: probably fixable in the prompt |
| Qwen3.6-35B (oQ3 + oQ4) | *Quand Geneviève est-elle arrivée hier?* | Said it has no history access instead of calling `get_history` (breaks rule 5) | High |
| Qwen3.8-27B oQ3 | *Set the car charge limit to 80 percent.* | Answered *"The car's charge limit has been set to 80%."* **without calling any tool** | **Critical: it claims an action that never happened** |

### French morning brief

The mechanical check (`brief_check`) only looks for French words, the numbers 12/19 and 64, and 2–8 lines. Reading the briefs shows more:

| Model | Mechanical check | What's actually wrong |
|---|---|---|
| gemma-4 | ok | MTP-off run says *« la char »* instead of *« le char »*; every run adds a preamble line (*« Voici ton bulletin du matin : »*), so it isn't 4 lines |
| Qwen3.6-35B | ok | Makes things up: *« puis on se voit à 17 h »*, *« voiture en bonne santé »*, *« pour le reste de la journée »* |
| Qwen3.8-27B oQ3 | ok | Clean and accurate |
| Qwen3.8-27B oQ4 | **no** (false negative) | Failed only because its telegraphic style has too few function words. Has a real error the check missed: *« Hors gel à -12 °C »* means "frost-free" |

### Vision

Every model passed (red square, blue circle).

---

## Settings that mattered

### MTP (speculative decoding)

| Model | Off | Best | Gain | Note |
|---|---|---|---|---|
| Qwen3.8-27B oQ4 | 10.6 | adaptive5: 19.4 | **+83 %** | Big win |
| Qwen3.8-27B oQ3 | 12.8 | adaptive5: 17.5 | +37 % | |
| Qwen3.6-35B oQ3 | 48.4 | fixed3: 55.1 | +14 % | +23 % at 1K tokens, ≈0 at 16K |
| Qwen3.6-35B oQ4 | 50.1 | fixed3: 55.8 | +11 % | Same pattern |
| gemma-4 | **36.6** | off | **−8 % to −12 % with MTP on** | Hurts even with ~0.8 acceptance |

*Score = mean decode tok/s over 1K and 16K tokens.*

### KV-cache quantization

| Model | native | affine8 | affine4 | turboquant4 |
|---|---|---|---|---|
| Qwen3.6-35B oQ3 | 42.0 | **56.9** (+35 %) | 51.9 | 51.4 |
| gemma-4 | 32.5 | **37.4** (+15 %) | 34.5 | 34.6 |
| Qwen3.8-27B oQ4 | 10.7 (852 MB swap) | **23.6** | ❌ passkey failed | 4.7 (1.8 GB swap) |
| Qwen3.8-27B oQ3 | **14.0** | 12.7 | 13.7 | 14.6 (under the 5 % bar) |
| Qwen3.6-35B oQ4 | ❌ | ❌ | ❌ passkey failed | ❌ passkey failed |

- **`affine8` is the safe default:** it passed the passkey test everywhere it ran.
- **Avoid 4-bit KV:** it failed the passkey test on two models.
- **Qwen3.6-35B oQ4 couldn't finish this stage with any option:** the model is at the memory limit for 32K context.

### Memory tier

| Tier | Result |
|---|---|
| `safe` | Refused to load or rejected the prompt, for every model |
| `balanced` | 48K failed for every model |
| `aggressive` | 48K works for Gemma, Qwen3.6 oQ3 and Qwen3.8 oQ3 |
| `custom 24 GB` | Same as `aggressive` (the 48K swap reading is noisy) |
| `custom 26 GB` | The only setting where Qwen3.6 oQ4 fit 48K, **with 5 % RAM free**: too tight next to a VM |

---

## Settings that were noise (keep the defaults)

| Stage | Finding |
|---|---|
| Burst decode | All modes within ±3 % |
| `prefill_priority` | No difference |
| `a8_prefill` | Within 1 % on prefill speed; quality unchanged |
| Hot cache | No gain: resume after a reload ≈ warm resume, so the SSD cache already does this job |
| Keep-warm window | Only Qwen3.6 oQ4 changed (after-idle TTFT 6.9 s → 1.3 s); the others moved by ≤0.4 s |
| Scheduler / chunked prefill | No effect except the Qwen3.8 oQ4 artifact below |
| Concurrency | Running 2 or 4 requests at once gave **less** total throughput than one stream on every model (e.g. Qwen3.6 oQ3: 64 tok/s single vs 42 with 4 parallel). Keep `max1`. |
| MoE expert offload | Within noise on both Qwen3.6 quants |

---

## Caveats about the run itself

1. **Qwen3.8-27B oQ4's "max4 + chunked prefill" is a spurious win.**
   - The `max4` result came from noise in the single-stream MTP measurement (21.2 vs 16 tok/s), not from concurrency: with 2 or 4 requests the aggregate stayed at ~10 tok/s for every setting.
   - With `max4` carried into the next stage, unchunked mixed work fell apart (206 s TTFT, 4.6 tok/s). Chunking then "fixed" a problem the bad `max4` choice caused.
   - Re-run both stages for that model.

2. **Script bug: the 5 % `MIN_GAIN` guard never runs in the memory stage.**
   - `safe` is the first option and always fails, so `base_score` stays `None` (`omlx.py`, around line 611), and the stage keeps the raw maximum.
   - That's how Gemma ended up on `custom24` (220) over `aggressive` (212), a 4 % difference.
   - Fix: compare against the best option that ran, not the first one in the list.

3. **The "fits" check rests on one noisy swap reading.**
   - A run counts as fitting only if swap grows by less than 256 MB, and swap is measured system-wide while a VM is running.
   - Example: Qwen3.6 oQ3 at 48K counted as not fitting with `custom24` (+629 MB) and as fitting with `custom26` (+203 MB). Negative swap values throughout show the reading follows the whole system, not oMLX.

4. **"First s" in the HA table compares a cold start with a warm one.**
   - `mtp_off` always runs first, so it pays for the model load and the full ~11K-token prefill (27–123 s).
   - `mtp_on` then reuses 11,350 cached tokens.
   - The column says nothing about MTP.

5. **The report understates the HA prompt.** It says ~6K tokens; the measured size is 11,357 (11,468 for Gemma).

6. **Gemma's `vlm_mtp_on` run reports "Lightning MTP" as its backend.** Either the VLM MTP path never ran or the label is wrong. The `mtp` stage did show different acceptance rates for the VLM options (0.73–0.86 vs 0.80), so the label is the more likely culprit.

7. **The tool suite is small (10 cases).** The ranking still looks solid because every failure repeats across both quants and both MTP settings.

---

## Next steps

- [ ] Apply the Gemma settings above and run the HA suite once more to confirm.
- [ ] Fix the `MIN_GAIN` baseline in the memory stage, and require a fit on two swap readings instead of one.
- [ ] Re-run `concurrency` and `scheduler` for Qwen3.8-27B oQ4 (only matters if you keep it).
- [ ] To use Qwen3.6-35B oQ3's speed: add a stronger "act, don't ask; use `get_history` for the past" rule to the system prompt and re-run the suite to see whether it reaches 10/10.
- [ ] Tighten `brief_check`: reject a preamble line, and flag numbers or events that aren't in the input data.
- [ ] Fix the "~6K tokens" label and run the cold-start case outside the MTP comparison.
