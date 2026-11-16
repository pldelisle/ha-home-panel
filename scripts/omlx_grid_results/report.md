# oMLX grid results

Generated 2026-11-15 12:32. Higher score = better within a stage; empty = failed or didn't fit.

## Home Assistant suite (all models)

Synthetic house prompt (~6K tokens, 6 tools), thinking off, temperature 0. Live = median time per answer after the first (prompt cached).

| Model                       | MTP option | Backend used                                   | Tool cases | Live s | First s | French brief | Brief tok/s | Vision | Vision s | Peak GB | Failed cases                                                                                                                                                       |
| --------------------------- | ---------- | ---------------------------------------------- | ---------- | ------ | ------- | ------------ | ----------- | ------ | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| gemma-4-26B-A4B-it-oQ4e-mtp | vlm_mtp_on | Lightning MTP (model_type=gemma4, active)      | 10/10      | 1.41   | 4.27    | ok           | 34.01       | ok     | 0.59     | 19.41   | none                                                                                                                                                               |
| gemma-4-26B-A4B-it-oQ4e-mtp | mtp_on     | Lightning MTP (model_type=gemma4, active)      | 10/10      | 1.42   | 3.97    | ok           | 34.02       | ok     | 0.57     | 19.44   | none                                                                                                                                                               |
| gemma-4-26B-A4B-it-oQ4e-mtp | mtp_off    | ?                                              | 10/10      | 1.43   | 32.55   | ok           | 41.24       | ok     | 2.77     | 19.19   | none                                                                                                                                                               |
| Qwen3.8-27B-oQ4e-fp16-mtp   | mtp_on     | Lightning MTP (model_type=qwen3_5, active)     | 10/10      | 3.03   | 17.18   | no           | 16.66       | ok     | 0.87     | 20.57   | none                                                                                                                                                               |
| Qwen3.8-27B-oQ4e-fp16-mtp   | mtp_off    | ?                                              | 10/10      | 5.42   | 123.11  | no           | 10.71       | ok     | 2.13     | 20.5    | none                                                                                                                                                               |
| Qwen3.8-27B-oQ3e-fp16-mtp   | mtp_on     | Lightning MTP (model_type=qwen3_5, active)     | 9/10       | 3.79   | 5.61    | ok           | 14.82       | ok     | 1.1      | 17.98   | Set the car charge limit to → The car's charge limit has been set to 80%.                                                                                          |
| Qwen3.8-27B-oQ3e-fp16-mtp   | mtp_off    | ?                                              | 9/10       | 4.67   | 122.79  | ok           | 13.24       | ok     | 1.96     | 17.96   | Set the car charge limit to → The car's charge limit has been set to 80%.                                                                                          |
| Qwen3.6-35B-A3B-oQ4e-mtp    | mtp_on     | Lightning MTP (model_type=qwen3_5_moe, active) | 8/10       | 1.24   | 1.37    | ok           | 50.0        | ok     | 0.26     | 24.23   | J'ai froid dans le bureau. → Je peux augmenter la température du bureau de 1 de; Quand Geneviève est-elle arr → Je n'ai pas accès à l'historique des déplacements  |
| Qwen3.6-35B-A3B-oQ3e-mtp    | mtp_on     | Lightning MTP (model_type=qwen3_5_moe, active) | 8/10       | 1.26   | 1.22    | ok           | 54.49       | ok     | 0.25     | 19.43   | J'ai froid dans le bureau. → Je peux augmenter la température du bureau de 1 de; Quand Geneviève est-elle arr → Je n'ai pas accès à l'historique des arrivées ou d |
| Qwen3.6-35B-A3B-oQ4e-mtp    | mtp_off    | ?                                              | 8/10       | 1.3    | 27.9    | ok           | 51.79       | ok     | 0.65     | 23.59   | J'ai froid dans le bureau. → Je peux augmenter la température du bureau de 1 de; Quand Geneviève est-elle arr → Je n'ai pas accès à l'historique des déplacements  |
| Qwen3.6-35B-A3B-oQ3e-mtp    | mtp_off    | ?                                              | 8/10       | 1.38   | 26.94   | ok           | 51.74       | ok     | 0.69     | 19.02   | J'ai froid dans le bureau. → Je peux augmenter la température du bureau de 1 de; Quand Geneviève est-elle arr → Je n'ai pas accès à l'historique des arrivées des  |

French briefs as written (read them: the check above is only mechanical):

**Qwen3.6-35B-A3B-oQ3e-mtp (mtp_off)**

> Froid glacial dehors (-19 ressenti), mais cozy à 20,5 °C à la maison.
> Neige légère prévue cet après-midi, et le soleil se couche à 16 h 18.
> La voiture est branchée à 64 % (limite 90 %), prêt pour le défi Hilo demain.
> Rendez-vous chez le dentiste de Milan à 10 h 30, puis on se voit à 17 h.

**Qwen3.6-35B-A3B-oQ3e-mtp (mtp_on)**

> Froid glacial dehors (-19 ressenti), mais cozy à 20,5 °C à la maison.
> Neige légère prévue cet après-midi, et le soleil se couche à 16 h 18.
> La voiture est branchée à 64 % (limite 90 %) et le défi Hilo est demain à 17 h.
> Rendez-vous chez le dentiste de Milan à 10 h 30 pour le reste de la journée.

**Qwen3.6-35B-A3B-oQ4e-mtp (mtp_off)**

> Froid glacial dehors (-19 ressenti), mais cozy à 20,5 °C à la maison.
> La voiture est branchée et en bonne santé (64 %), avec de la neige prévue cet aprèm.
> Rendez-vous chez le dentiste de Milan à 10 h 30, puis défi Hilo demain soir.
> Profite du soleil qui se couche tôt à 16 h 18 avant la nuit!

**Qwen3.6-35B-A3B-oQ4e-mtp (mtp_on)**

> Froid glacial dehors (-19 ressenti), mais cozy à 20,5 °C à la maison.
> La voiture est branchée et en bonne santé (64 %), avec de la neige prévue cet après-midi.
> Rendez-vous chez le dentiste de Milan à 10 h 30, puis défi Hilo demain soir.
> Profite du soleil qui se couche tôt à 16 h 18 avant la nuit!

**Qwen3.8-27B-oQ3e-fp16-mtp (mtp_off)**

> Il fait -12 dehors, avec un peu de neige cet après-midi.
> La maison est à 20,5 °C et la voiture est branchée à 64 %.
> Le soleil se couche à 16 h 18 et Milan a le dentiste à 10 h 30.
> On a le défi Hilo demain de 17 h à 21 h.

**Qwen3.8-27B-oQ3e-fp16-mtp (mtp_on)**

> Il fait -12 dehors, avec un peu de neige cet après-midi.
> La maison est à 20,5 °C et la voiture est branchée à 64 %.
> Le soleil se couche à 16 h 18 et Milan a le dentiste à 10 h 30.
> On a le défi Hilo demain de 17 h à 21 h.

**Qwen3.8-27B-oQ4e-fp16-mtp (mtp_off)**

> Hors gel à -12 °C, neige légère prévue cet après-midi.
> Maison à 20,5 °C, voiture branchée à 64 %.
> Dentiste de Milan à 10 h 30, soleil couchant à 16 h 18.
> Défi Hilo demain de 17 h à 21 h.

**Qwen3.8-27B-oQ4e-fp16-mtp (mtp_on)**

> Hors gel à -12 °C, neige légère prévue cet après-midi.
> Maison à 20,5 °C, voiture branchée à 64 %.
> Dentiste de Milan à 10 h 30, soleil couchant à 16 h 18.
> Défi Hilo demain de 17 h à 21 h.

**gemma-4-26B-A4B-it-oQ4e-mtp (mtp_off)**

> Voici ton bulletin du matin :
>
> Frette dehors (-12 °C, ressenti -19 °C) avec de la neige légère à l'arrivée.
> La maison est au chaud à 20,5 °C et la char est branchée (64 %).
> Dentiste pour Milan à 10 h 30; soleil qui se couche à 16 h 18.
> Défi Hilo demain soir de 17 h à 21 h.

**gemma-4-26B-A4B-it-oQ4e-mtp (mtp_on)**

> Voici ton bulletin du matin :
>
> Frette dehors (-12 °C, ressenti -19 °C) avec de la neige légère à l'après-midi.
> La maison est à 20,5 °C et la voiture est branchée (64 %).
> Dentiste pour Milan à 10 h 30; soleil qui se couche à 16 h 18.
> Défi Hilo demain de 17 h à 21 h.

**gemma-4-26B-A4B-it-oQ4e-mtp (vlm_mtp_on)**

> Voici ton bulletin du matin :
>
> Frette dehors (-12 °C, ressenti -19 °C) avec de la neige légère à l'après-midi.
> La maison est à 20,5 °C et la voiture est branchée (64 %).
> Dentiste pour Milan à 10 h 30; soleil qui se couche à 16 h 18.
> Défi Hilo demain de 17 h à 21 h.

## Qwen3.6-35B-A3B-oQ3e-mtp

| Stage            | Option          | Score | W1 tok/s | W2 tok/s | W2 TTFT s | W3 tok/s | Peak GB | Swap MB | MTP accept | Notes                                          |
| ---------------- | --------------- | ----- | -------- | -------- | --------- | -------- | ------- | ------- | ---------- | ---------------------------------------------- |
| ha               | mtp_off         | 98.4  |          |          |           |          |         |         |            |                                                |
| ha               | mtp_on          | 98.8  |          |          |           |          |         |         |            |                                                |
| mtp              | off             | 48.4  | 51.48    | 45.34    | 39.957    |          | 21.44   | -32.0   |            |                                                |
| mtp              | adaptive        | 51.7  | 60.47    | 42.92    | 42.211    |          | 21.76   | 0.0     | 0.869      |                                                |
| mtp              | adaptive2       | 49.7  | 57.6     | 41.79    | 43.007    |          | 21.79   | 0.0     | 0.799      |                                                |
| mtp              | fixed1          | 47.2  | 58.02    | 36.42    | 42.532    |          | 21.85   | -24.0   | 0.842      |                                                |
| mtp              | fixed2          | 51.1  | 60.07    | 42.04    | 42.297    |          | 21.8    | 0.0     | 0.817      |                                                |
| mtp              | fixed3          | 55.1  | 64.115   | 46.03    | 44.012    |          | 20.75   | 0.0     | 0.841      |                                                |
| kv               | native          | 42.0  |          | 46.24    | 42.135    | 36.73    | 21.64   | -56.0   | 0.855      | passkey ok                                     |
| kv               | affine8         | 56.9  |          | 59.3     | 37.763    | 53.77    | 22.05   | 0.0     | 0.878      | passkey ok                                     |
| kv               | affine4         | 51.9  |          | 53.14    | 37.803    | 50.44    | 21.43   | -16.0   | 0.813      | passkey ok                                     |
| kv               | turboquant4     | 51.4  |          | 53.23    | 42.805    | 49.5     | 22.25   | -8.0    | 0.79       | passkey ok                                     |
| burst            | off             | 62.5  | 62.51    |          |           |          | 20.31   | 0.0     | 0.779      |                                                |
| burst            | light           | 61.7  | 61.73    |          |           |          | 20.3    | 0.0     | 0.752      |                                                |
| burst            | balanced        | 63.9  | 63.94    |          |           |          | 20.31   | 0.0     | 0.792      |                                                |
| burst            | aggressive      | 61.3  | 61.26    |          |           |          | 20.3    | 0.0     | 0.743      |                                                |
| concurrency      | max1            | 342.2 | 64.48    |          |           |          | 20.25   | 0.0     | 0.823      | 2x agg 41.79, 4x agg 42.52                     |
| concurrency      | max2            | 338.7 | 65.6     |          |           |          | 20.21   | 0.0     | 0.859      | 2x agg 36.73, 4x agg 39.6                      |
| concurrency      | max4            | 328.0 | 62.875   |          |           |          | 20.22   | 0.0     | 0.805      | 2x agg 38.61, 4x agg 37.88                     |
| concurrency      | max8            | 338.9 | 65.695   |          |           |          | 20.23   | 0.0     | 0.828      | 2x agg 38.23, 4x agg 37.87                     |
| scheduler        | chunk0_prefill  | 62.7  |          |          |           |          |         |         |            | short TTFT 43.7 s, long tg 60.43               |
| scheduler        | chunk0_balanced | 60.8  |          |          |           |          |         |         |            | short TTFT 43.59 s, long tg 58.46              |
| scheduler        | chunk0_decode   | 61.3  |          |          |           |          |         |         |            | short TTFT 43.57 s, long tg 59.03              |
| scheduler        | chunk1_prefill  | 58.2  |          |          |           |          |         |         |            | short TTFT 44.16 s, long tg 55.95              |
| scheduler        | chunk1_balanced | 60.3  |          |          |           |          |         |         |            | short TTFT 43.64 s, long tg 58.04              |
| scheduler        | chunk1_decode   | 56.6  |          |          |           |          |         |         |            | short TTFT 44.02 s, long tg 54.33              |
| memory           | safe            |       |          |          |           |          |         |         |            | load refused                                   |
| memory           | balanced        |       |          |          |           |          | 20.46   | 0.0     |            | 48K failed                                     |
| memory           | aggressive      | 213.0 |          |          |           | 50.1     | 21.97   | -32.0   |            | 48K ok                                         |
| memory           | custom24        | 109.0 |          |          |           | 52.01    | 23.46   | -32.0   |            | 48K ok                                         |
| memory           | custom26        | 209.0 |          |          |           | 50.84    | 23.68   | -72.1   |            | 48K ok                                         |
| prefill_priority | context         | 11.4  |          |          |           | 51.9     | 22.48   | -8.0    |            |                                                |
| prefill_priority | speed           | 11.4  |          |          |           | 52.4     | 22.47   | -64.0   |            |                                                |
| cache            | hot0            | 30.2  |          |          |           |          |         |         |            | resume TTFT warm 6.567 s, after reload 6.661 s |
| cache            | hot2GB          | 29.9  |          |          |           |          |         |         |            | resume TTFT warm 6.56 s, after reload 6.811 s  |
| cache            | hot4GB          | 29.9  |          |          |           |          |         |         |            | resume TTFT warm 6.571 s, after reload 6.806 s |
| cache            | hot4GB_wt       | 30.0  |          |          |           |          |         |         |            | resume TTFT warm 6.535 s, after reload 6.825 s |
| keep_warm        | window300       | 0.7   |          |          |           |          |         |         |            | after idle TTFT 1.401 s                        |
| keep_warm        | window1800      | 0.8   |          |          |           |          |         |         |            | after idle TTFT 1.278 s                        |
| moe_offload      | off             | 60.3  | 66.285   | 54.4     | 36.947    |          | 21.95   | -8.0    | 0.85       |                                                |
| moe_offload      | resident75      | 60.5  | 65.28    | 55.64    | 37.129    |          | 21.95   | 0.0     | 0.832      |                                                |
| moe_offload      | resident50      | 63.1  | 66.125   | 60.05    | 38.292    |          | 21.66   | 0.0     | 0.855      |                                                |
| a8_prefill       | off             | 437.9 |          | 57.11    | 36.721    |          | 21.66   | 0.0     | 0.836      | quality 8/8                                    |
| a8_prefill       | on              | 438.2 |          | 58.56    | 36.688    |          | 21.57   | 0.0     | 0.842      | quality 8/8                                    |

## Qwen3.6-35B-A3B-oQ4e-mtp

| Stage            | Option          | Score | W1 tok/s | W2 tok/s | W2 TTFT s | W3 tok/s | Peak GB | Swap MB | MTP accept | Notes                                          |
| ---------------- | --------------- | ----- | -------- | -------- | --------- | -------- | ------- | ------- | ---------- | ---------------------------------------------- |
| ha               | mtp_off         | 98.7  |          |          |           |          |         |         |            |                                                |
| ha               | mtp_on          | 98.9  |          |          |           |          |         |         |            |                                                |
| mtp              | off             | 50.1  | 53.315   | 46.85    | 44.727    |          | 24.88   | 0.0     |            |                                                |
| mtp              | adaptive        |       | 66.1     |          |           |          | 25.14   | 0.0     | 0.892      |                                                |
| mtp              | adaptive2       |       | 64.665   |          |           |          | 25.08   | 0.0     | 0.851      |                                                |
| mtp              | fixed1          | 47.1  | 58.88    | 35.38    | 58.779    |          | 24.94   | 0.0     | 0.9        |                                                |
| mtp              | fixed2          | 53.0  | 62.505   | 43.42    | 47.534    |          | 25.45   | -24.0   | 0.85       |                                                |
| mtp              | fixed3          | 55.8  | 65.255   | 46.35    | 47.922    |          | 25.2    | 0.0     | 0.869      |                                                |
| kv               | native          |       |          | 47.94    | 45.588    |          | 25.72   | -32.0   | 0.835      | passkey ok                                     |
| kv               | affine8         |       |          |          |           |          | 25.25   | 0.0     |            | passkey ok                                     |
| kv               | affine4         |       |          | 56.52    | 42.668    |          | 25.35   | -120.0  | 0.782      | passkey FAILED                                 |
| kv               | turboquant4     |       |          | 55.32    | 47.468    |          | 25.37   | -24.0   | 0.86       | passkey FAILED                                 |
| burst            | off             | 63.4  | 63.43    |          |           |          | 24.58   | 0.0     | 0.806      |                                                |
| burst            | light           | 64.7  | 64.7     |          |           |          | 25.24   | -64.0   | 0.81       |                                                |
| burst            | balanced        | 61.8  | 61.83    |          |           |          | 25.23   | -16.0   | 0.779      |                                                |
| burst            | aggressive      | 59.9  | 59.85    |          |           |          | 25.1    | 0.0     | 0.763      |                                                |
| concurrency      | max1            | 340.3 | 65.665   |          |           |          | 25.34   | 0.0     | 0.854      | 2x agg 38.66, 4x agg 39.01                     |
| concurrency      | max2            | 330.7 | 64.615   |          |           |          | 24.97   | -8.0    | 0.859      | 2x agg 35.44, 4x agg 36.84                     |
| concurrency      | max4            | 331.2 | 64.955   |          |           |          | 25.0    | -8.0    | 0.828      | 2x agg 37.99, 4x agg 33.4                      |
| concurrency      | max8            | 329.9 | 64.655   |          |           |          | 25.01   | 0.0     | 0.854      | 2x agg 37.08, 4x agg 34.22                     |
| scheduler        | chunk0_prefill  | 53.5  |          |          |           |          |         |         |            | short TTFT 52.89 s, long tg 51.59              |
| scheduler        | chunk0_balanced | 46.4  |          |          |           |          |         |         |            | short TTFT 51.66 s, long tg 44.42              |
| scheduler        | chunk0_decode   | 50.1  |          |          |           |          |         |         |            | short TTFT 51.5 s, long tg 48.17               |
| scheduler        | chunk1_prefill  | 46.9  |          |          |           |          |         |         |            | short TTFT 51.86 s, long tg 44.99              |
| scheduler        | chunk1_balanced | 46.4  |          |          |           |          |         |         |            | short TTFT 53.78 s, long tg 44.57              |
| scheduler        | chunk1_decode   | 44.9  |          |          |           |          |         |         |            | short TTFT 54.55 s, long tg 43.03              |
| memory           | safe            |       |          |          |           |          |         |         |            | load refused                                   |
| memory           | balanced        |       |          |          |           |          | 25.43   | 0.0     |            | 48K failed                                     |
| memory           | aggressive      | 109.0 |          |          |           | 49.02    | 25.9    | -200.0  |            | 48K failed                                     |
| memory           | custom24        |       |          |          |           |          | 24.56   | -48.0   |            | 48K failed                                     |
| memory           | custom26        | 205.0 |          |          |           | 49.28    | 26.61   | -98.9   |            | 48K ok                                         |
| prefill_priority | context         | 8.6   |          |          |           | 47.09    | 25.93   | -120.0  |            |                                                |
| prefill_priority | speed           | 9.0   |          |          |           | 35.14    | 26.39   | -40.0   |            |                                                |
| cache            | hot0            | 22.7  |          |          |           |          |         |         |            | resume TTFT warm 9.386 s, after reload 8.273 s |
| cache            | hot2GB          | 22.5  |          |          |           |          |         |         |            | resume TTFT warm 9.485 s, after reload 8.383 s |
| cache            | hot4GB          | 22.5  |          |          |           |          |         |         |            | resume TTFT warm 9.495 s, after reload 8.375 s |
| cache            | hot4GB_wt       | 22.5  |          |          |           |          |         |         |            | resume TTFT warm 9.445 s, after reload 8.395 s |
| keep_warm        | window300       | 0.1   |          |          |           |          |         |         |            | after idle TTFT 6.893 s                        |
| keep_warm        | window1800      | 0.8   |          |          |           |          |         |         |            | after idle TTFT 1.271 s                        |
| moe_offload      | off             | 55.4  | 64.41    | 46.3     | 47.576    |          | 25.63   | -64.0   | 0.85       |                                                |
| moe_offload      | resident75      | 57.3  | 65.515   | 49.14    | 47.55     |          | 25.59   | -8.0    | 0.859      |                                                |
| moe_offload      | resident50      | 54.7  | 64.63    | 44.86    | 47.583    |          | 25.63   | -24.0   | 0.846      |                                                |
| a8_prefill       | off             | 371.4 |          | 44.89    | 43.306    |          | 25.52   | -64.0   | 0.788      | quality 8/8                                    |
| a8_prefill       | on              | 370.2 |          | 46.16    | 43.444    |          | 25.53   | -192.1  | 0.804      | quality 8/8                                    |

## Qwen3.8-27B-oQ3e-fp16-mtp

| Stage            | Option          | Score | W1 tok/s | W2 tok/s | W2 TTFT s | W3 tok/s | Peak GB | Swap MB | MTP accept | Notes                                            |
| ---------------- | --------------- | ----- | -------- | -------- | --------- | -------- | ------- | ------- | ---------- | ------------------------------------------------ |
| ha               | mtp_off         | 103.5 |          |          |           |          |         |         |            |                                                  |
| ha               | mtp_on          | 104.2 |          |          |           |          |         |         |            |                                                  |
| mtp              | off             | 12.8  | 13.315   | 12.25    | 171.139   |          | 21.58   | -8.0    |            |                                                  |
| mtp              | adaptive        | 16.0  | 19.25    | 12.8     | 175.824   |          | 21.77   | 0.0     | 0.783      |                                                  |
| mtp              | adaptive5       | 17.5  | 20.025   | 15.02    | 176.21    |          | 21.38   | -8.0    | 0.816      |                                                  |
| mtp              | fixed1          | 15.8  | 18.83    | 12.74    | 175.424   |          | 21.85   | 0.0     | 0.833      |                                                  |
| mtp              | fixed2          | 15.1  | 18.475   | 11.77    | 175.388   |          | 21.86   | 0.0     | 0.78       |                                                  |
| mtp              | fixed3          | 16.0  | 19.37    | 12.71    | 175.443   |          | 21.9    | 0.0     | 0.755      |                                                  |
| mtp              | fixed4          | 16.0  | 19.27    | 12.67    | 176.572   |          | 21.35   | 0.0     | 0.773      |                                                  |
| kv               | native          | 14.0  |          | 15.45    | 176.101   | 12.32    | 23.41   | -16.0   | 0.812      | passkey ok                                       |
| kv               | affine8         | 12.7  |          | 12.45    | 184.434   | 12.11    | 23.14   | -16.0   | 0.703      | passkey ok                                       |
| kv               | affine4         | 13.7  |          | 12.07    | 184.627   | 13.8     | 22.86   | -32.0   | 0.669      | passkey ok                                       |
| kv               | turboquant4     | 14.6  |          | 15.75    | 175.803   | 13.21    | 23.32   | 0.0     | 0.825      | passkey ok                                       |
| burst            | off             | 17.8  | 17.75    |          |           |          | 18.98   | 0.0     | 0.698      |                                                  |
| burst            | light           | 18.0  | 18.0     |          |           |          | 18.97   | 0.0     | 0.832      |                                                  |
| burst            | balanced        | 18.0  | 17.96    |          |           |          | 18.97   | 0.0     | 0.745      |                                                  |
| burst            | aggressive      | 16.9  | 16.86    |          |           |          | 18.97   | 0.0     | 0.713      |                                                  |
| concurrency      | max1            | 99.6  | 20.27    |          |           |          | 18.98   | 0.0     | 0.78       | 2x agg 9.13, 4x agg 9.39                         |
| concurrency      | max2            | 98.6  | 19.62    |          |           |          | 19.05   | 0.0     | 0.766      | 2x agg 10.08, 4x agg 10.04                       |
| concurrency      | max4            | 94.9  | 18.57    |          |           |          | 19.05   | 0.0     | 0.796      | 2x agg 10.08, 4x agg 10.57                       |
| concurrency      | max8            | 99.5  | 19.685   |          |           |          | 18.99   | 0.0     | 0.771      | 2x agg 9.94, 4x agg 10.8                         |
| scheduler        | chunk0_prefill  | 13.0  |          |          |           |          |         |         |            | short TTFT 216.27 s, long tg 12.51               |
| scheduler        | chunk0_balanced | 13.0  |          |          |           |          |         |         |            | short TTFT 216.67 s, long tg 12.56               |
| scheduler        | chunk0_decode   | 12.9  |          |          |           |          |         |         |            | short TTFT 217.55 s, long tg 12.44               |
| scheduler        | chunk1_prefill  | 12.9  |          |          |           |          |         |         |            | short TTFT 216.68 s, long tg 12.42               |
| scheduler        | chunk1_balanced | 12.9  |          |          |           |          |         |         |            | short TTFT 217.47 s, long tg 12.48               |
| scheduler        | chunk1_decode   | 13.1  |          |          |           |          |         |         |            | short TTFT 215.97 s, long tg 12.6                |
| memory           | safe            |       |          |          |           |          | 16.63   | 0.0     |            | 48K failed                                       |
| memory           | balanced        | 120.0 |          |          |           | 12.55    | 21.42   | 0.0     |            | 48K failed                                       |
| memory           | aggressive      | 107.0 |          |          |           | 14.22    | 24.81   | -24.0   |            | 48K ok                                           |
| memory           | custom24        | 209.0 |          |          |           | 12.62    | 24.71   | -16.0   |            | 48K ok                                           |
| memory           | custom26        | 207.0 |          |          |           | 12.74    | 25.08   | -80.0   |            | 48K ok                                           |
| prefill_priority | context         | 2.6   |          |          |           | 12.47    | 23.19   | -320.1  |            |                                                  |
| prefill_priority | speed           | 2.6   |          |          |           | 12.67    | 24.16   | -49.4   |            |                                                  |
| cache            | hot0            | 7.1   |          |          |           |          |         |         |            | resume TTFT warm 27.995 s, after reload 28.352 s |
| cache            | hot2GB          | 7.1   |          |          |           |          |         |         |            | resume TTFT warm 27.852 s, after reload 28.61 s  |
| cache            | hot4GB          | 7.1   |          |          |           |          |         |         |            | resume TTFT warm 27.939 s, after reload 28.76 s  |
| cache            | hot4GB_wt       | 7.0   |          |          |           |          |         |         |            | resume TTFT warm 28.082 s, after reload 28.795 s |
| keep_warm        | window300       | 0.2   |          |          |           |          |         |         |            | after idle TTFT 5.239 s                          |
| keep_warm        | window1800      | 0.2   |          |          |           |          |         |         |            | after idle TTFT 4.998 s                          |
| a8_prefill       | off             | 91.4  |          | 12.56    | 176.489   |          | 21.0    | -8.0    | 0.704      | quality 7/8                                      |
| a8_prefill       | on              | 91.8  |          | 12.66    | 175.633   |          | 21.16   | -8.0    | 0.714      | quality 7/8                                      |

## Qwen3.8-27B-oQ4e-fp16-mtp

| Stage            | Option          | Score | W1 tok/s | W2 tok/s | W2 TTFT s | W3 tok/s | Peak GB | Swap MB | MTP accept | Notes                                            |
| ---------------- | --------------- | ----- | -------- | -------- | --------- | -------- | ------- | ------- | ---------- | ------------------------------------------------ |
| ha               | mtp_off         | 108.1 |          |          |           |          |         |         |            |                                                  |
| ha               | mtp_on          | 110.0 |          |          |           |          |         |         |            |                                                  |
| mtp              | off             | 10.6  | 10.94    | 10.22    | 170.594   |          | 22.21   | 0.0     |            |                                                  |
| mtp              | adaptive        | 19.3  | 17.47    | 21.16    | 174.373   |          | 22.85   | 42.1    | 0.694      |                                                  |
| mtp              | adaptive5       | 19.4  | 17.005   | 21.77    | 174.407   |          | 22.45   | -8.0    | 0.699      |                                                  |
| mtp              | fixed1          | 14.9  | 15.305   | 14.55    | 174.355   |          | 22.42   | 0.0     | 0.81       |                                                  |
| mtp              | fixed2          | 15.1  | 15.475   | 14.8     | 174.357   |          | 22.44   | 0.0     | 0.724      |                                                  |
| mtp              | fixed3          | 18.7  | 17.515   | 19.89    | 174.402   |          | 22.45   | 0.0     | 0.71       |                                                  |
| mtp              | fixed4          | 18.9  | 17.795   | 20.04    | 174.478   |          | 23.43   | 51.9    | 0.699      |                                                  |
| kv               | native          | 10.7  |          | 21.24    | 175.98    | 17.31    | 23.55   | 852.6   | 0.878      | passkey ok                                       |
| kv               | affine8         | 23.6  |          | 21.44    | 182.379   | 25.19    | 22.88   | -32.0   | 0.883      | passkey ok                                       |
| kv               | affine4         |       |          | 17.56    | 182.364   | 25.72    | 22.71   | 0.0     | 0.784      | passkey FAILED                                   |
| kv               | turboquant4     | 4.7   |          | 28.86    | 181.438   | 17.07    | 23.64   | 1828.2  | 0.833      | passkey ok                                       |
| burst            | off             | 17.5  | 17.48    |          |           |          | 21.72   | -8.0    | 0.75       |                                                  |
| burst            | light           | 17.4  | 17.39    |          |           |          | 21.65   | -16.0   | 0.75       |                                                  |
| burst            | balanced        | 17.4  | 17.45    |          |           |          | 21.69   | -8.0    | 0.723      |                                                  |
| burst            | aggressive      | 17.4  | 17.37    |          |           |          | 21.64   | 0.0     | 0.743      |                                                  |
| concurrency      | max1            | 84.2  | 15.955   |          |           |          | 21.7    | 0.0     | 0.698      | 2x agg 10.36, 4x agg 10.07                       |
| concurrency      | max2            | 87.0  | 16.695   |          |           |          | 21.65   | 0.0     | 0.708      | 2x agg 9.71, 4x agg 10.46                        |
| concurrency      | max4            | 105.0 | 21.155   |          |           |          | 21.72   | 0.0     | 0.838      | 2x agg 9.99, 4x agg 10.34                        |
| concurrency      | max8            | 86.8  | 16.59    |          |           |          | 21.68   | -8.0    | 0.686      | 2x agg 10.14, 4x agg 10.28                       |
| scheduler        | chunk0_prefill  | 5.1   |          |          |           |          |         |         |            | short TTFT 206.14 s, long tg 4.61                |
| scheduler        | chunk0_balanced | 8.9   |          |          |           |          |         |         |            | short TTFT 211.25 s, long tg 8.44                |
| scheduler        | chunk0_decode   | 4.9   |          |          |           |          |         |         |            | short TTFT 211.79 s, long tg 4.41                |
| scheduler        | chunk1_prefill  | 18.4  |          |          |           |          |         |         |            | short TTFT 44.97 s, long tg 16.13                |
| scheduler        | chunk1_balanced | 23.4  |          |          |           |          |         |         |            | short TTFT 49.41 s, long tg 21.41                |
| scheduler        | chunk1_decode   | 22.7  |          |          |           |          |         |         |            | short TTFT 49.37 s, long tg 20.7                 |
| memory           | safe            |       |          |          |           |          |         |         |            | load refused                                     |
| memory           | balanced        |       |          |          |           |          | 19.15   | -16.0   |            | 48K failed                                       |
| memory           | aggressive      | 109.0 |          |          |           | 25.08    | 23.87   | -441.3  |            | 48K failed                                       |
| memory           | custom24        | 109.0 |          |          |           | 16.74    | 24.21   | -414.0  |            | 48K ok                                           |
| memory           | custom26        | 207.0 |          |          |           | 24.76    | 25.08   | -39.1   |            | 48K ok                                           |
| prefill_priority | context         | 2.3   |          |          |           | 17.52    | 24.86   | -176.0  |            |                                                  |
| prefill_priority | speed           | 2.2   |          |          |           | 17.4     | 26.03   | 702.2   |            |                                                  |
| cache            | hot0            | 6.4   |          |          |           |          |         |         |            | resume TTFT warm 29.455 s, after reload 32.949 s |
| cache            | hot2GB          | 6.4   |          |          |           |          |         |         |            | resume TTFT warm 30.318 s, after reload 32.538 s |
| cache            | hot4GB          | 6.2   |          |          |           |          |         |         |            | resume TTFT warm 30.567 s, after reload 33.996 s |
| cache            | hot4GB_wt       | 6.3   |          |          |           |          |         |         |            | resume TTFT warm 30.733 s, after reload 32.95 s  |
| keep_warm        | window300       | 0.2   |          |          |           |          |         |         |            | after idle TTFT 5.365 s                          |
| keep_warm        | window1800      | 0.2   |          |          |           |          |         |         |            | after idle TTFT 5.021 s                          |
| a8_prefill       | off             | 89.2  |          | 20.66    | 180.772   |          | 24.57   | -28.4   | 0.869      | quality 8/8                                      |
| a8_prefill       | on              | 88.8  |          | 15.71    | 181.668   |          | 24.58   | 553.1   | 0.73       | quality 8/8                                      |

## gemma-4-26B-A4B-it-oQ4e-mtp

| Stage            | Option          | Score | W1 tok/s | W2 tok/s | W2 TTFT s | W3 tok/s | Peak GB | Swap MB | MTP accept | Notes                                           |
| ---------------- | --------------- | ----- | -------- | -------- | --------- | -------- | ------- | ------- | ---------- | ----------------------------------------------- |
| ha               | mtp_off         | 118.2 |          |          |           |          |         |         |            |                                                 |
| ha               | mtp_on          | 118.3 |          |          |           |          |         |         |            |                                                 |
| ha               | vlm_mtp_on      | 118.3 |          |          |           |          |         |         |            |                                                 |
| mtp              | off             | 36.6  | 39.275   | 33.94    | 44.575    |          | 19.91   | 0.0     |            |                                                 |
| mtp              | lightning       | 33.6  | 34.45    | 32.75    | 44.587    |          | 19.92   | 0.0     | 0.797      |                                                 |
| mtp              | vlm_mtp         | 32.9  | 32.41    | 33.34    | 44.206    |          | 19.84   | -8.0    | 0.725      |                                                 |
| mtp              | vlm_mtp_block2  | 33.0  | 33.015   | 33.05    | 44.092    |          | 20.06   | 0.0     | 0.756      |                                                 |
| mtp              | vlm_mtp_block4  | 32.2  | 34.435   | 29.89    | 44.058    |          | 19.77   | 0.0     | 0.859      |                                                 |
| kv               | native          | 32.5  |          | 34.55    | 47.285    | 30.14    | 21.12   | -8.0    |            | passkey ok                                      |
| kv               | affine8         | 37.4  |          | 35.5     | 50.574    | 32.34    | 20.68   | -72.0   |            | passkey ok                                      |
| kv               | affine4         | 34.5  |          | 36.44    | 51.364    | 32.49    | 20.41   | -8.0    |            | passkey ok                                      |
| kv               | turboquant4     | 34.6  |          | 35.82    | 47.875    | 32.79    | 21.18   | -16.0   |            | passkey ok                                      |
| burst            | off             | 39.1  | 39.08    |          |           |          | 18.97   | 0.0     |            |                                                 |
| burst            | light           | 38.9  | 38.92    |          |           |          | 18.94   | 0.0     |            |                                                 |
| burst            | balanced        | 38.9  | 38.87    |          |           |          | 18.94   | 0.0     |            |                                                 |
| burst            | aggressive      | 39.0  | 39.03    |          |           |          | 18.98   | 0.0     |            |                                                 |
| concurrency      | max1            | 204.8 | 39.19    |          |           |          | 18.96   | 0.0     |            | 2x agg 26.18, 4x agg 21.86                      |
| concurrency      | max2            | 207.5 | 39.145   |          |           |          | 18.96   | 0.0     |            | 2x agg 27.77, 4x agg 23.12                      |
| concurrency      | max4            | 210.0 | 39.19    |          |           |          | 18.96   | 0.0     |            | 2x agg 28.47, 4x agg 24.73                      |
| concurrency      | max8            | 210.7 | 39.785   |          |           |          | 18.97   | 0.0     |            | 2x agg 30.4, 4x agg 21.18                       |
| scheduler        | chunk0_prefill  | 37.2  |          |          |           |          |         |         |            | short TTFT 64.89 s, long tg 35.62               |
| scheduler        | chunk0_balanced | 37.5  |          |          |           |          |         |         |            | short TTFT 65.06 s, long tg 35.94               |
| scheduler        | chunk0_decode   | 37.2  |          |          |           |          |         |         |            | short TTFT 65.61 s, long tg 35.69               |
| scheduler        | chunk1_prefill  | 36.9  |          |          |           |          |         |         |            | short TTFT 65.78 s, long tg 35.42               |
| scheduler        | chunk1_balanced | 35.7  |          |          |           |          |         |         |            | short TTFT 65.32 s, long tg 34.14               |
| scheduler        | chunk1_decode   | 37.7  |          |          |           |          |         |         |            | short TTFT 64.61 s, long tg 36.15               |
| memory           | safe            |       |          |          |           |          |         |         |            | load refused                                    |
| memory           | balanced        |       |          |          |           |          | 18.01   | 0.0     |            | 48K failed                                      |
| memory           | aggressive      | 212.0 |          |          |           | 31.9     | 21.38   | -264.0  |            | 48K ok                                          |
| memory           | custom24        | 220.0 |          |          |           | 31.84    | 21.12   | 0.0     |            | 48K ok                                          |
| memory           | custom26        | 214.0 |          |          |           | 31.99    | 21.13   | -48.0   |            | 48K ok                                          |
| prefill_priority | context         | 8.2   |          |          |           | 32.34    | 20.79   | -8.0    |            |                                                 |
| prefill_priority | speed           | 8.2   |          |          |           | 32.05    | 20.83   | -8.0    |            |                                                 |
| cache            | hot0            | 32.7  |          |          |           |          |         |         |            | resume TTFT warm 5.551 s, after reload 6.795 s  |
| cache            | hot2GB          | 18.1  |          |          |           |          |         |         |            | resume TTFT warm 16.462 s, after reload 8.312 s |
| cache            | hot4GB          | 28.6  |          |          |           |          |         |         |            | resume TTFT warm 6.626 s, after reload 7.418 s  |
| cache            | hot4GB_wt       | 26.3  |          |          |           |          |         |         |            | resume TTFT warm 6.639 s, after reload 8.932 s  |
| keep_warm        | window300       | 0.7   |          |          |           |          |         |         |            | after idle TTFT 1.425 s                         |
| keep_warm        | window1800      | 0.8   |          |          |           |          |         |         |            | after idle TTFT 1.2 s                           |
