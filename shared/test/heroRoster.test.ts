import { describe, expect, it } from "vitest";
import { HERO_IDS, getHero } from "../src/heroes.js";
import { SKILLS } from "../src/skills.js";

const AIMS = ["direction", "point", "none"];
const DELIVERIES = ["instant", "projectile", "dash"];
const KINDS = ["damage", "control", "utility"];
const ANCHORS = ["caster", "aimPoint", "dashEnd"];
const SHAPES = ["line", "cone", "circle", "ring"];
const TARGETS = ["enemy", "self"];
const EFFECTS = ["damage", "stun", "slow", "knockback", "reveal", "shield", "heal"];

describe("hero roster", () => {
  it("has 10 heroes with distinct shapes and colors", () => {
    expect(HERO_IDS).toHaveLength(10);
    expect(new Set(HERO_IDS.map((id) => getHero(id).visual.shape)).size).toBe(10);
    expect(new Set(HERO_IDS.map((id) => getHero(id).visual.color)).size).toBe(10);
  });

  it("references only existing skills, none shared between heroes", () => {
    const used = HERO_IDS.flatMap((id) => getHero(id).skills);
    for (const skillId of used) expect(Object.hasOwn(SKILLS, skillId)).toBe(true);
    expect(new Set(used).size).toBe(used.length);
  });
});

describe("skill contract", () => {
  for (const skill of Object.values(SKILLS)) {
    it(`${skill.id} uses only contract types`, () => {
      expect(AIMS).toContain(skill.aim);
      expect(DELIVERIES).toContain(skill.delivery.type);
      expect(skill.cooldownMs).toBeGreaterThan(0);
      expect(skill.zones.length).toBeGreaterThan(0);
      for (const zone of skill.zones) {
        expect(KINDS).toContain(zone.kind);
        expect(ANCHORS).toContain(zone.anchor);
        expect(SHAPES).toContain(zone.shape.type);
        expect(TARGETS).toContain(zone.targets);
        expect(zone.effects.length).toBeGreaterThan(0);
        for (const effect of zone.effects) expect(EFFECTS).toContain(effect.type);
        if (skill.delivery.type === "projectile") expect(zone.targets).toBe("enemy");
        if (skill.delivery.type === "dash") {
          expect(zone.anchor === "dashEnd" || zone.shape.type === "line").toBe(true);
        }
      }
    });
  }
});
