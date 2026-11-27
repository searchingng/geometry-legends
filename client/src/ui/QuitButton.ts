import "./quit.css";

const CONFIRM_WINDOW_MS = 3000;
const IDLE_TEXT = "Quit";
const CONFIRM_TEXT = "Quit match? Click again";

export class QuitButton {
  private readonly button = document.createElement("button");
  private confirmTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(onQuit: () => void, needsConfirm: () => boolean) {
    this.button.type = "button";
    this.button.className = "quit-button";
    this.button.dataset.ui = "";
    this.button.textContent = IDLE_TEXT;
    this.button.addEventListener("click", () => {
      this.button.blur();
      if (needsConfirm() && this.confirmTimer === undefined) {
        this.armConfirm();
        return;
      }
      this.disarmConfirm();
      this.button.disabled = true;
      this.button.textContent = "Leaving…";
      onQuit();
    });
    document.body.append(this.button);
  }

  private armConfirm() {
    this.button.textContent = CONFIRM_TEXT;
    this.button.classList.add("quit-confirm");
    this.confirmTimer = setTimeout(() => this.disarmConfirm(), CONFIRM_WINDOW_MS);
  }

  private disarmConfirm() {
    clearTimeout(this.confirmTimer);
    this.confirmTimer = undefined;
    this.button.textContent = IDLE_TEXT;
    this.button.classList.remove("quit-confirm");
  }
}
