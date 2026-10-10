// Every line the announcer can say, for tools/build-voice.py to record ahead of time.
// The text must match what the game passes to say() exactly; anything without a recording
// falls back to the browser's own speech voice.
//   node tools/voice-lines.mjs > /tmp/lines.json

import { CLASSES } from '../src/config.js';
import { BOSSES } from '../src/level.js';
import { STORY, SECRET_HEROES } from '../src/campaign.js';

const lines = new Map(); // text -> what to actually speak (when it reads better spelled out)
const add = (text, speak = text) => lines.set(text, speak);

for (const cls of Object.keys(CLASSES)) {
  const name = CLASSES[cls].name;
  add(cls[0].toUpperCase() + cls.slice(1)); // picked on the hero select screen
  add(`Welcome, ${name}`);
  add(`${name} needs food, badly!`);
  add(`${name} is about to die!`);
  add(`${name} has died`);
  add(`${name} shot the food!`);
  add(`${name} ate poisoned food!`);
  add(`${name} has found a Rune Stone!`);
}
for (const s of SECRET_HEROES) add(`A secret hero joins the legend: the ${s.cls}!`);
for (const b of BOSSES) {
  add(`Beware! ${b.name}`);
  add(`${b.name} has been defeated!`);
}
add('Treasure room! Collect the gold!');
add('You found a secret area');
add('Death!');
// Training Grounds lesson titles (src/tutorial.js)
for (const t of ['move', 'attack', 'generators', 'magic', 'turbo', 'food']) add(t, t[0].toUpperCase() + t.slice(1) + '!');
add('keys & doors', 'Keys and doors!');
add('Well done!');
for (const l of [...STORY.intro, ...STORY.realms.flat(), ...STORY.ending]) add(l);

process.stdout.write(JSON.stringify([...lines].map(([text, speak]) => ({ text, speak })), null, 1));
