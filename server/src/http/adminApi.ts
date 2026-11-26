import type { IncomingMessage, ServerResponse } from "node:http";
import { ADMIN_API_PATH, ADMIN_PAGE_SIZE } from "@moba/shared";
import {
  SESSION_TTL_MS,
  adminConfigFromEnv,
  createSessionToken,
  isValidSessionToken,
  verifyCredentials,
  type AdminConfig,
} from "../admin/AdminAuth.js";
import type { PageQuery } from "../db/AdminQueries.js";
import { services } from "../db/services.js";
import { RateLimiter } from "./RateLimiter.js";
import { HttpError, pathOf, queryOf, readJson, requestIp, sendJson } from "./json.js";

const COOKIE_NAME = "moba_admin";
const MAX_SEARCH_LENGTH = 32;
const MAX_PAGE = 100_000;
const failedLogins = new RateLimiter(5, 15 * 60 * 1000);

export function isAdminRequest(req: IncomingMessage): boolean {
  const path = pathOf(req);
  return path === ADMIN_API_PATH || path.startsWith(`${ADMIN_API_PATH}/`);
}

export async function handleAdmin(req: IncomingMessage, res: ServerResponse) {
  try {
    const config = adminConfigFromEnv();
    if (!config) throw new HttpError(503, "Admin is not configured");
    await route(config, pathOf(req).slice(ADMIN_API_PATH.length), req, res);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error("Admin request failed", error);
    sendJson(res, status, { error: error instanceof HttpError ? error.message : "Server error" });
  }
}

async function route(config: AdminConfig, path: string, req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? "GET";
  if (method === "POST" && path === "/login") return login(config, req, res);
  if (method === "POST" && path === "/logout") {
    sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
    return;
  }

  if (!isValidSessionToken(config, readCookie(req, COOKIE_NAME))) throw new HttpError(401, "Not signed in");
  if (method === "GET" && path === "/session") return sendJson(res, 200, { username: config.username });

  const db = services()?.admin;
  if (!db) throw new HttpError(503, "Database is unavailable");
  if (method === "GET" && path === "/users") return sendJson(res, 200, db.users(pageQuery(req)));
  if (method === "GET" && path === "/matches") return sendJson(res, 200, db.matches(pageQuery(req)));
  throw new HttpError(404, "Not found");
}

async function login(config: AdminConfig, req: IncomingMessage, res: ServerResponse) {
  const ip = requestIp(req);
  if (failedLogins.blocked(ip)) throw new HttpError(429, "Too many attempts, try again later");
  const body = (await readJson(req)) as { username?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!(await verifyCredentials(config, username, password))) {
    failedLogins.record(ip);
    throw new HttpError(401, "Wrong username or password");
  }
  failedLogins.clear(ip);
  sendJson(res, 200, { username: config.username }, {
    "Set-Cookie": sessionCookie(createSessionToken(config), SESSION_TTL_MS / 1000),
  });
}

function pageQuery(req: IncomingMessage): PageQuery {
  const query = queryOf(req);
  const page = Math.trunc(Number(query.get("page")));
  return {
    search: (query.get("search") ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    pageSize: ADMIN_PAGE_SIZE,
  };
}

function sessionCookie(value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; HttpOnly; SameSite=Strict; Path=${ADMIN_API_PATH}; Max-Age=${maxAgeSeconds}${secure}`;
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}
