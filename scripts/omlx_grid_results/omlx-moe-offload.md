# oMLX: running models bigger than memory

_Written 2026-11-15 from the installed oMLX 0.8.0rc1 source (`patches/moe_expert_offload.py`, `model_settings.py`)._

**Yes, for mixture-of-experts models.** oMLX has its own version of Strata's trick: **MoE expert offload** (`moe_expert_offload_enabled`). It's the same `moe_offload` stage the grid ran on Qwen3.6.

## How oMLX does it

- **Keeps part of each layer's experts in memory.** A fixed share of each layer's experts stays in RAM (`moe_expert_offload_resident_fraction`, default 0.25). The others are read from the model's own safetensors files when the router picks them. The source describes it as fitting "models larger than memory; costs decode speed".
- **Needs no converted copy.** It reads the original model files directly.
- **Keeps the most-used experts.** When it needs room, it drops the expert with the lowest recent routing count. Reads run in parallel, with read-ahead.
- **Doesn't change answers.** The model still picks exactly the same experts; streaming only changes when their weights are read.
- **Measured cost, from the code's own notes:** on a 26B model with 128 experts, accuracy stayed flat down to 12% kept in memory. Speed fell roughly with the square root of the memory kept.

## Compared with Strata

|                          | Strata (Mac)                                                                                              | oMLX                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Which models             | Its one MoE model                                                                                         | Any MoE model with quantized experts in the standard layout |
| How much stays in memory | Sized from macOS's free memory, filled in 1.5 GB steps                                                    | A fixed fraction per layer, set by you                      |
| What it reads from disk  | A rearranged copy of the experts (~40 GB extra), one read per expert, about 17% faster decode on their M4 | The original files, no extra disk space                     |
| Dense models             | No                                                                                                        | No: the Qwen3.8-27B can't use it                            |

## Limits in oMLX

- **Speculative decoding:** it can't run with VLM MTP or DFlash. Lightning MTP only works with it on DeepSeek V4.1, GLM-5 Next and Flash-Next (`qwen4_exp`), whose draft head stays in memory.
- **Other settings:** it can't run with the float16 activation setting.
- **Unsupported layouts are skipped.** Experts that aren't quantized, have fused projections or have per-expert biases stay fully in memory.
- **Reload needed:** changing it requires reloading the model.

## What the grid showed

The `moe_offload` runs (75% and 50% kept) on Qwen3.6 came out within noise. That doesn't prove streaming is free. Those models already fit in RAM, so macOS likely served the "disk" reads from its file cache. **A model that's really bigger than memory hasn't been tested yet.**

## To try a model bigger than RAM

- **Get Flash-Next as an MLX checkpoint** with quantized experts. Not checked: whether one exists or how big it is.
- **Turn on expert offload** with a low resident fraction, for example 0.12–0.25.
- **Check that the memory guard lets it load.** In the grid, `safe` refused models that didn't fit. Not confirmed: whether the guard counts only the experts kept in memory.
- **Expect speed in the same range as Strata's 32 GB numbers**, and measure it with the decode and HA stages of `scripts/omlx.py`.
