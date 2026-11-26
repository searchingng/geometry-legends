export const USERNAME_MAX_LENGTH = 16;
export const DEFAULT_USERNAME_PREFIX = "user_";
export const IDENTITY_API_PATH = "/api/identity";
export const USERNAME_TAKEN = "Username is taken";
export const ALREADY_IN_ROOM = "You are already in this room";

const DISALLOWED_CHARACTERS = /[^\p{L}\p{N}_\-. ]/gu;
const USER_KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function normalizeUsername(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const cleaned = input.replace(DISALLOWED_CHARACTERS, "").replace(/\s+/g, " ").trim();
  const name = [...cleaned].slice(0, USERNAME_MAX_LENGTH).join("").trim();
  return name.length > 0 ? name : undefined;
}

export function defaultUsername(n: number): string {
  return DEFAULT_USERNAME_PREFIX + n;
}

export function isUserKey(value: unknown): value is string {
  return typeof value === "string" && USER_KEY_PATTERN.test(value);
}

export function sameUsername(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export interface DefaultIdentityRequest {
  key: string;
}

export interface DefaultIdentityResponse {
  username: string;
}
