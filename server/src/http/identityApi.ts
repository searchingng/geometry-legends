import type { IncomingMessage, ServerResponse } from "node:http";
import { IDENTITY_API_PATH, isUserKey, type DefaultIdentityResponse } from "@moba/shared";
import { services } from "../db/services.js";
import { RateLimiter } from "./RateLimiter.js";
import { HttpError, pathOf, readJson, requestIp, sendJson } from "./json.js";

const DEFAULT_PATH = `${IDENTITY_API_PATH}/default`;
const defaultsPerIp = new RateLimiter(20, 60 * 60 * 1000);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function isIdentityRequest(req: IncomingMessage): boolean {
  return pathOf(req) === DEFAULT_PATH;
}

export async function handleIdentity(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS).end();
    return;
  }
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const store = services()?.users;
    if (!store) throw new HttpError(503, "User storage is unavailable");
    const body = (await readJson(req)) as { key?: unknown } | null;
    if (!isUserKey(body?.key)) throw new HttpError(400, "Invalid key");
    const ip = requestIp(req);
    if (!defaultsPerIp.allow(ip)) throw new HttpError(429, "Too many requests");

    const response: DefaultIdentityResponse = { username: store.createDefault(body.key, ip) };
    sendJson(res, 200, response, CORS_HEADERS);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error("Identity request failed", error);
    sendJson(res, status, { error: error instanceof HttpError ? error.message : "Server error" }, CORS_HEADERS);
  }
}
