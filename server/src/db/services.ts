import type { DatabaseSync } from "node:sqlite";
import { AdminQueries } from "./AdminQueries.js";
import { openDatabase } from "./database.js";
import { MatchHistory, type MatchRecord, type MatchRecorder } from "./MatchHistory.js";
import { UserStore } from "./UserStore.js";

export interface Services {
  users: UserStore;
  history: MatchRecorder;
  admin: AdminQueries;
}

let current: Services | undefined;

export function createServices(db: DatabaseSync): Services {
  return { users: new UserStore(db), history: new MatchHistory(db), admin: new AdminQueries(db) };
}

export function openServices(path: string): Services {
  return createServices(openDatabase(path));
}

export function provideServices(services: Services | undefined) {
  current = services;
}

export function services(): Services | undefined {
  return current;
}

export function recordMatch(match: MatchRecord) {
  try {
    current?.history.record(match);
  } catch (error) {
    console.error("Failed to save match history", error);
  }
}
