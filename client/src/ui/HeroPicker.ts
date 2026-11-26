import { HERO_IDS, getHero, isHeroId, type HeroDefinition, type HeroId, type HeroShape } from "@moba/shared";

const LAST_PICK_KEY = "moba2d:lastHero";
const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_SIZE = 48;
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
        this.root.hidden = true;
        saveLastPick(heroId);
        resolve(heroId);
      };

      const onKey = (event: KeyboardEvent) => {
        const index = HOTKEYS.indexOf(event.key);
        if (index !== -1 && index < HERO_IDS.length) choose(HERO_IDS[index]);
      };

      this.list.replaceChildren(
        ...HERO_IDS.map((heroId, index) => {
          const card = createCard(getHero(heroId), HOTKEYS[index] ?? "", maxSpeed);
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

function createCard(hero: HeroDefinition, hotkey: string, maxSpeed: number): HTMLButtonElement {
  const color = cssColor(hero.visual.color);
  const card = document.createElement("button");
  card.type = "button";
  card.className = "hero-card";
  card.style.setProperty("--hero-color", color);

  const name = document.createElement("strong");
  name.textContent = hero.name;
  const role = document.createElement("span");
  role.className = "hero-role";
  role.textContent = hero.role;
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

  card.append(key, createIcon(hero.visual.shape, color), name, role, description, speed);
  return card;
}

function createIcon(shape: HeroShape, color: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${ICON_SIZE} ${ICON_SIZE}`);
  svg.setAttribute("class", "hero-icon");
  svg.append(createIconShape(shape, ICON_SIZE / 2, ICON_SIZE * 0.4, color));
  return svg;
}

function createIconShape(shape: HeroShape, c: number, r: number, color: string): SVGElement {
  if (shape === "circle") return svgElement("circle", { cx: c, cy: c, r: r * 0.9, fill: color });
  if (shape === "ring") {
    return svgElement("circle", { cx: c, cy: c, r: r * 0.68, fill: "none", stroke: color, "stroke-width": r * 0.55 });
  }
  return svgElement("polygon", { points: shapePoints(shape, c, r), fill: color });
}

function svgElement(tag: string, attributes: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries({ stroke: "#fff", "stroke-width": 2, ...attributes })) {
    element.setAttribute(name, String(value));
  }
  return element;
}

function shapePoints(shape: Exclude<HeroShape, "circle" | "ring">, c: number, r: number): string {
  switch (shape) {
    case "square":
      return pointList([
        [-0.8, -0.8],
        [0.8, -0.8],
        [0.8, 0.8],
        [-0.8, 0.8],
      ], c, r);
    case "diamond":
      return pointList([
        [0, -1],
        [0.7, 0],
        [0, 1],
        [-0.7, 0],
      ], c, r);
    case "cross": {
      const a = 0.3;
      return pointList([
        [-a, -1], [a, -1], [a, -a], [1, -a], [1, a], [a, a],
        [a, 1], [-a, 1], [-a, a], [-1, a], [-1, -a], [-a, -a],
      ], c, r);
    }
    case "spike":
      return pointList([
        [0, -1],
        [0.75, 0.85],
        [-0.75, 0.85],
      ], c, r);
    case "star":
      return regularPoints(10, c, r, -Math.PI / 2, 0.45);
    case "triangle":
      return regularPoints(3, c, r, 0);
    case "pentagon":
      return regularPoints(5, c, r, -Math.PI / 2);
    case "hexagon":
      return regularPoints(6, c, r, 0);
  }
}

function pointList(points: [number, number][], c: number, r: number): string {
  return points.map(([x, y]) => `${c + x * r},${c + y * r}`).join(" ");
}

function regularPoints(count: number, c: number, r: number, startAngle: number, innerRatio = 1): string {
  const points: string[] = [];
  for (let i = 0; i < count; i++) {
    const angle = startAngle + (i / count) * Math.PI * 2;
    const radius = i % 2 === 1 ? r * innerRatio : r;
    points.push(`${c + Math.cos(angle) * radius},${c + Math.sin(angle) * radius}`);
  }
  return points.join(" ");
}

function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
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
