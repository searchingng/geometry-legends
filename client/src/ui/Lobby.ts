import { ROOM_CODE_LENGTH, isValidRoomCode, normalizeRoomCode } from "@moba/shared";
import { Connection, type ConnectionOptions } from "../net/Connection.js";

export class Lobby {
  private readonly root = document.getElementById("lobby")!;
  private readonly createButton = document.getElementById("lobby-create") as HTMLButtonElement;
  private readonly joinForm = document.getElementById("lobby-join") as HTMLFormElement;
  private readonly codeInput = document.getElementById("lobby-code") as HTMLInputElement;
  private readonly error = document.getElementById("lobby-error")!;

  constructor(private readonly options: ConnectionOptions) {
    this.codeInput.maxLength = ROOM_CODE_LENGTH;
  }

  async connect(initialCode: string | null): Promise<Connection> {
    if (initialCode) {
      const resumed = await Connection.resume(this.options, normalizeRoomCode(initialCode));
      if (resumed) return resumed;
      try {
        return await this.attempt(() => this.join(initialCode));
      } catch {
        this.codeInput.value = normalizeRoomCode(initialCode);
      }
    }

    this.root.hidden = false;
    return new Promise((resolve) => {
      const finish = (connection: Connection) => {
        this.root.hidden = true;
        resolve(connection);
      };

      this.createButton.onclick = () => {
        this.attempt(() => Connection.create(this.options)).then(finish, () => {});
      };
      this.joinForm.onsubmit = (event) => {
        event.preventDefault();
        this.attempt(() => this.join(this.codeInput.value)).then(finish, () => {});
      };
    });
  }

  private async join(input: string): Promise<Connection> {
    const code = normalizeRoomCode(input);
    if (!isValidRoomCode(code)) {
      throw new Error(`Room code must be ${ROOM_CODE_LENGTH} letters/digits.`);
    }

    try {
      return await Connection.joinByCode(this.options, code);
    } catch (error) {
      if (!/not found/i.test(errorMessage(error))) throw error;
    }

    try {
      return await Connection.create(this.options, code);
    } catch (error) {
      if (!/already in use/i.test(errorMessage(error))) throw error;
      return Connection.joinByCode(this.options, code);
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
    this.createButton.disabled = busy;
    for (const element of this.joinForm.elements) (element as HTMLButtonElement).disabled = busy;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeError(error: unknown): string {
  const message = errorMessage(error);
  if (/full|locked/i.test(message)) return "This room is already full.";
  if (/letters\/digits/.test(message)) return message;
  return "Could not reach the game server. Is it running?";
}
