# Security

How Gauntlet Legends Remake is protected, and what is left to you as the site owner.

## What the game is (and isn't)

The game is a **static website**: HTML, JavaScript, 3D models and sounds served by GitHub Pages. There is no server of ours, no database, no accounts and no passwords, and saves live only in each player's own browser. Online play is **peer-to-peer**: one player's browser hosts, the others connect straight to it, and a public PeerJS server is only used to help them find each other. That leaves a small attack surface, and the protections below cover it.

## Denial of service (DDoS)

- **The website.** GitHub Pages serves it through a global CDN (Fastly) built to absorb floods of traffic, so a static site can't be knocked over the way a single server can. Nothing in the game needs to be (or can be) configured for that. GitHub's limits are a soft 100 GB of bandwidth a month (the whole game is about 7 MB, and returning players mostly load from cache).
- **The online host.** A guest, or a stranger who got hold of a room code, could try to flood the host's browser. Every connection is rate-limited (120 messages a second from a guest, 40 from a host; floods get the sender disconnected), messages are size-checked before they're parsed (256 bytes for a guest's input, 400 KB for a host's update), a host looks at no more than 6 new connection attempts a second, every connection must finish opening within 5 seconds (a bad one is closed at once) and at most 6 may be opening at a time, with the oldest giving way (tested: with someone spamming half-open connections, a friend could still join and the host's memory stayed flat), at most 3 guests can join, and the host stops queueing updates for a guest that isn't reading them, so its memory can't be filled. In browser testing, a guest sending tens of thousands of messages was kicked within about 2 seconds while the host kept running normally.
- **If the site does go down** (an attack, or a GitHub outage), returning players can keep playing: after the first visit the service worker (`sw.js`) keeps the game's code, models, sounds and images on the device, so the game still loads and single-player works with no connection at all (tested by switching the server off and reloading). It also means repeat visits download almost nothing, which keeps the site's bandwidth low.
- **For even stronger protection,** host the same files on **Cloudflare Pages** instead of (or as well as) GitHub Pages: it's free, has no bandwidth cap, and puts Cloudflare's DDoS protection in front of the site, with no domain needed (you get a `*.pages.dev` address; connect the GitHub repository in the Cloudflare dashboard, no build command, output directory `/`). With your own domain, Cloudflare's free plan adds rate limiting and a web application firewall on top.
- **The matchmaking server** is PeerJS's free public one. If it's down or attacked, players can't *start* online games (games already running carry on, and single-player is unaffected). If you outgrow it, run your own (see the README).

## Online play

- **Room codes** are 8 letters from a 24-letter alphabet (about 110 billion codes), made with the browser's cryptographic random generator, so strangers can't guess or scan their way into a game.
- **The host is in charge of the room.** On the room bar (shown on menus and when paused) the host can **Kick** any online player, who then can't rejoin that room from the same browser; **Lock** the room so nobody new can join; or get a **New code**, which keeps everyone already playing but makes the old code useless (the answer to someone who has the code and is causing trouble, e.g. a code shown on a stream: tested, the old code stops reaching the host at all). The id that makes a kick stick is scrambled per room, so different hosts can't use it to recognise a player across rooms.
- **Guests can always leave.** Pausing shows a guest the Leave button even if the host doesn't pause, and a host that goes silent for 15 seconds disconnects them.
- **Guests can't touch the host's save.** Only the host's own controllers count on the title screen and the "new quest" prompt (which erases a save), and guests' heroes are never written to the host's save. Guests can pause and resume (at most once a second, so they can't spam it), but only the host can quit.
- **Guests can't cheat or crash the host.** The host's browser runs the game; guests only send button presses, which are clamped to valid values.
- **Hosts can't attack guests.** Everything a guest receives is validated before use (`cleanGame`, `cleanEvents` and `cleanUi` in `src/netstate.js`): only known hero, monster, item and projectile types, numbers clamped to sane ranges, strings and lists capped, colors format-checked, and object keys checked so tricks like `__proto__` do nothing. A host also can't overload a guest: sounds, announcer lines, effects and floating text are capped per message and throttled, new monsters/items/shots are limited per second (each one is a 3D model to build), level reloads to about one a second, and leftover corpses to 40. Screens that arrive without the data they need are ignored, a host that goes silent for 15 seconds disconnects the guest, and host text is only ever drawn on the game canvas, never inserted into the page as HTML. `test/net.test.js` throws malformed, malicious and flooding data at all of this.
- **Links can't redirect players.** The `?peer=` setting for testing against a local PeerJS server only works on a local copy of the game, so a link can't point players at someone else's matchmaking server.
- **Privacy:** as in most peer-to-peer games, players in a room can see each other's IP addresses. Share codes only with people you know.

## The web page

- A strict **Content Security Policy** (in `index.html`) lets the browser run only the game's own scripts, plus WebAssembly for the 3D model decoder and one inline import map pinned by its hash. No inline or injected scripts, no `eval`, no plugins, no forms, and network access only to the site itself and the PeerJS server (not even to services on the player's own computer; the local dev server adds that only for local testing). Even if a bug let someone inject code, the browser would refuse to run it. `test/security.test.js` checks the policy and fails if anything writes outside data into the page as HTML.
- **No referrer** is sent to other sites, and the game has **no third-party scripts, trackers or ads**: every library (three.js, PeerJS) is vendored in `vendor/`, not loaded from a CDN that could be compromised.
- The **service worker** (`sw.js`) only handles this site's own files and only GET requests.
- `npm audit` reports no known vulnerabilities in the development tools, and the game itself has no npm dependencies at runtime.

- **Known limits of GitHub Pages** (fixed by moving to your own domain or Cloudflare Pages): a page's policy can't stop other sites from embedding the game in a frame (that needs a server header; there's nothing to click-jack in the game, but a host like Cloudflare can add `frame-ancestors`), and all of an account's `*.github.io` project sites share one origin, so another of *your* project sites could read the game's saves. Only your own repositories can do that.

## The local dev server (`server.js`)

It only listens on your own computer unless you set `HOST`, serves only the game's files (not the source of tools, tests, `node_modules` or `.git`), blocks path tricks like `/../`, rejects malformed requests without crashing, and sends standard security headers.

## What you should do as the owner

These are account and hosting settings, so they can't be done from the code:

1. **Turn on two-factor authentication** on your GitHub account (Settings → Password and authentication). Whoever controls the account controls the site.
2. **Protect the published branch** (repository Settings → Branches → add a rule for the branch GitHub Pages serves): require pull requests and block force-pushes, so nobody can quietly replace the game.
3. **Turn on Dependabot alerts and secret scanning** (Settings → Code security). The repository holds no secrets today; this keeps it that way.
4. **When you get your own domain:** put it behind Cloudflare (the free plan includes DDoS protection, a web application firewall and rate limiting), keep HTTPS on (GitHub Pages: "Enforce HTTPS"), and if you run your own PeerJS server, put it behind Cloudflare too and add it to the Content Security Policy.
5. **Keep vendored libraries current** when updating the game (three.js, PeerJS).

## How this was checked

Besides the automated tests (`npm test`), the protections were exercised in real browsers: a guest flooding the host is kicked within seconds; a guest pressing Magic and Attack on the host's title screen can't wipe the save; a kicked player can't rejoin and a locked room turns newcomers away; the game loads and plays with the site switched off; the strict policy blocks nothing the game needs. The bundled libraries were verified byte-for-byte against the official three.js 0.170.0 and PeerJS 1.5.5 releases, whose package fingerprints match the npm registry. An independent review of the code found a further 7 issues (the save wipe above among them), all fixed; a second review of those fixes found the lockout fix incomplete and three new issues it had introduced (connections piling up in a full room, guest ids running out, cross-room tracking), all fixed and re-tested. Known remaining cost: a hostile host can still make a guest's game run slowly by making it build many models (bounded per second, so it can't hang it); leaving the room ends it.

## Reporting a problem

If you find a security issue, please open a private security advisory on the GitHub repository (Security → Report a vulnerability) rather than a public issue.
