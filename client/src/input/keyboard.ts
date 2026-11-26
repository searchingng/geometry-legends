const LEFT = new Set(["KeyA", "ArrowLeft"]);
const RIGHT = new Set(["KeyD", "ArrowRight"]);
const UP = new Set(["KeyW", "ArrowUp"]);
const DOWN = new Set(["KeyS", "ArrowDown"]);
const ATTACK = new Set(["Space", "KeyJ"]);
const GAME_KEYS = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN, ...ATTACK]);

export class Keyboard {
  private readonly pressed = new Set<string>();
  private attackTapped = false;

  constructor(target: Window = window) {
    target.addEventListener("keydown", (event) => {
      if (GAME_KEYS.has(event.code)) event.preventDefault();
      if (ATTACK.has(event.code)) this.attackTapped = true;
      this.pressed.add(event.code);
    });
    target.addEventListener("keyup", (event) => {
      if (GAME_KEYS.has(event.code)) event.preventDefault();
      this.pressed.delete(event.code);
    });
    target.addEventListener("blur", () => this.pressed.clear());
  }

  moveDirection(): { x: number; y: number } {
    return {
      x: this.axis(RIGHT) - this.axis(LEFT),
      y: this.axis(DOWN) - this.axis(UP),
    };
  }

  attackHeld(): boolean {
    return this.axis(ATTACK) === 1;
  }

  consumeAttackTap(): boolean {
    const tapped = this.attackTapped;
    this.attackTapped = false;
    return tapped;
  }

  private axis(keys: Set<string>): number {
    for (const key of keys) if (this.pressed.has(key)) return 1;
    return 0;
  }
}
