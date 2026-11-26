import { TICK_MS, getHero, getSkill, type HeroId, type SkillDefinition, type SkillShape, type SkillSlot } from "@moba/shared";
import { ZONE_COLORS } from "../render/SkillIndicators.js";

const DENIED_FLASH_MS = 350;
const ICON_SIZE = 40;
const ICON_CENTER = ICON_SIZE / 2;
const ICON_REACH = 17;

interface SlotView {
  root: HTMLElement;
  icon: HTMLElement;
  name: HTMLElement;
  cooldownText: HTMLElement;
  cooldownMs: number;
  shownTicks: number;
  deniedTimer: number | undefined;
}

export class SkillBar {
  private readonly root = document.getElementById("skill-bar")!;
  private readonly slots: SlotView[];
  private heroId: HeroId | undefined;
  private aiming: SkillSlot | undefined;

  constructor() {
    this.slots = [...this.root.querySelectorAll<HTMLElement>(".skill-slot")].map((root) => ({
      root,
      icon: root.querySelector(".skill-icon")!,
      name: root.querySelector(".skill-name")!,
      cooldownText: root.querySelector(".skill-cd-text")!,
      cooldownMs: 1,
      shownTicks: 0,
      deniedTimer: undefined,
    }));
  }

  setHero(heroId: HeroId) {
    if (heroId === this.heroId) return;
    this.heroId = heroId;
    getHero(heroId).skills.forEach((id, index) => {
      const slot = this.slots[index];
      if (!slot) return;
      const skill = getSkill(id);
      slot.cooldownMs = skill.cooldownMs;
      slot.name.textContent = skill.name;
      slot.root.title = `${skill.name} — ${skill.description}`;
      slot.icon.innerHTML = iconSvg(skill);
      this.renderCooldown(slot, 0);
    });
    this.root.hidden = false;
  }

  setCooldowns(ticks: readonly number[] | undefined) {
    this.slots.forEach((slot, index) => {
      const remaining = ticks?.[index] ?? 0;
      if (remaining !== slot.shownTicks) this.renderCooldown(slot, remaining);
    });
  }

  setAiming(slot: SkillSlot | undefined) {
    if (slot === this.aiming) return;
    if (this.aiming !== undefined) this.slots[this.aiming]?.root.classList.remove("aiming");
    this.aiming = slot;
    if (slot !== undefined) this.slots[slot]?.root.classList.add("aiming");
  }

  flashDenied(index: SkillSlot) {
    const slot = this.slots[index];
    if (!slot) return;
    slot.root.classList.remove("denied");
    void slot.root.offsetWidth;
    slot.root.classList.add("denied");
    clearTimeout(slot.deniedTimer);
    slot.deniedTimer = window.setTimeout(() => slot.root.classList.remove("denied"), DENIED_FLASH_MS);
  }

  private renderCooldown(slot: SlotView, ticks: number) {
    slot.shownTicks = ticks;
    const remainingMs = ticks * TICK_MS;
    slot.root.classList.toggle("cooling", ticks > 0);
    slot.root.style.setProperty("--cd", String(Math.min(remainingMs / slot.cooldownMs, 1)));
    slot.cooldownText.textContent = ticks > 0 ? String(Math.ceil(remainingMs / 1000)) : "";
  }
}

function iconSvg(skill: SkillDefinition): string {
  const extent = Math.max(...skill.zones.map((zone) => shapeExtent(zone.shape)), 1);
  const scale = ICON_REACH / extent;
  const zones = [...skill.zones]
    .sort((a, b) => shapeExtent(b.shape) - shapeExtent(a.shape))
    .map((zone) => shapeSvg(zone.shape, scale, hex(ZONE_COLORS[zone.kind])))
    .join("");
  const dash =
    skill.delivery.type === "dash"
      ? `<path d="M8 ${ICON_CENTER}h22m-6-6l6 6-6 6" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
      : "";
  return `<svg viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}" aria-hidden="true">${zones}${dash}</svg>`;
}

function shapeExtent(shape: SkillShape): number {
  switch (shape.type) {
    case "line":
      return shape.length;
    case "cone":
    case "circle":
      return shape.radius;
    case "ring":
      return shape.outerRadius;
  }
}

function shapeSvg(shape: SkillShape, scale: number, color: string): string {
  const paint = `fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="2"`;
  switch (shape.type) {
    case "line": {
      const half = Math.max((shape.width * scale) / 2, 2.5);
      return `<rect x="4" y="${ICON_CENTER - half}" width="${ICON_SIZE - 8}" height="${half * 2}" rx="2" ${paint}/>`;
    }
    case "cone": {
      const half = (shape.angleDeg * Math.PI) / 360;
      const radius = ICON_REACH * 1.7;
      const apexX = ICON_CENTER - radius / 2;
      const x = apexX + Math.cos(half) * radius;
      const dy = Math.sin(half) * radius;
      return `<path d="M${apexX} ${ICON_CENTER}L${x} ${ICON_CENTER - dy}A${radius} ${radius} 0 0 1 ${x} ${ICON_CENTER + dy}Z" ${paint}/>`;
    }
    case "circle":
      return `<circle cx="${ICON_CENTER}" cy="${ICON_CENTER}" r="${Math.max(shape.radius * scale, 5)}" ${paint}/>`;
    case "ring": {
      const outer = shape.outerRadius * scale;
      const inner = shape.innerRadius * scale;
      return `<circle cx="${ICON_CENTER}" cy="${ICON_CENTER}" r="${(outer + inner) / 2}" fill="none" stroke="${color}" stroke-opacity="0.8" stroke-width="${outer - inner}"/>`;
    }
  }
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
