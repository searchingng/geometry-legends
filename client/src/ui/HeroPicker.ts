import { HERO_IDS, getHero, heroRoleLabel, isHeroId, type HeroId } from "@moba/shared";
import { createIcon, cssColor } from "./HeroIcon.js";
import { heroInfoPanel } from "./HeroInfoPanel.js";

const LAST_PICK_KEY = "moba2d:lastHero";
const HOTKEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export class HeroPicker {
  private readonly root = document.getElementById("hero-picker")!;
  private readonly list = document.getElementById("hero-list")!;

  pick(): Promise<HeroId> {
    const maxSpeed = Math.max(...HERO_IDS.map((id) => getHero(id).moveSpeed));
    const lastPick = readLastPick();

    return new Promise((resolve) => {
      const choose = (heroId: HeroId) => {
        window.removeEventListener("keydown", onKey);
        heroInfoPanel().close();
        this.root.hidden = true;
        saveLastPick(heroId);
        resolve(heroId);
      };

      const onKey = (event: KeyboardEvent) => {
        if (heroInfoPanel().isOpen()) return;
        const index = HOTKEYS.indexOf(event.key);
        if (index !== -1 && index < HERO_IDS.length) choose(HERO_IDS[index]);
      };

      this.list.replaceChildren(
        ...HERO_IDS.map((heroId, index) => {
          const card = createCard(heroId, HOTKEYS[index] ?? "", maxSpeed);
          card.addEventListener("click", () => choose(heroId));
          return card;
        }),
      );

      window.addEventListener("keydown", onKey);
      this.root.hidden = false;
      const focusIndex = lastPick ? HERO_IDS.indexOf(lastPick) : 0;
      (this.list.children[focusIndex] as HTMLElement | undefined)?.focus();
    });
  }
}

function createCard(heroId: HeroId, hotkey: string, maxSpeed: number): HTMLButtonElement {
  const hero = getHero(heroId);
  const color = cssColor(hero.visual.color);
  const card = document.createElement("button");
  card.type = "button";
  card.className = "hero-card";
  card.style.setProperty("--hero-color", color);

  const name = document.createElement("strong");
  name.textContent = hero.name;
  const role = document.createElement("span");
  role.className = "hero-role";
  role.textContent = heroRoleLabel(hero);
  const description = document.createElement("span");
  description.className = "hero-description";
  description.textContent = hero.description;

  const speed = document.createElement("span");
  speed.className = "hero-speed";
  const speedFill = document.createElement("span");
  speedFill.style.width = `${(hero.moveSpeed / maxSpeed) * 100}%`;
  speed.append(speedFill);

  const key = document.createElement("kbd");
  key.textContent = hotkey;

  const info = document.createElement("span");
  info.className = "hero-card-info";
  info.textContent = "i";
  info.title = `${hero.name}: full details`;
  info.addEventListener("click", (event) => {
    event.stopPropagation();
    heroInfoPanel().open(heroId);
  });

  card.append(key, info, createIcon(hero.visual.shape, color), name, role, description, speed);
  return card;
}

function readLastPick(): HeroId | undefined {
  try {
    const value = localStorage.getItem(LAST_PICK_KEY);
    return isHeroId(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function saveLastPick(heroId: HeroId) {
  try {
    localStorage.setItem(LAST_PICK_KEY, heroId);
  } catch {
    return;
  }
}
