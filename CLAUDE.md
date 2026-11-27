# moba2d

Browser 1v1 MOBA. Authoritative Colyseus server, Three.js client with a fixed tilted camera, game logic is pure 2D in `shared/`. One lane with a base + turret per side and creep waves; win by 3 kills or destroying the enemy base. 10 geometric heroes, 3 skills each (Z/X/C: hold to aim + left click to cast, hold right click aims skill 1, release casts; Space / left click attack), fog of war, bushes, spectators.

User writes in Uzbek: answer in Uzbek. Discuss the approach first, code after an explicit go-ahead. Do not commit unless asked.

## Testing rule (strict)

- Never test UI or anything in a browser (browser pane, Chrome, Playwright, screenshots, bot clients, starting the dev server to check) unless the user explicitly says to in that message. Reason: it costs too many tokens.
- After a change, run only `npm run typecheck` and `npm test`.
- When finishing, list what needs manual checking (UI, visuals, gameplay feel, multiplayer flow) and ask the user to test it themselves.

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
| `lane.ts` | `Team`, unit kinds + `UNIT_STATS` (base, turret, creeps), `STRUCTURES` positions, creep wave timing/pack, lane helpers |
| `vision.ts` | line of sight, bush hiding, visibility rays |
| `targeting.ts` / `combat.ts` | basic attack target choice and range |
| `roomCode.ts` | room code alphabet/validation |
| `heroInfo.ts` | `heroStatLines`, `describeSkill`: hero/skill data → display text for the hero info panel |
| `username.ts` | `normalizeUsername`, user key format, identity API types, name error messages |
| `admin.ts` | admin API path and response types (`AdminUser`, `AdminMatch`, `AdminPage`) |

### server/src
| File | Holds |
|---|---|
| `index.ts` | HTTP server: `/healthz`, `/api/rooms`, `/api/identity`, `/api/admin`, static client (`/admin` → `admin.html`), Colyseus `duel` room; loads `server/.env` if present |
| `DuelRoom.ts` | the room: join/leave/reconnect, seats vs spectators, hero pick + timeout, input queue, tick `update()`, attacks, kill/respawn, per-viewer snapshots (`snapshotFor`, `spectatorSnapshot`) |
| `match/MatchController.ts` | phases: waiting → countdown → playing → ended, score, rematch |
| `skills/SkillSystem.ts` | casting, projectiles, zones, damage (`dealDamage`) |
| `skills/CombatStatus.ts` | stun, slow, shield, spawn protection, forced motion |
| `VisionSystem.ts` | who sees whom each tick (fog of war) |
| `units/UnitSystem.ts` | base, turret, creep waves: spawn, lane march, target choice, attacks, call-for-help aggro, team vision, base-destroyed callback |
| `roomList.ts` / `roomCode.ts` | lobby room list API, room code allocation |
| `db/database.ts` | SQLite (`node:sqlite`) schema: `users` (username = ID, key hash), `user_ips`, `counters`, `matches`, `match_players` |
| `db/UserStore.ts` / `db/MatchHistory.ts` / `db/AdminQueries.ts` | name claim + IP log, match writes, admin lists (search, paging) |
| `db/services.ts` | opened stores for the process (`services()`), `recordMatch` |
| `http/` | `json.ts` (body, client IP via `CLIENT_IP_HEADER`), `RateLimiter.ts`, `identityApi.ts` (default `user_{n}`), `adminApi.ts` |
| `admin/AdminAuth.ts` | scrypt password check, signed session cookie; `hashPasswordCli.ts` = `npm run admin:password -w server` |

### client/src
| Area | Files |
|---|---|
| entry | `main.ts` (lobby → connection → game), `index.html`, `style.css`; `vite.config.ts` (two pages, `/api/admin` dev proxy) |
| admin page | `admin.html`, `admin/main.ts` (login, tabs, search, paging), `admin/api.ts`, `admin/tables.ts`, `admin/admin.css` |
| network | `net/Connection.ts` (join/create/reconnect/leave, rooms API URL) |
| game loop | `game/Game.ts` (snapshot handling, frame loop, HUD sync, spectator mode), `FrameContext.ts`, `SnapshotBuffer.ts` (interpolation), `LocalPredictor.ts` (own-hero prediction), `SkillCasting.ts`, `AttackTargeting.ts`, `SpectatorCamera.ts` |
| input | `input/keyboard.ts`, `input/Pointer.ts` |
| render (Three.js) | `SceneRenderer.ts` (camera, scene), `ArenaView.ts`, `BushView.ts`, `VisionFog.ts`, `MeshHeroRenderer.ts` + `HeroShapes.ts` (implements `HeroRenderer`), `UnitViews.ts` (base/turret/creep meshes + HP bars), `Skill*Effects.ts`, `SkillIndicators.ts`, `IndicatorGeometry.ts`, `AttackEffects.ts`, `StatusIndicators.ts`, `TargetingView.ts`, `DynamicResolution.ts`, `gpu.ts` |
| UI (DOM) | `Lobby.ts`, `UsernameField.ts` (username input, per-name keys in localStorage), `RoomList.ts`, `HeroPicker.ts`, `HeroIcon.ts` (SVG shape icons), `HeroInfoPanel.ts` + `HeroInfoButton.ts` (I key / HUD button), `Hud.ts`, `SkillBar.ts`, `MatchHud.ts` (end screen, rematch, back to menu), `QuitButton.ts` (in-game quit), `GameInfo.ts` (hold Tab: score + K/D/A), `SpectatorHud.ts`, `Minimap.ts`, `CombatFeedback.ts`, `FloatingNumbers.ts`, `ReconnectOverlay.ts`; CSS next to them |
| audio | `audio/Sfx.ts` (generated sounds) |

## Where to change what

- New hero: entry in `shared/src/heroes.ts` + its 3 skills in `shared/src/skills.ts`; new shape → `HeroShape` and `client/src/render/HeroShapes.ts`. `shared/test/heroRoster.test.ts` checks the roster.
- New skill mechanic: schema in `skillTypes.ts`, server logic in `SkillSystem.ts`/`CombatStatus.ts`, visuals in `client/src/render/Skill*Effects.ts`, indicator in `SkillIndicators.ts`.
- New network message: name in `protocol.ts` `Message` + guard, handler in `DuelRoom.onCreate`, sender in `Connection.ts`.
- Snapshot field: `SnapshotMessage` in `protocol.ts`, filled in `DuelRoom.baseSnapshot`/`visiblePlayer`, read in `Game.onSnapshot`.
- Match rules/numbers: `shared/src/constants.ts`, phase logic in `MatchController.ts`.
- Map/bushes: `shared/src/map.ts`; visuals `ArenaView.ts`, `BushView.ts`, `Minimap.ts`.
- Base/turret/creeps: numbers and positions in `shared/src/lane.ts`, behaviour in `server/src/units/UnitSystem.ts`, wiring (attacks, vision, snapshot `units`) in `DuelRoom.ts`, visuals `UnitViews.ts`.
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
