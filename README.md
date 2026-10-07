# Gauntlet Legends Remake

A fan-made remake of the 1998 arcade classic **Gauntlet Legends** that runs in the browser in 3D. Like the original, it has a 3/4 overhead camera that follows the party through torch-lit 3D dungeons, low-poly heroes and monsters, and stat panels in the corners of the screen.

It is plain JavaScript with no build step. The only library is [three.js](https://threejs.org), included in `vendor/` (MIT licensed).

The heroes, monsters and dungeon are animated 3D models from Kay Lousberg's free **CC0** KayKit packs (see [`assets/CREDITS.md`](assets/CREDITS.md)). A few things the packs don't cover (three of the bosses, magic pickups, effects) are built in code. Sounds are synthesized. None of the original game's art, models, audio or levels are used.

> Fan project. Not affiliated with or endorsed by the owners of the Gauntlet trademark.

## Play

```bash
npm start          # serves the game at http://localhost:8080
```

Any static file server works too, e.g. `python3 -m http.server`. The game uses ES modules, so opening `index.html` straight from disk won't work. You need a browser with WebGL; any recent desktop browser has it. Because it is fully static, it can also be hosted on GitHub Pages.

## Controls

| | Move | Attack | Magic potion | Turbo (hold + attack) |
|---|---|---|---|---|
| **Player 1** (keyboard) | WASD | Space / F | E / G | Left Shift / Q |
| **Player 2** (keyboard) | Arrows | Enter / `/` | `.` / `'` | Right Shift / `,` |
| **Gamepads** (up to 4) | Stick / D-pad | A / RT | B / Y | X / RB + A |

`P`/`Esc`/Start pauses · `M` mutes sound · `V` turns the announcer on or off · `X` changes the pixel size (retro / chunky / off) · `Tab` shows a map of explored areas.

Up to **4 players** can play co-op on one screen. Press Attack on any unused keyboard or gamepad to join, even in the middle of a level.

## Features

- **Four classic heroes**, each with its own stats and turbo attack:
  - Warrior: strong melee, whirlwind spin
  - Valkyrie: heavy armor, shield dash
  - Wizard: strong magic, fire nova
  - Archer: speed and rapid fire, arrow volley
- **Health drains over time**, as in the arcade. Eat food to survive, and don't shoot it!
- **Melee and ranged combat.** Attacking next to an enemy swings your weapon; otherwise you throw your projectile.
- **Turbo meter.** Fills as you deal damage. Hold Turbo and press Attack to spend it on your class's special move.
- **Magic potions** hit everything on screen. Shooting a potion on the floor sets it off at half strength.
- **Generators** keep spawning grunts, ghosts, lobbers, demons and sorcerers until you destroy them. Each one has three tiers of damage.
- **Death** drains your health and can only be destroyed by magic.
- **Keys and doors.** Keys are placed so a level can never become unwinnable, whichever doors you open first. This is checked by the tests.
- **RPG progression.** Kills give experience; levelling up raises strength, shot damage, armor, speed and magic.
- **Amulets** give temporary powers: Speed, Rapid Fire, Invulnerability and Triple Shot. Treasure chests drop random loot.
- **Four realms, each built differently**, like the original's level design:
  - **Mountain Kingdom:** winding canyon trails between jagged cliffs, crossed by lava rivers with wooden bridges
  - **Castle Stronghold:** grassy courtyards ringed by pillars, joined by wide stone halls
  - **Sky Dominion:** stone islands floating above drifting clouds, linked by narrow bridges
  - **Underworld:** scorched caverns riddled with lava

  Each realm has 3 procedurally generated levels with the original's stage names (Valley of Fire, Castle Courtyard, ...), then a **boss fight** against the Dragon, the Chimera, the Plague Fiend or Skorne. Bosses breathe fire in every direction, charge and summon minions; defeating one earns a Rune Stone.
- **Lava** burns heroes who wade through it (monsters won't go near it), **gates** block the trail until you find a key, and **treasure vaults** behind locked gates hold chests, gems and potions.
- **Pixel-art rendering:** the 3D view is drawn at a low resolution and scaled up with hard pixel edges for a retro look (press `X` to change it).
- **Animated characters.** Heroes run, swing, throw, cast and play hit and death animations; attacks blend onto the upper body so you can fight while running. Skeletons claw their way out of the ground when a generator spawns them and collapse when slain.
- **Breakable barrels and treasure chests**, gates that sink into the floor when unlocked, and a swirling exit portal.
- **Arcade announcer** via your browser's speech synthesis ("Warrior needs food, badly!"). Also: a shared camera that keeps the party together, a minimap of explored areas, a high score table, and drop-in "continue" after dying.

## Project layout

```
index.html        canvas + module entry
server.js         zero-dependency static server (npm start)
src/main.js       game loop and state machine (title, hero select, play, pause, level clear, game over)
src/game.js       simulation: players, enemies and their AI, generators, projectiles, pickups
src/level.js      procedural dungeon and boss arena generation (pure, testable)
src/render3d.js   three.js renderer: builds level geometry from the tile map, lighting and shadows,
                  camera, and keeps a 3D model in sync with every entity
src/assets.js     loads the KayKit models; Actor = animated character with separate upper/lower-body actions
src/models.js     procedural models for the Dragon, Chimera and Plague Fiend, magic pickups, effects
src/hud.js        2D overlay: corner player panels, floating text, banners, menus
vendor/           three.js + GLTFLoader, SkeletonUtils, meshopt decoder (MIT)
assets/models/    CC0 KayKit models, prepared by tools/build-assets.mjs
src/input.js      keyboard and gamepad input sources
src/audio.js      synthesized sound effects and announcer
src/config.js     tuning tables for classes, enemies and power-ups
test/             node:test suite (level generation and solvability)
```

## Rebuilding the 3D assets

The prepared models are committed, so this is only needed to change which models are used:

```bash
npm install
git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 kaykit/KayKit-Character-Pack-Adventures-1.0
git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0  kaykit/KayKit-Character-Pack-Skeletons-1.0
git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0        kaykit/KayKit-Dungeon-Remastered-1.0
git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0            kaykit/KayKit-Halloween-Bits-1.0
npm run build-assets -- kaykit
```

## Tests

```bash
npm test
```

## Ideas for next steps

- More enemy types and per-realm enemy variety; traps, teleporters and secret walls
- Unique layouts for each boss and multiple attack phases
- Character unlocks (the hidden Legends characters), stat allocation on level-up and a save system
- Background music
- Online co-op
