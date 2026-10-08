# Asset credits

All 3D models and animations in `assets/models/` come from free packs by **Kay Lousberg**
([kaylousberg.com](https://kaylousberg.com)), released under
**Creative Commons Zero (CC0 1.0)**: free for personal, educational and commercial use, no
attribution required (credited here anyway, with thanks).

| Pack | Used for |
|---|---|
| [KayKit Character Pack: Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | The animation rig the heroes are built on (the hero bodies themselves are made in `src/heroes.js`) |
| [KayKit Character Pack: Skeletons](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0) | Grunts, ghosts, lobbers, demons, sorcerers, Death, Skorne, all character animations |
| [KayKit Dungeon Remastered](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0) | Floors, walls, gates, torches, banners, chests, barrels, food, coins, keys, potions |
| [KayKit Halloween Bits](https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0) | Bones, skulls, graves, shrines and candles (generators and dungeon clutter) |

The files were converted with `npm run build-assets -- <dir-with-the-four-repos>` (see
`tools/build-assets.mjs`): unused meshes and animations are stripped, one shared animation
library is extracted, and everything is meshopt-compressed. Class-coloured capes are applied at
load time.

## Announcer voice

The announcer lines in `assets/voice/` were generated for this project with the
[Kokoro](https://github.com/hexgrad/kokoro) text-to-speech model (Apache-2.0, voice
"am_michael") through [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx), then given an
arcade-announcer treatment with ffmpeg. Regenerate them with `tools/voice-lines.mjs` and
`tools/build-voice.py` (instructions at the top of that file) after changing any line.

No assets from the original Gauntlet Legends (art, models, audio, levels) are used.
