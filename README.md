# Gauntlet Legends Remake

A fan-made remake of the 1998 arcade classic **Gauntlet Legends** that runs in the browser in 3D. Like the original, it has a 3/4 overhead camera that follows the party through torch-lit 3D dungeons, low-poly heroes and monsters, and stat panels in the corners of the screen.

It is plain JavaScript with no build step. The only library is [three.js](https://threejs.org), included in `vendor/` (MIT licensed).

The **heroes** are original models built in code (`src/heroes.js`) in the style of the arcade era: adult proportions, smooth low-poly limbs and bold costumes, attached to an animated rig. The **monsters and dungeon** are animated 3D models from Kay Lousberg's free **CC0** KayKit packs (see [`assets/CREDITS.md`](assets/CREDITS.md)). A few things the packs don't cover (three of the bosses, magic pickups, effects) are built in code. Sounds are synthesized. None of the original game's art, models, audio or levels are used.

> Fan project. Not affiliated with or endorsed by the owners of the Gauntlet trademark.

## Play

```bash
npm start          # serves the game at http://localhost:8080
```

Any static file server works too, e.g. `python3 -m http.server`. The game uses ES modules, so opening `index.html` straight from disk won't work. You need a browser with WebGL; any recent desktop browser has it. Because it is fully static, it can also be hosted on GitHub Pages.

## Play on your phone

The game has on-screen touch controls that appear automatically on phones and tablets: drag anywhere on the **left half** of the screen to move, and use the **Attack**, **Magic** and **Turbo** buttons on the right (Turbo fires your turbo attack on its own). The top-right buttons pause and toggle sound. On the hero screen, tap the **◀ ▶** arrows on your card to change hero (they can be clicked with a mouse too). Hold the phone sideways. On a touchscreen laptop the touch controls only appear when you touch the screen and hide again when you type, and you're never asked to rotate.

Tip: use your browser's **Add to Home Screen** to launch it full-screen like an app.

## Host it for free (GitHub Pages)

The game is plain static files, so GitHub Pages can host it as-is:

1. GitHub Pages is free for **public** repositories: *Settings → General → Danger Zone → Change visibility → Public*.
2. *Settings → Pages*: set **Source** to *Deploy from a branch*, pick the branch with the game and the **/ (root)** folder, and save.
3. After a minute or two the game is live at `https://<your-username>.github.io/<repo-name>/`.

To keep the repository private instead, connect it to a free static host such as Cloudflare Pages or Netlify (no build command; output directory is the repository root).

## Controls

| | Move | Attack | Magic potion | Turbo (hold + attack) |
|---|---|---|---|---|
| **Keyboard** (one player) | WASD or Arrows | Space / F / Enter | E / G / `.` | Left Shift / Q / Right Shift |
| **Shared keyboard, player 1** | WASD | Space / F | E / G | Left Shift / Q |
| **Shared keyboard, player 2** | Arrows | Enter / `/` | `.` / `'` | Right Shift / `,` |
| **Gamepads** (up to 4) | Stick / D-pad | A / RT | B / Y | X / RB + A |

`P`/`Esc`/Start pauses · `M` mutes sound · `N` toggles music · `V` turns the announcer on or off · `X` changes the pixel size (retro / chunky / off) · `Tab` shows a map of explored areas.

Up to **4 players** can play co-op on one screen. On your own, every key above (and the touch screen, if you have one) controls your hero. Gamepads join by pressing Attack, even in the middle of a level. For two players on one keyboard, press **2**: player 1 keeps WASD and player 2 gets the arrow keys.

## The quest

The demon lord Skorne has broken free of the seal that bound him, and the Rune Stones that held him are scattered across the realms. You play through the same structure as the arcade original:

- **Story:** an intro, read aloud by the announcer, explains the quest. Each realm gets its own introduction, and there is an ending once Skorne falls. The text is original, written for this remake.
- **The hub (as in Dark Legacy):** a walkable plaza with a portal to each realm. Step into a portal and pick a stage. Stages in a realm open one after another, ending with its **guardian** (the Dragon, the Chimera, the Plague Fiend). The **Underworld** portal stays sealed until all three guardians are defeated; Skorne waits at its end. You return to the hub after every level.
- **Rune Stones:** each guardian carries one, and every level hides another in a **secret room behind a cracked wall**. Smash the wall to get in. There are 16 in all.
- **Gold and the merchant:** treasure gives gold. Walk up to the merchant in the hub to buy food, magic potions, keys and permanent **Strength / Armor / Speed / Magic** upgrades. Each player shops with their own gold.
- **Treasure rooms:** beat a guardian and the party gets 25 seconds in a vault heaped with gold, gems and chests.
- **Secret heroes:** four more heroes join as the quest goes on: the **Minotaur** (defeat the Dragon), the **Falconess** (defeat the Chimera), the **Jackal** (defeat the Plague Fiend) and the **Tigress** (recover 12 Rune Stones).
- **Saved progress:** your heroes (level, stats, upgrades, gold) and quest progress are saved in the browser. Pick the same class next time to carry on, or press Magic on the title screen to start a new quest.


- **Eight heroes**, each with its own stats and turbo attack:
  - Warrior (long blond hair, bare-chested, red bracers, great axe): strong melee, whirlwind spin
  - Valkyrie (red hair, winged golden helm, blue armour, sword and shield): heavy armor, shield dash
  - Wizard (striped royal headdress, gold collar, long robe, staff): strong magic, fire nova
  - Archer (elf in green, bow and quiver): speed and rapid fire, arrow volley
  - Dwarf (horned helm, huge beard, hammer), Knight (full plate, great helm), Jester (motley and bells, throwing daggers) and Sorceress (purple robes, crystal staff), as in Dark Legacy
- **Health drains over time**, as in the arcade. Eat food to survive, and don't shoot it!
- **Melee and ranged combat.** Attacking next to an enemy swings your weapon; otherwise you throw your projectile.
- **Turbo meter.** Fills as you deal damage. Hold Turbo and press Attack to spend it on your class's special move.
- **Magic potions** hit everything on screen. Shooting a potion on the floor sets it off at half strength.
- **Generators** keep spawning grunts, ghosts, lobbers, demons and sorcerers until you destroy them. Each one has three tiers of damage.
- **Death** drains your health and can only be destroyed by magic.
- **Keys and doors.** Keys are placed so a level can never become unwinnable, whichever doors you open first. This is checked by the tests.
- **RPG progression.** Kills give experience; levelling up raises strength, shot damage, armor, speed and magic.
- **Amulets** give temporary powers: Speed Boots, Rapid Fire, Invulnerability, Three-Way Shot, **Reflect Shot** (shots bounce off walls), **Super Shot** (huge piercing shots), **Fire Breath** (every attack scorches what's in front of you), **Invisibility** (monsters lose track of you), **Levitation** (float over lava and open sky) and **X-Ray Glasses** (secret walls glow and show on the map), plus Dark Legacy's **Phoenix** familiar (circles you and spits fire at monsters), **Lightning Breath** (attacks arc to nearby foes), **Grow Potion** (giant-sized: hit harder, take less) and **Anti-Death Halo** (Death is destroyed by your touch). Treasure chests drop random loot. Beware **poisoned food**: it looks like a meal but hurts you (shoot it instead).
- **Four realms, each built differently**, like the original's level design:
  - **Mountain Kingdom:** winding canyon trails between jagged cliffs, crossed by lava rivers with wooden bridges
  - **Castle Stronghold:** grassy courtyards ringed by pillars, joined by wide stone halls
  - **Sky Dominion:** stone islands floating above drifting clouds, linked by narrow bridges
  - **Underworld:** scorched caverns riddled with lava

  Each realm has 3 procedurally generated levels with the original's stage names (Valley of Fire, Castle Courtyard, ...), then a **boss fight** against the Dragon, the Chimera, the Plague Fiend or Skorne. Bosses breathe fire in every direction, charge and summon minions; defeating one earns a Rune Stone.
- **Lava** burns heroes who wade through it (monsters won't go near it), **spike traps** stab anyone standing on them when they spring up, **gates** block the trail until you find a key, and **treasure vaults** behind locked gates hold chests, gems and potions.
- **Pixel-art rendering:** the 3D view is drawn at a low resolution and scaled up with hard pixel edges for a retro look (press `X` to change it).
- **Animated characters.** Heroes run, swing, throw, cast and play hit and death animations; attacks blend onto the upper body so you can fight while running. Skeletons claw their way out of the ground when a generator spawns them and collapse when slain.
- **Breakable barrels and treasure chests**, gates that sink into the floor when unlocked, and a swirling exit portal.
- **Music** composed on the fly for the title, each realm, boss fights, the shop, treasure rooms and the victory screen.
- **Difficulty that scales** with the level and the size of the party: monsters get tougher and generators busier further into the quest and with more players, while treasure is worth more in later realms.
- **Arcade announcer** via your browser's speech synthesis ("Warrior needs food, badly!"). Also: a shared camera that keeps the party together, a minimap of explored areas, a high score table, and drop-in "continue" after dying.

## Project layout

```
index.html        canvas + module entry
server.js         zero-dependency static server (npm start)
src/main.js       game loop and state machine (title, hero select, play, pause, level clear, game over)
src/game.js       simulation: players, enemies and their AI, generators, projectiles, pickups, traps
src/campaign.js   the quest: realm unlocking, Rune Stones, shop, saved heroes, story text
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
