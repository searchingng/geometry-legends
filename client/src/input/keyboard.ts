const LEFT = new Set(["KeyA", "ArrowLeft"]);
const RIGHT = new Set(["KeyD", "ArrowRight"]);
const UP = new Set(["KeyW", "ArrowUp"]);
const DOWN = new Set(["KeyS", "ArrowDown"]);
const MOVEMENT_KEYS = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN]);

export class Keyboard {
  private readonly pressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener("keydown", (event) => {
      if (MOVEMENT_KEYS.has(event.code)) event.preventDefault();
      this.pressed.add(event.code);
    });
    target.addEventListener("keyup", (event) => this.pressed.delete(event.code));
    target.addEventListener("blur", () => this.pressed.clear());
  }

  moveDirection(): { x: number; y: number } {
    return {
      x: this.axis(RIGHT) - this.axis(LEFT),
      y: this.axis(DOWN) - this.axis(UP),
    };
  }

  private axis(keys: Set<string>): number {
    for (const key of keys) if (this.pressed.has(key)) return 1;
    return 0;
  }
}
