# Deploying Moba2D

In production one Node process serves everything on a single port:

- the built client (`client/dist`) as static files, with SPA fallback to `index.html`
- Colyseus matchmaking (`POST /matchmake/...`) and the game WebSocket
- `GET /healthz` → `200 ok`

A friend only needs `https://<your-host>/?room=CODE`. The production client connects to
`wss://<same host>` automatically; set `VITE_SERVER_URL` at build time only if the game server
lives somewhere else.

## Environment

| Variable           | Meaning                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| `NODE_ENV`         | `production` makes the server listen on `PORT`                              |
| `PORT`             | Listening port in production (set by most hosts; the Docker image uses 8080) |
| `GAME_SERVER_PORT` | Overrides the port in any mode (dev default: 2567)                          |
| `CLIENT_DIST`      | Path to the built client (default: `client/dist` next to `server/`)         |
| `DB_PATH`          | SQLite file for users and match history (default: `server/data/moba.db`; Docker: `/data/moba.db`) |
| `CLIENT_IP_HEADER` | Header with the real client IP behind a proxy (`fly-client-ip` on Fly; unset = socket address) |
| `ADMIN_USER`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` | Admin panel login at `/admin`; without them the admin API answers 503 |

Rooms live in memory: run exactly **one** instance. A restart or redeploy ends running matches.

Users (username = user ID, IPs seen) and finished matches (usernames, heroes, kills, winner, end
reason, duration) are saved to SQLite via Node's built-in `node:sqlite`. Without a persistent disk
the file is lost on redeploy. If the file can't be opened, the server logs it and keeps running
without history and without username protection.

A username belongs to the browser that used it first: the client keeps a random key per username in
`localStorage`, the server stores its SHA-256 and rejects joins with the wrong key ("Username is
taken"). Default names `user_1`, `user_2`, … come from `POST /api/identity/default`.

## Admin panel

`/admin` (Users, Matches). Locally the server reads `server/.env` (gitignored). Generate a login:

```powershell
npm run admin:password -w server
```

It prints `ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET` (and a generated password if you pass
none). Put them in `server/.env` next to `ADMIN_USER=...`, and on Fly:
`fly secrets set ADMIN_USER=... ADMIN_PASSWORD_HASH=... ADMIN_SESSION_SECRET=...`.
Sessions are an HttpOnly cookie valid for 12 hours; 5 wrong logins per IP lock login for 15 minutes.

## Local production run

```powershell
npm run build
$env:NODE_ENV = "production"; $env:PORT = "8080"; npm start -w server
```

Open http://localhost:8080 and check http://localhost:8080/healthz.

## Docker

```powershell
docker build -t moba2d .
docker run --rm -p 8080:8080 -v moba2d-data:/data moba2d
```

The container starts as root only to `chown /data`, then runs the server as the `node` user.

The image bundles the server with esbuild and ships only the Colyseus runtime dependencies.

## Fly.io (EU, cheapest path)

You need your own Fly.io account (sign-up and a payment card are required by Fly; we can't create it for you).

1. Install `flyctl` and log in: `fly auth login`
2. Pick a unique app name and put it into `fly.toml` (`app = "..."`). Region `fra` (Frankfurt) is
   preset; `ams`, `waw`, `arn` are other EU options.
3. First deploy: `fly launch --copy-config --no-deploy`, then create the history volume in the
   same region as `primary_region` (`fly volumes create moba_data --size 1 --region <region>`),
   then `fly deploy`
4. Keep a single machine: `fly scale count 1`
5. Share `https://<app>.fly.dev/?room=CODE`

Fly terminates TLS, so WebSockets arrive as `wss://` with no extra setup. The machine stops when
idle and starts on the next visit (first load takes a few seconds). Set
`min_machines_running = 1` in `fly.toml` if you'd rather keep it always on.

## Generic VPS + Caddy (Hetzner, Scaleway, OVH, …)

You need your own VPS account and a domain (or subdomain) with an `A` record pointing at the server.

1. Install Docker on the VPS, copy the repo, then:

   ```sh
   docker build -t moba2d .
   docker run -d --name moba2d --restart unless-stopped -p 127.0.0.1:8080:8080 -v moba2d-data:/data moba2d
   ```

2. Install Caddy and use this `/etc/caddy/Caddyfile`:

   ```
   game.example.com {
       reverse_proxy 127.0.0.1:8080
   }
   ```

3. `sudo systemctl reload caddy`. Caddy obtains a Let's Encrypt certificate automatically and
   proxies WebSocket upgrades out of the box.
4. Share `https://game.example.com/?room=CODE`
