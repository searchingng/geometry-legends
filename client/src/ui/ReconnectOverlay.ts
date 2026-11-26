import type { Connection, ConnectionStatus } from "../net/Connection.js";
import "./reconnect.css";

export class ReconnectOverlay {
  private readonly root = document.createElement("div");
  private readonly message = document.createElement("div");
  private readonly button = document.createElement("button");

  constructor(connection: Connection) {
    this.root.className = "rc-overlay";
    this.root.hidden = true;
    this.message.className = "rc-message";
    this.button.className = "rc-button";
    this.button.type = "button";
    this.button.dataset.ui = "";
    this.button.textContent = "Rejoin";
    this.button.addEventListener("click", () => location.reload());
    this.root.append(this.message, this.button);
    document.body.appendChild(this.root);

    connection.onStatus((status) => this.render(status));
  }

  private render(status: ConnectionStatus) {
    this.root.hidden = status === "connected";
    this.root.classList.toggle("rc-lost", status === "lost");
    this.message.textContent = status === "lost" ? "Disconnected" : "Reconnecting…";
    this.button.hidden = status !== "lost";
  }
}
