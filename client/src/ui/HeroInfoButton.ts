import type { HeroId } from "@moba/shared";
import { heroInfoPanel } from "./HeroInfoPanel.js";

const TOGGLE_KEY = "KeyI";

export class HeroInfoButton {
  private readonly button = document.createElement("button");
  private heroId: HeroId | undefined;

  constructor() {
    this.button.type = "button";
    this.button.className = "hero-info-button";
    this.button.dataset.ui = "";
    this.button.textContent = "ⓘ Hero (I)";
    this.button.hidden = true;
    this.button.addEventListener("click", () => {
      this.button.blur();
      this.toggle();
    });
    document.body.append(this.button);

    window.addEventListener("keydown", (event) => {
      if (event.code !== TOGGLE_KEY || event.repeat || isTyping(event.target)) return;
      this.toggle();
    });
  }

  setHero(heroId: HeroId) {
    this.heroId = heroId;
    this.button.hidden = false;
  }

  private toggle() {
    if (this.heroId) heroInfoPanel().toggle(this.heroId);
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
