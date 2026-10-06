# Gauntlet Legends Remake

A fan-made remake of the arcade classic **Gauntlet Legends** that runs in the browser. It uses plain JavaScript with no build step and no dependencies. All graphics and sounds are generated in code, so the repo contains no copyrighted assets.

> Fan project. Not affiliated with or endorsed by the owners of the Gauntlet trademark.

## Play

```bash
npm start          # serves the game at http://localhost:8080
```

Any static file server works too, e.g. `python3 -m http.server`. The game uses ES modules, so opening `index.html` straight from disk won't work. Because it is fully static, it can also be hosted on GitHub Pages.

## Controls

| | Move | Attack | Magic potion | Turbo (hold + attack) |
|---|---|---|---|---|
| **Player 1** (keyboard) | WASD | Space / F | E / G | Left Shift / Q |
| **Player 2** (keyboard) | Arrows | Enter / `/` | `.` / `'` | Right Shift / `,` |
| **Gamepads** (up to 4) | Stick / D-pad | A / RT | B / Y | X / RB + A |

`P`/`Esc`/Start pauses · `M` mutes sound · `V` turns the announcer on or off.

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
- **Four realms:** Mountain Kingdom, Castle Stronghold, Sky Dominion and Underworld. Each realm has 3 procedurally generated dungeon stages followed by a **boss fight**. Bosses have radial fire, charges and summoned minions; defeating one earns a Rune Stone.
- **Arcade announcer** via your browser's speech synthesis ("Warrior needs food, badly!"). Also: a shared camera that keeps the party together, a minimap of explored areas, a high score table, and drop-in "continue" after dying.

## Project layout

```
index.html        canvas + module entry
server.js         zero-dependency static server (npm start)
src/main.js       game loop and state machine (title, hero select, play, pause, level clear, game over)
src/game.js       simulation: players, enemies and their AI, generators, projectiles, pickups
src/level.js      procedural dungeon and boss arena generation (pure, testable)
src/render.js     all drawing: world, lighting, HUD, minimap, menus
src/input.js      keyboard and gamepad input sources
src/audio.js      synthesized sound effects and announcer
src/config.js     tuning tables for classes, enemies and power-ups
test/             node:test suite (level generation and solvability)
```

## Tests

```bash
npm test
```

## Ideas for next steps

- More enemy types and per-realm enemy variety; traps, teleporters and secret walls
- Unique layouts for each boss and multiple attack phases
- Character unlocks (the hidden Legends characters), stat allocation on level-up and a save system
- Background music and sprite art
- Online co-op
