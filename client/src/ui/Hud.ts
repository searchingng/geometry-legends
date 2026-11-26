const COPY_FEEDBACK_MS = 1500;

export class Hud {
  private readonly status = document.getElementById("hud-status")!;
  private readonly stats = document.getElementById("hud-stats")!;
  private readonly room = document.getElementById("hud-room")!;
  private readonly roomCode = document.getElementById("hud-room-code")!;
  private readonly copyButton = document.getElementById("hud-copy-link") as HTMLButtonElement;
  private readonly vitals = document.getElementById("hud-vitals")!;
  private readonly hpFill = document.getElementById("hud-hp-fill")!;
  private readonly hpText = document.getElementById("hud-hp-text")!;
  private readonly respawn = document.getElementById("hud-respawn")!;
  private readonly respawnTime = document.getElementById("hud-respawn-time")!;
  private shownHp = "";
  private shownRespawn: number | null = null;

  setStatus(text: string) {
    if (this.status.textContent !== text) this.status.textContent = text;
  }

  setStats(text: string) {
    this.stats.textContent = text;
  }

  setHealth(hp: number, maxHp: number) {
    const label = `${hp} / ${maxHp}`;
    if (label === this.shownHp) return;
    this.shownHp = label;
    this.vitals.hidden = false;
    this.hpText.textContent = label;
    this.hpFill.style.transform = `scaleX(${hp / maxHp})`;
  }

  setRespawnCountdown(seconds: number | null) {
    if (seconds === this.shownRespawn) return;
    this.shownRespawn = seconds;
    this.respawn.hidden = seconds === null;
    if (seconds !== null) this.respawnTime.textContent = `${seconds}s`;
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
