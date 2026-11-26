# Worklog

Newest first. One entry per finished task: `- YYYY-MM-DD — what changed (key files) [committed | uncommitted]`.

- 2026-11-26 — Username is the user ID, claimed per browser by a localStorage key; server-issued `user_{n}` defaults; users + IPs in SQLite; admin panel `/admin` (Users, Matches with search/paging) behind scrypt login + signed cookie; credentials in gitignored `server/.env` and `admin-credentials.local.txt` (db/*, http/*, admin/AdminAuth.ts, DuelRoom.ts `onAuth`, UsernameField.ts, client/admin.html, client/src/admin/*, vite.config.ts, staticFiles.ts, fly.toml, DEPLOY.md) [uncommitted]
- 2026-11-26 — Optional username in lobby (default `user_{n}`, saved in localStorage), shown above both health bars; finished matches saved to SQLite (usernames, heroes, kills, winner, reason, duration); Fly volume `/data` (username.ts, protocol.ts, UsernameField.ts, Lobby.ts, MeshHeroRenderer.ts, textures.ts, DuelRoom.ts, history/MatchHistory.ts, index.ts, Dockerfile, fly.toml, DEPLOY.md) [uncommitted]
- 2026-11-26 — Added CLAUDE.md (file map, where-to-change guide) and this worklog (CLAUDE.md, WORKLOG.md) [uncommitted]
- 2026-11-26 — "Back to menu" on the end screen; leaving after match end is not a forfeit; rematch hidden when opponent leaves (MatchHud.ts, match.css, Connection.ts `leave()`, Game.ts) [uncommitted]
- 2026-11-26 — 60 s hero-pick timeout kicks idle pickers, close code 4010 + Rejoin; clearer waiting texts; list "Join" no longer recreates a closed room (DuelRoom.ts, constants.ts, Connection.ts, Lobby.ts) [uncommitted]
- 2026-11-26 — Lobby room list with player counts via `/api/rooms`; empty rooms auto-close; full room → spectator (zoomed-out camera, sees bushes, SpectatorHud) (roomList.ts, index.ts, RoomList.ts, SpectatorCamera.ts, SpectatorHud.ts, DuelRoom.ts, Game.ts) [uncommitted]
- 2026-11-26 — Original 10-item backlog done: combat core, skill system, skills for all heroes, match flow (5 kills / 10 min / forfeit, rematch), reconnect, deploy (Dockerfile, fly.toml, DEPLOY.md), bushes + LOS + minimap, game feel (effects, Sfx, floating numbers), 10 heroes, tests + CI [committed: f71189f..c2be177]
- 2026-11-26 — Renderer moved from PixiJS to Three.js with tilted camera; GPU optimizations (DynamicResolution.ts, gpu.ts) [committed]
