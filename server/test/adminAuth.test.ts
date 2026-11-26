import { afterEach, describe, expect, it } from "vitest";
import {
  SESSION_TTL_MS,
  adminConfigFromEnv,
  createSessionToken,
  hashPassword,
  isValidSessionToken,
  verifyCredentials,
  type AdminConfig,
} from "../src/admin/AdminAuth.js";
import { clientIp } from "../src/http/json.js";
import { RateLimiter } from "../src/http/RateLimiter.js";

async function config(): Promise<AdminConfig> {
  return { username: "boss", passwordHash: await hashPassword("s3cret"), sessionSecret: "x".repeat(64) };
}

describe("admin auth", () => {
  it("accepts only the right username and password", async () => {
    const admin = await config();
    expect(await verifyCredentials(admin, "boss", "s3cret")).toBe(true);
    expect(await verifyCredentials(admin, "boss", "S3cret")).toBe(false);
    expect(await verifyCredentials(admin, "other", "s3cret")).toBe(false);
  });

  it("issues session tokens that expire and cannot be forged", async () => {
    const admin = await config();
    const now = 1_000_000;
    const token = createSessionToken(admin, now);
    expect(isValidSessionToken(admin, token, now + 1000)).toBe(true);
    expect(isValidSessionToken(admin, token, now + SESSION_TTL_MS + 1)).toBe(false);

    const [, signature] = token.split(".");
    expect(isValidSessionToken(admin, `${now + 10 * SESSION_TTL_MS}.${signature}`, now)).toBe(false);
    expect(isValidSessionToken({ ...admin, sessionSecret: "y".repeat(64) }, token, now)).toBe(false);
    expect(isValidSessionToken(admin, undefined, now)).toBe(false);
  });

  it("stays disabled until a username and scrypt hash are configured", async () => {
    expect(adminConfigFromEnv({})).toBeUndefined();
    expect(adminConfigFromEnv({ ADMIN_USER: "boss", ADMIN_PASSWORD_HASH: "plain" })).toBeUndefined();
    const hash = await hashPassword("s3cret");
    expect(adminConfigFromEnv({ ADMIN_USER: "boss", ADMIN_PASSWORD_HASH: hash })?.username).toBe("boss");
  });
});

describe("clientIp", () => {
  afterEach(() => {
    delete process.env.CLIENT_IP_HEADER;
  });

  it("uses the socket address unless a proxy header is configured", () => {
    const headers = { "fly-client-ip": "203.0.113.9" };
    expect(clientIp(headers, "::ffff:10.0.0.1")).toBe("10.0.0.1");
    process.env.CLIENT_IP_HEADER = "Fly-Client-IP";
    expect(clientIp(headers, "10.0.0.1")).toBe("203.0.113.9");
    expect(clientIp({}, "10.0.0.1")).toBe("10.0.0.1");
  });
});

describe("RateLimiter", () => {
  it("blocks after the limit and forgets old attempts", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.allow("ip", 0)).toBe(true);
    expect(limiter.allow("ip", 10)).toBe(true);
    expect(limiter.allow("ip", 20)).toBe(false);
    expect(limiter.blocked("ip", 500)).toBe(true);
    expect(limiter.allow("ip", 1015)).toBe(true);
    limiter.clear("ip");
    expect(limiter.blocked("ip", 1020)).toBe(false);
  });
});
