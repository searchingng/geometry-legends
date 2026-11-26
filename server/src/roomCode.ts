import { randomInt } from "node:crypto";
import { matchMaker } from "colyseus";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isValidRoomCode, normalizeRoomCode } from "@moba/shared";

const MAX_ATTEMPTS = 50;

export const ROOM_CODE_IN_USE = "Room code already in use";

export function allocateRoomCode(requested: unknown): string {
  if (typeof requested !== "string") return generateUniqueRoomCode();

  const code = normalizeRoomCode(requested);
  if (!isValidRoomCode(code)) throw new Error("Invalid room code");
  if (matchMaker.getLocalRoomById(code)) throw new Error(ROOM_CODE_IN_USE);
  return code;
}

function generateUniqueRoomCode(): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode();
    if (!matchMaker.getLocalRoomById(code)) return code;
  }
  throw new Error("Could not allocate a free room code");
}

function randomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
