import { describe, expect, it } from "vitest";
import { USERNAME_MAX_LENGTH, defaultUsername, isUserKey, normalizeUsername, sameUsername } from "../src/username.js";

describe("normalizeUsername", () => {
  it("trims, collapses spaces and keeps letters from any script", () => {
    expect(normalizeUsername("  Sardor   Ali ")).toBe("Sardor Ali");
    expect(normalizeUsername("Тимур_01")).toBe("Тимур_01");
  });

  it("drops markup characters and rejects empty results", () => {
    expect(normalizeUsername("<b>neo</b>")).toBe("bneob");
    expect(normalizeUsername("   ")).toBeUndefined();
    expect(normalizeUsername("<>")).toBeUndefined();
    expect(normalizeUsername(42)).toBeUndefined();
  });

  it("caps the length", () => {
    expect(normalizeUsername("x".repeat(40))).toHaveLength(USERNAME_MAX_LENGTH);
  });
});

describe("identity helpers", () => {
  it("builds default names and compares names case-insensitively", () => {
    expect(defaultUsername(7)).toBe("user_7");
    expect(sameUsername("Sardor", "sARDOR")).toBe(true);
    expect(sameUsername("Sardor", "Sardor2")).toBe(false);
  });

  it("accepts only long url-safe keys", () => {
    expect(isUserKey("a".repeat(32))).toBe(true);
    expect(isUserKey("a".repeat(31))).toBe(false);
    expect(isUserKey(`${"a".repeat(31)}=`)).toBe(false);
    expect(isUserKey(undefined)).toBe(false);
  });
});
