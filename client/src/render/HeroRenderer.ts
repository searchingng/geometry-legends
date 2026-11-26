import type { Object3D } from "three";
import type { HeroDefinition, Vec2 } from "@moba/shared";

export interface HeroView {
  readonly root: Object3D;
  update(position: Vec2, frameMs: number): void;
  setVisible(visible: boolean): void;
  setConcealed(concealed: boolean): void;
  setHealth(fraction: number): void;
  flash(): void;
  destroy(): void;
}

export interface HeroRenderer {
  create(hero: HeroDefinition, isLocal: boolean): HeroView;
}
