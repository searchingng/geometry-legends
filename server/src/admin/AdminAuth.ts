import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, length: number) => Promise<Buffer>;
const KEY_LENGTH = 64;
const HASH_PREFIX = "scrypt";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface AdminConfig {
  username: string;
  passwordHash: string;
  sessionSecret: string;
}

const fallbackSessionSecret = randomBytes(32).toString("hex");

export function adminConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AdminConfig | undefined {
  const username = env.ADMIN_USER;
  const passwordHash = env.ADMIN_PASSWORD_HASH;
  if (!username || !passwordHash?.startsWith(`${HASH_PREFIX}:`)) return undefined;
  return { username, passwordHash, sessionSecret: env.ADMIN_SESSION_SECRET || fallbackSessionSecret };
}

export async function hashPassword(password: string, salt = randomBytes(16)): Promise<string> {
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `${HASH_PREFIX}:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyCredentials(config: AdminConfig, username: string, password: string): Promise<boolean> {
  const [, saltHex, keyHex] = config.passwordHash.split(":");
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  const passwordOk = timingSafeEqual(actual, expected);
  return safeEqual(username, config.username) && passwordOk;
}

export function createSessionToken(config: AdminConfig, now = Date.now()): string {
  const expiresAt = String(now + SESSION_TTL_MS);
  return `${expiresAt}.${sign(config, expiresAt)}`;
}

export function isValidSessionToken(config: AdminConfig, token: string | undefined, now = Date.now()): boolean {
  const [expiresAt, signature] = (token ?? "").split(".");
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt) || Number(expiresAt) <= now) return false;
  return safeEqual(signature, sign(config, expiresAt));
}

function sign(config: AdminConfig, expiresAt: string): string {
  return createHmac("sha256", config.sessionSecret)
    .update(`${config.username}\n${config.passwordHash}\n${expiresAt}`)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}
