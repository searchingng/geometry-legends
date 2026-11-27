import { describeSkill, getHero, getSkill, heroRoleLabel, heroStatLines, type HeroId, type SkillInfo } from "@moba/shared";
import { createIcon, cssColor } from "./HeroIcon.js";
import "./heroInfo.css";

const SKILL_KEYS = ["Z", "X", "C"];
const CONTROLS: readonly [string, string][] = [
  ["W A S D", "Move"],
  ["Space / Left click", "Basic attack"],
  ["Z X C + Left click", "Hold to aim a skill, click to cast"],
  ["Right click", "Hold to aim skill 1, release to cast"],
  ["Tab (hold)", "Game info: score, timer, K/D/A"],
  ["I", "Open / close this panel"],
];

let shared: HeroInfoPanel | undefined;

export function heroInfoPanel(): HeroInfoPanel {
  shared ??= new HeroInfoPanel();
  return shared;
}

export class HeroInfoPanel {
  private readonly root = element("div", "hero-info");
  private readonly body = element("div", "hero-info-body");
  private shownHero: HeroId | undefined;

  constructor() {
    this.root.hidden = true;
    this.root.dataset.ui = "";
    const close = element("button", "hero-info-close");
    close.type = "button";
    close.textContent = "×";
    close.title = "Close (Esc)";
    close.addEventListener("click", () => this.close());
    this.root.addEventListener("click", (event) => {
      if (event.target === this.root) this.close();
    });
    const panel = element("div", "hero-info-panel");
    panel.append(close, this.body);
    this.root.append(panel);
    document.body.append(this.root);

    window.addEventListener("keydown", (event) => {
      if (event.code === "Escape" && this.isOpen()) this.close();
    });
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(heroId: HeroId) {
    if (this.isOpen() && this.shownHero === heroId) this.close();
    else this.open(heroId);
  }

  open(heroId: HeroId) {
    if (this.shownHero !== heroId) {
      this.shownHero = heroId;
      this.render(heroId);
    }
    this.root.hidden = false;
  }

  close() {
    this.root.hidden = true;
  }

  private render(heroId: HeroId) {
    const hero = getHero(heroId);
    const color = cssColor(hero.visual.color);
    this.root.style.setProperty("--hero-color", color);

    const header = element("header", "hero-info-header");
    const title = element("div", "hero-info-title");
    const name = element("h2");
    name.textContent = hero.name;
    const role = element("span", "hero-info-role");
    role.textContent = heroRoleLabel(hero);
    const description = element("p", "hero-info-description");
    description.textContent = hero.description;
    title.append(name, role, description);
    header.append(createIcon(hero.visual.shape, color), title);

    const stats = element("section", "hero-info-stats");
    for (const line of heroStatLines(hero)) {
      const label = element("span", "hero-info-stat-label");
      label.textContent = line.label;
      const value = element("span", "hero-info-stat-value");
      value.textContent = line.value;
      const bar = element("span", "hero-info-bar");
      const fill = element("span");
      fill.style.width = `${Math.round(line.ratio * 100)}%`;
      bar.append(fill);
      stats.append(label, value, bar);
    }

    const skills = element("section", "hero-info-skills");
    hero.skills.forEach((skillId, slot) => skills.append(skillCard(describeSkill(getSkill(skillId)), slot)));

    this.body.replaceChildren(header, heading("Stats"), stats, heading("Skills"), skills, heading("Controls"), controls());
  }
}

function skillCard(info: SkillInfo, slot: number): HTMLElement {
  const card = element("article", "hero-info-skill");
  const top = element("div", "hero-info-skill-top");
  const key = element("kbd");
  key.textContent = SKILL_KEYS[slot] ?? "";
  const name = element("strong");
  name.textContent = slot === 0 ? `${info.name} · also right click` : info.name;
  top.append(key, name);

  const description = element("p", "hero-info-skill-description");
  description.textContent = info.description;

  const facts = element("div", "hero-info-facts");
  facts.append(fact("Cooldown", info.cooldown), fact("Range", info.range), fact("Type", info.delivery));

  const usage = element("p", "hero-info-usage");
  usage.textContent = info.usage;

  card.append(top, description, facts, usage);
  for (const zone of info.zones) {
    const row = element("div", "hero-info-zone");
    const area = element("span", "hero-info-zone-area");
    area.textContent = zone.area;
    row.append(area);
    for (const effect of zone.effects) {
      const chip = element("span", "hero-info-chip");
      chip.textContent = effect;
      row.append(chip);
    }
    card.append(row);
  }
  return card;
}

function fact(label: string, value: string): HTMLElement {
  const node = element("span", "hero-info-fact");
  const name = element("small");
  name.textContent = label;
  node.append(name, value);
  return node;
}

function controls(): HTMLElement {
  const list = element("dl", "hero-info-controls");
  for (const [keys, action] of CONTROLS) {
    const term = element("dt");
    term.textContent = keys;
    const detail = element("dd");
    detail.textContent = action;
    list.append(term, detail);
  }
  return list;
}

function heading(text: string): HTMLElement {
  const node = element("h3", "hero-info-heading");
  node.textContent = text;
  return node;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
