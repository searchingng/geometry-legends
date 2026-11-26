# moba2d

Browser 1v1 MOBA. Authoritative Colyseus server, Three.js client with a fixed tilted camera, game logic is pure 2D in `shared/`. 10 geometric heroes, 3 skills each (Q/E/R), fog of war, bushes, spectators.

User writes in Uzbek: answer in Uzbek. Discuss the approach first, code after an explicit go-ahead. Do not test in the browser unless asked; run `npm run typecheck` and `npm test` instead. Do not commit unless asked.

## Commands

- `npm run dev` — server :2567 + Vite client :5173 (launch config `moba2d`)
- `npm run typecheck` — all workspaces + tests
- `npm test` — vitest (tests in `shared/test`, `server/test`, `client/test`)
- `npm run build` — client bundle; deploy notes in `DEPLOY.md` (Docker, `fly.toml`, single instance only)

## Layout

npm workspaces: `shared` (`@moba/shared`, imported by both sides), `server`, `client`. Imports use `.js` suffix (ESM).

### shared/src — rules and data, no rendering
| File | Holds |
|---|---|
| `constants.ts` | tick rate (30), match rules (kills to win, duration, respawn, reconnect window, pick timeout), room limits |
| `heroes.ts` | `HEROES` table: stats, 3 skill ids, `visual` {shape, color} |
| `skills.ts` | `SKILLS` table (data-driven skill definitions) |
| `skillTypes.ts` | skill schema: aim, delivery (instant/dash/projectile…), zones, shapes, effects |
| `skillGeometry.ts` / `skillMotion.ts` / `skillAim.ts` | hit tests, dash/knockback motion, aim clamping |
| `protocol.ts` | `Message` names, client→server message guards, `SnapshotMessage`, events, `RoomSummary`, `JoinOptions` |
| `movement.ts` | `stepMovement` (used by server and client prediction) |
| `map.ts` | `ARENA`: size, obstacles, bushes |
| `vision.ts` | line of sight, bush hiding, visibility rays |
| `targeting.ts` / `combat.ts` | basic attack target choice and range |
| `roomCode.ts` | room code alphabet/validation |

### server/src
| File | Holds |
|---|---|
| `index.ts` | HTTP server: `/healthz`, `/api/rooms`, static client, Colyseus `duel` room |
| `DuelRoom.ts` | the room: join/leave/reconnect, seats vs spectators, hero pick + timeout, input queue, tick `update()`, attacks, kill/respawn, per-viewer snapshots (`snapshotFor`, `spectatorSnapshot`) |
| `match/MatchController.ts` | phases: waiting → countdown → playing → ended, score, rematch |
| `skills/SkillSystem.ts` | casting, projectiles, zones, damage (`dealDamage`) |
| `skills/CombatStatus.ts` | stun, slow, shield, spawn protection, forced motion |
| `VisionSystem.ts` | who sees whom each tick (fog of war) |
| `roomList.ts` / `roomCode.ts` | lobby room list API, room code allocation |

### client/src
| Area | Files |
|---|---|
| entry | `main.ts` (lobby → connection → game), `index.html`, `style.css` |
| network | `net/Connection.ts` (join/create/reconnect/leave, rooms API URL) |
| game loop | `game/Game.ts` (snapshot handling, frame loop, HUD sync, spectator mode), `FrameContext.ts`, `SnapshotBuffer.ts` (interpolation), `LocalPredictor.ts` (own-hero prediction), `SkillCasting.ts`, `AttackTargeting.ts`, `SpectatorCamera.ts` |
| input | `input/keyboard.ts`, `input/Pointer.ts` |
| render (Three.js) | `SceneRenderer.ts` (camera, scene), `ArenaView.ts`, `BushView.ts`, `VisionFog.ts`, `MeshHeroRenderer.ts` + `HeroShapes.ts` (implements `HeroRenderer`), `Skill*Effects.ts`, `SkillIndicators.ts`, `IndicatorGeometry.ts`, `AttackEffects.ts`, `StatusIndicators.ts`, `TargetingView.ts`, `DynamicResolution.ts`, `gpu.ts` |
| UI (DOM) | `Lobby.ts`, `RoomList.ts`, `HeroPicker.ts`, `Hud.ts`, `SkillBar.ts`, `MatchHud.ts` (end screen, rematch, back to menu), `SpectatorHud.ts`, `Minimap.ts`, `CombatFeedback.ts`, `FloatingNumbers.ts`, `ReconnectOverlay.ts`; CSS next to them |
| audio | `audio/Sfx.ts` (generated sounds) |

## Where to change what

- New hero: entry in `shared/src/heroes.ts` + its 3 skills in `shared/src/skills.ts`; new shape → `HeroShape` and `client/src/render/HeroShapes.ts`. `shared/test/heroRoster.test.ts` checks the roster.
- New skill mechanic: schema in `skillTypes.ts`, server logic in `SkillSystem.ts`/`CombatStatus.ts`, visuals in `client/src/render/Skill*Effects.ts`, indicator in `SkillIndicators.ts`.
- New network message: name in `protocol.ts` `Message` + guard, handler in `DuelRoom.onCreate`, sender in `Connection.ts`.
- Snapshot field: `SnapshotMessage` in `protocol.ts`, filled in `DuelRoom.baseSnapshot`/`visiblePlayer`, read in `Game.onSnapshot`.
- Match rules/numbers: `shared/src/constants.ts`, phase logic in `MatchController.ts`.
- Map/bushes: `shared/src/map.ts`; visuals `ArenaView.ts`, `BushView.ts`, `Minimap.ts`.
- Lag/smoothness: `SnapshotBuffer.ts`, `LocalPredictor.ts`, `INTERPOLATION_DELAY_MS`; GPU load: `DynamicResolution.ts`.

## Rules of the design

- Server is authoritative; the client only predicts its own movement and skill start.
- `shared/` and `server/` stay free of visual code. Heroes are data; renderers implement `HeroRenderer`.
- Snapshots are per viewer: enemies outside vision or in a bush are not sent. Spectators get everything.
- Main goal is "no lag" on weak GPUs (integrated Intel); keep per-frame allocations low.

## Worklog (every session must follow)

Finished work is recorded in `WORKLOG.md`, not here. When a task is done, add one line at the top of its list: date, what changed, key files, committed or not. Keep it to one line and do not rewrite older entries. Read `WORKLOG.md` only when the task needs history (what was done, why something exists). If a task adds or moves files, also update the Layout tables above.

## Next tasks

No new backlog agreed yet. Ask the user and record agreed tasks here as a numbered list with the files they touch.
