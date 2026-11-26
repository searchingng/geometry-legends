import { ARENA, canSeePosition, type GameMap, type Vec2 } from "@moba/shared";

export interface Viewer {
  id: string;
  position: Vec2;
  visionRange: number;
}

export interface Target {
  id: string;
  position: Vec2;
}

interface Reveal {
  targetId: string;
  viewerId: string;
  expiresAtTick: number;
}

export class VisionSystem {
  private reveals: Reveal[] = [];

  constructor(private readonly map: GameMap = ARENA) {}

  reveal(targetId: string, viewerId: string, currentTick: number, durationTicks = Infinity) {
    this.reveals.push({ targetId, viewerId, expiresAtTick: currentTick + durationTicks });
  }

  clearRevealsInvolving(playerId: string) {
    this.reveals = this.reveals.filter(
      (reveal) => reveal.targetId !== playerId && reveal.viewerId !== playerId,
    );
  }

  prune(currentTick: number) {
    this.reveals = this.reveals.filter((reveal) => reveal.expiresAtTick > currentTick);
  }

  canSee(viewer: Viewer, target: Target): boolean {
    if (viewer.id === target.id) return true;
    if (this.isRevealed(viewer.id, target.id)) return true;
    return canSeePosition(this.map, viewer.position, viewer.visionRange, target.position);
  }

  private isRevealed(viewerId: string, targetId: string): boolean {
    return this.reveals.some((reveal) => reveal.viewerId === viewerId && reveal.targetId === targetId);
  }
}
