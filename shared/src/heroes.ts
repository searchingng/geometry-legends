export type HeroShape = "triangle" | "square" | "circle" | "hexagon";

export interface HeroVisual {
  shape: HeroShape;
  color: number;
}

export interface HeroDefinition {
  id: string;
  name: string;
  radius: number;
  moveSpeed: number;
  visual: HeroVisual;
}

export const HEROES = {
  blade: {
    id: "blade",
    name: "Blade",
    radius: 22,
    moveSpeed: 300,
    visual: { shape: "triangle", color: 0xff3d6e },
  },
  bastion: {
    id: "bastion",
    name: "Bastion",
    radius: 26,
    moveSpeed: 240,
    visual: { shape: "square", color: 0x3dc8ff },
  },
} as const satisfies Record<string, HeroDefinition>;

export type HeroId = keyof typeof HEROES;

export const HERO_IDS = Object.keys(HEROES) as HeroId[];

export function getHero(id: HeroId): HeroDefinition {
  return HEROES[id];
}
