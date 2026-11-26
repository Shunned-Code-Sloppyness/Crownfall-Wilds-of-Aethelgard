Crownfall: Wilds of Aethelgard
A mobile-first, desktop-ready top-down medieval fantasy action-sandbox RPG inspired by Albion Online — built entirely in procedural code with zero external image or model assets. Every tree, rock, blade of grass, character, and particle is drawn at runtime with the Canvas 2D API.

Play
npm start            # serves on http://localhost:5173
Or open index.html through any static server. ES modules require http://, so opening the file directly from disk will not work.

Append ?seed=<name> to the URL to replay a specific world:

http://localhost:5173/?seed=ember-thorn-412
Controls
Action	Desktop	Touch
Move	WASD / arrow keys	Left joystick
Strike	Click / Space	⚔ button
Dodge	Shift	✦ button
Pause	Esc	—
Aim follows the mouse cursor on desktop, and your movement direction on touch.

What's implemented
Procedural world — infinite seeded terrain from layered value noise across eleven biomes (deep water → shallows → sand → grass → meadow → forest → marsh → dirt → stone → snow), with shoreline foam, per-tile colour jitter, and baked chunk ground textures.
Chunked streaming — terrain, prop, and baked-canvas caches are separate and LRU-bounded. Movement reads tiles from generated arrays, so no noise is evaluated at runtime.
Props — pines, oaks, bushes, boulders, dead trees, reeds, driftwood, logs and flowers, each drawn procedurally with wind sway. Collision uses the trunk radius, not the canopy, so forests stay traversable.
Day/night cycle — a five-phase sky gradient over a seven-minute day, with a darkness overlay and a warm light radius around the player at night.
Combat — directional cone attacks with critical hits, knockback and hit-stagger, stamina-gated dodge rolls with i-frames, and screen shake.
Enemy archetypes — wolves (fast packs), bandits (armed bruisers), shades (ranged casters with projectiles), and elite Wardens. Each has aggro, leash, wander, and chase/return state machines plus group separation.
Progression — XP from kills, escalating level curve raising max HP and damage, gold and herb drops, essence from elites, and lootable chests and herb nodes.
HUD — health/stamina bars, resource chips, live minimap with enemy blips and a facing arrow, day counter and clock.
Audio — all sound effects synthesised with the Web Audio API (no audio files).
Layout
index.html            Shell, HUD markup, touch controls
styles.css            Responsive HUD + on-screen controls
src/
  main.js             Game orchestration, update loop, rendering, combat resolution
  core/
    math.js           Clamp/lerp/damp, angles, cone and circle tests
    rng.js            Seeded PRNG (mulberry32), hashing, seed naming
    noise.js          Value noise + fBm
    input.js          Keyboard, mouse, touch joystick and action buttons
    camera.js         Follow camera with lookahead, zoom and shake
    renderer.js       Canvas sizing, draw list, chunked ground painting
    hud.js            DOM HUD updates and minimap rendering
    sfx.js            Web Audio synthesis
  world/
    world.js          Terrain fields, chunk caches, prop generation, queries
    daynight.js       Sky phases, darkness, player light
  entities/
    player.js         Movement, dodge, attack timing, damage
    enemy.js          Enemy archetypes, AI states, projectiles, spawn director
  art/
    palette.js        Shared colours and drawing primitives
    props.js          Terrain prop and item rendering
    characters.js     Player knight and enemy rendering
    fx.js             Particles, floating numbers, slash arcs
tools/                Node test harnesses and static server
Tests
The simulation runs headlessly in Node — the world, combat, and AI have no DOM dependency, and the renderer is exercised through a stubbed 2D context.

npm test              # smoke + combat + day/night + boot + wiring (64 checks)
npm run test:all      # the above plus real-browser rendering checks
npm run test:browser  # drives headless Chromium over CDP (see note below)
npm run test:smoke    # world generation, caches, determinism, 60s simulation
npm run test:combat   # attack arcs, damage, dodge i-frames, collision, spawning
npm run test:daynight # sky/darkness curves across a full cycle
npm run test:wiring   # real Game class: kills, loot, levelling, respawn
npm run test:boot     # boots the real Game class and renders ~1000 frames
npm run bot           # AI-driven 4-minute play session (kills, levels, looting)
npm run pacing        # enemy spawn pacing probe
The browser suite renders in an actual Chromium and inspects canvas pixels — it catches art bugs that a stubbed context cannot (e.g. a colour function that emits an invalid fillStyle, leaving trees as black silhouettes). It needs a Chromium binary; set CHROME at the top of tools/browser.mjs if it lives elsewhere.

Design notes
Determinism — the same seed always yields the same world. Terrain is pure noise; props use a per-chunk seeded PRNG.
Collision radius ≠ visual radius — trees collide on their trunk. Using the canopy as the hitbox made 74% of the map impassable; with trunk collision it is 20–40%.
Bake budget — only one new ground chunk is baked per frame. Filling in the rest with the chunk's average colour avoids a hitch when crossing chunk boundaries.
Smooth ground, not a tile grid — the ground is sampled into a half-resolution colour map, upscaled with smoothing, then given grain. Painting tile-by-tile caused a hard 32px checkerboard.
shade() must accept its own output — the art layer chains shades, so the colour helper parses both hex and rgb(). It previously only parsed hex, producing rgb(NaN,NaN,NaN) and silently-black foliage.
No external assets — the only binary in the repo is the GPL licence.
License
GPL-3.0. See LICENSE.