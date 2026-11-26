import {
  DEFAULT_USERNAME_PREFIX,
  USERNAME_MAX_LENGTH,
  isUserKey,
  normalizeUsername,
  type DefaultIdentityRequest,
  type DefaultIdentityResponse,
} from "@moba/shared";

const USERNAME_KEY = "moba2d:username";
const DEFAULT_USERNAME_KEY = "moba2d:defaultUsername";
const USER_KEYS_KEY = "moba2d:userKeys";
const PENDING_PLACEHOLDER = `${DEFAULT_USERNAME_PREFIX}…`;

export interface Identity {
  name: string;
  userKey: string;
}

export class UsernameField {
  private fallback: Promise<string | undefined>;

  constructor(
    private readonly input: HTMLInputElement,
    private readonly defaultIdentityUrl: string,
  ) {
    input.maxLength = USERNAME_MAX_LENGTH;
    input.value = normalizeUsername(readStored(USERNAME_KEY)) ?? "";
    const storedDefault = normalizeUsername(readStored(DEFAULT_USERNAME_KEY));
    if (storedDefault && keyFor(storedDefault)) {
      input.placeholder = storedDefault;
      this.fallback = Promise.resolve(storedDefault);
    } else {
      input.placeholder = PENDING_PLACEHOLDER;
      this.fallback = this.requestDefault();
    }
  }

  async commit(): Promise<Identity> {
    const chosen = normalizeUsername(this.input.value);
    if (chosen) store(USERNAME_KEY, chosen);
    else remove(USERNAME_KEY);
    this.input.value = chosen ?? "";

    const name = chosen ?? (await this.defaultName());
    return { name, userKey: keyFor(name) ?? createKey(name) };
  }

  private async defaultName(): Promise<string> {
    const name = (await this.fallback) ?? (await (this.fallback = this.requestDefault()));
    if (!name) throw new Error("Could not reach the game server.");
    return name;
  }

  private async requestDefault(): Promise<string | undefined> {
    const key = randomKey();
    try {
      const response = await fetch(this.defaultIdentityUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key } satisfies DefaultIdentityRequest),
      });
      if (!response.ok) return undefined;
      const username = normalizeUsername(((await response.json()) as DefaultIdentityResponse).username);
      if (!username) return undefined;
      saveKey(username, key);
      store(DEFAULT_USERNAME_KEY, username);
      this.input.placeholder = username;
      return username;
    } catch {
      return undefined;
    }
  }
}

function keyFor(name: string): string | undefined {
  const key = readKeys()[name.toLowerCase()];
  return isUserKey(key) ? key : undefined;
}

function createKey(name: string): string {
  const key = randomKey();
  saveKey(name, key);
  return key;
}

function saveKey(name: string, key: string) {
  store(USER_KEYS_KEY, JSON.stringify({ ...readKeys(), [name.toLowerCase()]: key }));
}

function readKeys(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readStored(USER_KEYS_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
}
