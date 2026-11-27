import { describe, expect, it } from "vitest";
import { describeSkill, heroStatLines } from "../src/heroInfo.js";
import { HERO_IDS, getHero } from "../src/heroes.js";
import { SKILLS, getSkill } from "../src/skills.js";

describe("hero stat lines", () => {
  it("formats blade stats with melee range and DPS", () => {
    const lines = heroStatLines(getHero("blade"));
    const byLabel = Object.fromEntries(lines.map((line) => [line.label, line.value]));
    expect(byLabel["Health"]).toBe("520 HP");
    expect(byLabel["Move speed"]).toBe("240");
    expect(byLabel["Attack speed"]).toBe("1 hit / 0.7s");
    expect(byLabel["Attack DPS"]).toBe("100");
    expect(byLabel["Attack range"]).toBe("60 (melee)");
  });

  it("keeps ratios within 0..1 and gives the best hero a full bar", () => {
    for (const heroId of HERO_IDS) {
      for (const line of heroStatLines(getHero(heroId))) {
        expect(line.ratio).toBeGreaterThan(0);
        expect(line.ratio).toBeLessThanOrEqual(1);
      }
    }
    const fastest = Math.max(...HERO_IDS.map((id) => getHero(id).moveSpeed));
    const speedRatio = (id: (typeof HERO_IDS)[number]) =>
      heroStatLines(getHero(id)).find((line) => line.label === "Move speed")!.ratio;
    expect(HERO_IDS.some((id) => getHero(id).moveSpeed === fastest && speedRatio(id) === 1)).toBe(true);
  });
});

describe("skill info", () => {
  it("describes a dash with damage along the path", () => {
    const info = describeSkill(getSkill("bladeShadowDash"));
    expect(info.cooldown).toBe("6s");
    expect(info.delivery).toBe("Dash 220, passes walls");
    expect(info.zones).toEqual([{ area: "Line 220×50 from you, hits enemies", effects: ["70 damage"] }]);
  });

  it("lists every effect of a multi-effect zone", () => {
    const info = describeSkill(getSkill("bladeReapingSpin"));
    expect(info.range).toBe("self");
    expect(info.zones[0].effects).toEqual(["140 damage", "Slow 35% for 1.5s"]);
  });

  it("produces text for every skill without undefined values", () => {
    for (const skill of Object.values(SKILLS)) {
      const text = JSON.stringify(describeSkill(skill));
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("NaN");
    }
  });
});
