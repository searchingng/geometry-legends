const COPY_FEEDBACK_MS = 1500;

export class Hud {
  private readonly status = document.getElementById("hud-status")!;
  private readonly stats = document.getElementById("hud-stats")!;
  private readonly room = document.getElementById("hud-room")!;
  private readonly roomCode = document.getElementById("hud-room-code")!;
  private readonly copyButton = document.getElementById("hud-copy-link") as HTMLButtonElement;

  setStatus(text: string) {
    if (this.status.textContent !== text) this.status.textContent = text;
  }

  setStats(text: string) {
    this.stats.textContent = text;
  }

  showRoom(code: string, shareUrl: string) {
    this.roomCode.textContent = code;
    this.room.hidden = false;
    this.copyButton.onclick = async () => {
      await navigator.clipboard.writeText(shareUrl);
      this.copyButton.textContent = "Copied!";
      setTimeout(() => (this.copyButton.textContent = "Copy link"), COPY_FEEDBACK_MS);
    };
  }
}
