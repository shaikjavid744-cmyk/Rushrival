# Third-party asset licences

| Asset | Source | Author | Licence | Used in |
|---|---|---|---|---|
| Universal Animation Library (Standard) – mannequin mesh + clips `Idle_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, `Jump_Start`, `Jump_Loop`, `Jump_Land`, `Roll`, `Death01`, `Hit_Chest` | https://quaternius.itch.io/universal-animation-library | Quaternius | **CC0 1.0** (public domain; bundled `License.txt`: "free to use in personal, educational and commercial projects… CC0") | `mobile/src/game/three/runnerModel.ts` (embedded GLB, stripped by `art_src/strip_glb.mjs`: unused clips removed, pruned, resampled, quantized → 793 KB) |
| three.js | https://github.com/mrdoob/three.js | three.js authors | MIT | 3D run renderer |
| expo-gl | https://github.com/expo/expo | Expo | MIT | GL context (Android GLES / web WebGL) |

All other art (character cards, menu hero art, worlds, power-ups, boards, UI) and all audio are original, generated for this project, and royalty-free.
Per-character looks in 3D (colours, hair, hood, headband) are applied procedurally at runtime over the CC0 mannequin.
