import { describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isValidRoomCode, normalizeRoomCode } from "../src/roomCode.js";

describe("room code alphabet", () => {
  it("excludes visually ambiguous characters", () => {
    for (const ambiguous of ["O", "0", "I", "L", "1"]) {
      expect(ROOM_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it("has only unique uppercase letters and digits", () => {
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
    expect(ROOM_CODE_ALPHABET).toMatch(/^[A-Z2-9]+$/);
  });

  it("uses five-character codes", () => {
    expect(ROOM_CODE_LENGTH).toBe(5);
  });
});

describe("normalizeRoomCode", () => {
  it("trims whitespace and uppercases", () => {
    expect(normalizeRoomCode("  ab3cd \n")).toBe("AB3CD");
  });

  it("leaves an already normalized code unchanged", () => {
    expect(normalizeRoomCode("XY234")).toBe("XY234");
  });
});

describe("isValidRoomCode", () => {
  it.each(["ABCDE", "23456", "Z9Z9Z", "HJKMN"])("accepts %s", (code) => {
    expect(isValidRoomCode(code)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["too short", "ABCD"],
    ["too long", "ABCDEF"],
    ["lowercase", "abcde"],
    ["contains O", "ABCDO"],
    ["contains 0", "ABCD0"],
    ["contains I", "IBCDE"],
    ["contains L", "ABLDE"],
    ["contains 1", "1BCDE"],
    ["inner space", "AB DE"],
    ["surrounding spaces", " ABCDE "],
    ["symbol", "ABC-E"],
  ])("rejects %s", (_label, code) => {
    expect(isValidRoomCode(code)).toBe(false);
  });

  it("accepts user input after normalization", () => {
    expect(isValidRoomCode(normalizeRoomCode(" xy234 "))).toBe(true);
  });

  it("accepts every alphabet character in every position", () => {
    for (const char of ROOM_CODE_ALPHABET) {
      expect(isValidRoomCode(char.repeat(ROOM_CODE_LENGTH))).toBe(true);
    }
  });
});
