# SUNSET SHORES — Palmera Bay

An open-world crime game in the spirit of GTA 6, built for the make.fun
gta6-01 bounty. It plays offline in a desktop browser from the static files
under `game/` — no network request, no build step. Three.js is vendored at
`game/vendor/three.module.min.js`.

## The game

You are **Rico Vale**, new in Palmera Bay with empty pockets. **Mara Sol**
runs the streets from the hideout on Coral Court, and she has jobs for you:

1. **Wheels** — steal a car and bring it to the hideout.
2. **Sunset Courier** — three drops across the city against the clock.
3. **Heat** — get the cops on you, then lose them.
4. **Rooftop Rumble** — clear the Vipers out of Coral Court.
5. **The Big Score** — lift the cash from the Bay Bank and escape a
   three-star police chase to the hideout.

## Systems

- **A city on foot and by car** — a deterministic grid city of pastel towers,
  palm-lined avenues, a boardwalk, sand and ocean, built procedurally from a
  fixed seed so every load shows the same Palmera Bay.
- **Traffic and pedestrians** — cars follow the road grid, turn at
  intersections and slow for the car ahead; pedestrians walk the sidewalks
  and flee from danger.
- **Stealing cars** — walk up to any parked or traffic car and press `E`.
  Taking a traffic car raises your wanted level.
- **Wanted system and police** — 5 stars. Crimes (theft, hitting
  pedestrians, shooting) raise the heat; police units spawn, chase and ram
  you. Stay clean and out of sight and the stars fade. Get caught on foot
  and you are BUSTED.
- **Combat** — pistol (press `1`, click to shoot, hitscan with tracers) and
  fists (`F`), against rival gang members who shoot back.
- **HUD with minimap** — health, cash, wanted stars, speed, car health,
  mission objective, waypoint beacon and a live top-down minimap with
  traffic, police and waypoint blips.
- **Start and save** — title screen with the story, pause menu, and saves to
  localStorage (cash, mission progress, position) with a Continue option.
- **Sound** — everything synthesised in WebAudio: engine hum, two-tone
  police siren, gunshots, impacts, chimes and a sunset synthwave loop.
  `M` mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| Mouse drag / wheel | Orbit camera / zoom |
| E | Get in / out of a car |
| T | Start the next mission |
| 1 | Draw / holster pistol |
| Click | Shoot (when armed) |
| F | Punch |
| Shift | Sprint |
| Space | Jump |
| M | Mute sound |
| Esc / P | Pause |

## Play it

```sh
node serve.ts            # serves game/ at http://127.0.0.1:8901/
```

Open the URL in desktop Chrome and click **START THE STORY**.

## Screenshots

`?shot=cover|drive|chase|mission` starts the game straight into a staged
scene (used to take the four screenshots in `screenshots/`).

## Layout

- `game/index.html` — page, HUD DOM, import map for three.js
- `game/css/style.css` — HUD and menu styling
- `game/js/config.js` — world constants, seeded RNG, collision helpers
- `game/js/city.js` — procedural city: roads, towers, palms, beach, ocean
- `game/js/audio.js` — synthesised sound and music
- `game/js/vehicles.js` — car meshes, traffic AI, police pursuit
- `game/js/people.js` — player character, pedestrians, rivals
- `game/js/missions.js` — the five story missions
- `game/js/hud.js` — HUD and minimap
- `game/js/game.js` — boot, loop, player, driving, wanted, combat, save
- `main.ts` — the entry program: copies `game/` + `screenshots/` to
  `/output` and writes `/output/dossier.json`
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged

## License

MIT — see `LICENSE`. All city, characters, vehicles, names, story, art,
sound and music are original, created for this entry.
