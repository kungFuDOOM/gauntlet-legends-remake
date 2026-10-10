# Security

How Gauntlet Legends Remake is protected, and what is left to you as the site owner.

## What the game is (and isn't)

The game is a **static website**: HTML, JavaScript, 3D models and sounds served by GitHub Pages. There is no server of ours, no database, no accounts and no passwords, and saves live only in each player's own browser. Online play is **peer-to-peer**: one player's browser hosts, the others connect straight to it, and a public PeerJS server is only used to help them find each other. That leaves a small attack surface, and the protections below cover it.

## Denial of service (DDoS)

- **The website.** GitHub Pages serves it through a global CDN (Fastly) built to absorb floods of traffic, so a static site can't be knocked over the way a single server can. Nothing in the game needs to be (or can be) configured for that. GitHub's limits are a soft 100 GB of bandwidth a month (the whole game is about 7 MB, and returning players mostly load from cache).
- **The online host.** A guest, or a stranger who got hold of a room code, could try to flood the host's browser. Every connection is rate-limited (120 messages a second; floods get the sender disconnected), messages are size-checked before they're parsed (256 bytes for a guest's input, 400 KB for a host's update), repeated connection attempts are ignored past 10 in 10 seconds, at most 3 guests can join, and the host stops queueing updates for a guest that isn't reading them, so its memory can't be filled. In browser testing, a guest sending tens of thousands of messages was kicked within about 2 seconds while the host kept running normally.
- **If the site does go down** (an attack, or a GitHub outage), returning players can keep playing: after the first visit the service worker (`sw.js`) keeps the game's code, models, sounds and images on the device, so the game still loads and single-player works with no connection at all (tested by switching the server off and reloading). It also means repeat visits download almost nothing, which keeps the site's bandwidth low.
- **For even stronger protection,** host the same files on **Cloudflare Pages** instead of (or as well as) GitHub Pages: it's free, has no bandwidth cap, and puts Cloudflare's DDoS protection in front of the site, with no domain needed (you get a `*.pages.dev` address; connect the GitHub repository in the Cloudflare dashboard, no build command, output directory `/`). With your own domain, Cloudflare's free plan adds rate limiting and a web application firewall on top.
- **The matchmaking server** is PeerJS's free public one. If it's down or attacked, players can't *start* online games (games already running carry on, and single-player is unaffected). If you outgrow it, run your own (see the README).

## Online play

- **Room codes** are 6 letters from a 24-letter alphabet (about 190 million codes), made with the browser's cryptographic random generator, so strangers can't guess or scan their way into a game.
- **Guests can't cheat or crash the host.** The host's browser runs the game. Guests only send button presses, which are clamped to valid values; they can pause, but only the host's own players can quit.
- **Hosts can't attack guests.** Everything a guest receives is validated before use (`cleanGame`, `cleanEvents` and `cleanUi` in `src/netstate.js`): only known hero, monster, item and projectile types, numbers clamped to sane ranges, strings and lists capped, colors format-checked, and object keys checked so tricks like `__proto__` do nothing. Host text is only ever drawn on the game canvas, never inserted into the page as HTML. If a host sends something unreadable, the guest disconnects cleanly. `test/net.test.js` throws malformed and malicious data at all of this.
- **Links can't redirect players.** The `?peer=` setting for testing against a local PeerJS server only works on a local copy of the game, so a link can't point players at someone else's matchmaking server.
- **Privacy:** as in most peer-to-peer games, players in a room can see each other's IP addresses. Share codes only with people you know.

## The web page

- A strict **Content Security Policy** (in `index.html`) lets the browser run only the game's own scripts, plus WebAssembly for the 3D model decoder and one inline import map pinned by its hash. No inline or injected scripts, no `eval`, no plugins, no forms, and network access only to the site itself and the PeerJS server. Even if a bug let someone inject code, the browser would refuse to run it. `test/security.test.js` checks the policy and fails if anything writes outside data into the page as HTML.
- **No referrer** is sent to other sites, and the game has **no third-party scripts, trackers or ads**: every library (three.js, PeerJS) is vendored in `vendor/`, not loaded from a CDN that could be compromised.
- The **service worker** (`sw.js`) only handles this site's own files and only GET requests.
- `npm audit` reports no known vulnerabilities in the development tools, and the game itself has no npm dependencies at runtime.

## The local dev server (`server.js`)

It only listens on your own computer unless you set `HOST`, serves only the game's files (not the source of tools, tests, `node_modules` or `.git`), blocks path tricks like `/../`, rejects malformed requests without crashing, and sends standard security headers.

## What you should do as the owner

These are account and hosting settings, so they can't be done from the code:

1. **Turn on two-factor authentication** on your GitHub account (Settings → Password and authentication). Whoever controls the account controls the site.
2. **Protect the published branch** (repository Settings → Branches → add a rule for the branch GitHub Pages serves): require pull requests and block force-pushes, so nobody can quietly replace the game.
3. **Turn on Dependabot alerts and secret scanning** (Settings → Code security). The repository holds no secrets today; this keeps it that way.
4. **When you get your own domain:** put it behind Cloudflare (the free plan includes DDoS protection, a web application firewall and rate limiting), keep HTTPS on (GitHub Pages: "Enforce HTTPS"), and if you run your own PeerJS server, put it behind Cloudflare too and add it to the Content Security Policy.
5. **Keep vendored libraries current** when updating the game (three.js, PeerJS).

## Reporting a problem

If you find a security issue, please open a private security advisory on the GitHub repository (Security → Report a vulnerability) rather than a public issue.
