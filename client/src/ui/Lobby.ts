import { ROOM_CODE_LENGTH, isValidRoomCode, normalizeRoomCode } from "@moba/shared";
import { Connection, defaultIdentityUrl, roomsApiUrl, type ConnectionOptions } from "../net/Connection.js";
import { RoomList } from "./RoomList.js";
import { UsernameField } from "./UsernameField.js";
import "./reconnect.css";

const CONNECT_RETRY_WINDOW_MS = 6000;
const FIRST_CONNECT_RETRY_MS = 300;
const MAX_CONNECT_RETRY_MS = 1500;

export class Lobby {
  private readonly root = document.getElementById("lobby")!;
  private readonly createButton = document.getElementById("lobby-create") as HTMLButtonElement;
  private readonly joinForm = document.getElementById("lobby-join") as HTMLFormElement;
  private readonly codeInput = document.getElementById("lobby-code") as HTMLInputElement;
  private readonly error = document.getElementById("lobby-error")!;
  private readonly rooms: RoomList;
  private readonly username: UsernameField;
  private onRoomAction: ((code: string, spectate: boolean) => void) | undefined;

  constructor(private readonly options: ConnectionOptions) {
    this.codeInput.maxLength = ROOM_CODE_LENGTH;
    this.username = new UsernameField(
      document.getElementById("lobby-name") as HTMLInputElement,
      defaultIdentityUrl(options),
    );
    this.rooms = new RoomList(document.getElementById("lobby-rooms")!, roomsApiUrl(options), (code, spectate) =>
      this.onRoomAction?.(code, spectate),
    );
  }

  async connect(initialCode: string | null): Promise<Connection> {
    if (initialCode) {
      const spectate = this.options.spectate;
      const resumed = spectate ? undefined : await Connection.resume(this.options, normalizeRoomCode(initialCode));
      if (resumed) return resumed;
      try {
        return await this.attempt(() => this.withRetry(() => this.join(initialCode, spectate)));
      } catch {
        this.codeInput.value = normalizeRoomCode(initialCode);
      }
    }

    this.root.hidden = false;
    this.rooms.start();
    return new Promise((resolve) => {
      const finish = (connection: Connection) => {
        this.root.hidden = true;
        this.rooms.stop();
        this.onRoomAction = undefined;
        resolve(connection);
      };

      this.onRoomAction = (code, spectate) => {
        this.attempt(() => this.join(code, spectate, false)).then(finish, () => {});
      };
      this.createButton.onclick = () => {
        this.attempt(async () => Connection.create(this.options, await this.username.commit())).then(finish, () => {});
      };
      this.joinForm.onsubmit = (event) => {
        event.preventDefault();
        this.attempt(() => this.join(this.codeInput.value)).then(finish, () => {});
      };
    });
  }

  private async join(input: string, spectate = false, createIfMissing = true): Promise<Connection> {
    const code = normalizeRoomCode(input);
    if (!isValidRoomCode(code)) {
      throw new Error(`Room code must be ${ROOM_CODE_LENGTH} letters/digits.`);
    }
    const identity = await this.username.commit();
    if (spectate) return Connection.joinByCode(this.options, code, { spectate: true, name: identity.name });

    try {
      return await Connection.joinByCode(this.options, code, identity);
    } catch (error) {
      if (!createIfMissing || !/not found/i.test(errorMessage(error))) throw error;
    }

    try {
      return await Connection.create(this.options, identity, code);
    } catch (error) {
      if (!/already in use/i.test(errorMessage(error))) throw error;
      return Connection.joinByCode(this.options, code, identity);
    }
  }

  private async withRetry(connect: () => Promise<Connection>): Promise<Connection> {
    const deadline = performance.now() + CONNECT_RETRY_WINDOW_MS;
    let retryMs = FIRST_CONNECT_RETRY_MS;
    const status = connectingStatus();
    try {
      for (;;) {
        try {
          return await connect();
        } catch (error) {
          if (!isUnreachable(error) || performance.now() + retryMs > deadline) throw error;
          status.hidden = false;
          await new Promise((resolve) => setTimeout(resolve, retryMs));
          retryMs = Math.min(retryMs * 2, MAX_CONNECT_RETRY_MS);
        }
      }
    } finally {
      status.remove();
    }
  }

  private async attempt(connect: () => Promise<Connection>): Promise<Connection> {
    this.setBusy(true);
    this.error.textContent = "";
    try {
      return await connect();
    } catch (error) {
      this.error.textContent = describeError(error);
      throw error;
    } finally {
      this.setBusy(false);
    }
  }

  private setBusy(busy: boolean) {
    this.rooms.setBusy(busy);
    this.createButton.disabled = busy;
    for (const element of this.joinForm.elements) (element as HTMLButtonElement).disabled = busy;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isUnreachable(error: unknown): boolean {
  return !/full|locked|letters\/digits|not found|already in use|taken|already in this room|required/i.test(
    errorMessage(error),
  );
}

function connectingStatus(): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "rc-overlay";
  overlay.hidden = true;
  const message = document.createElement("div");
  message.className = "rc-message";
  message.textContent = "Connecting…";
  overlay.appendChild(message);
  document.body.appendChild(overlay);
  return overlay;
}

function describeError(error: unknown): string {
  const message = errorMessage(error);
  if (/full|locked/i.test(message)) return "This room is full, even for spectators.";
  if (/not found/i.test(message)) return "That room no longer exists.";
  if (/letters\/digits/.test(message)) return message;
  if (/taken/i.test(message)) return "That username belongs to another player. Choose a different one.";
  if (/already in this room/i.test(message)) return "You are already playing in this room in another tab.";
  return "Could not reach the game server. Is it running?";
}
