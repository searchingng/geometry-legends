import {
  ARENA,
  CREEP_WAVE,
  CREEP_WAVE_INTERVAL_MS,
  CREEP_WAVE_SPACING,
  FIRST_CREEP_WAVE_MS,
  LANE_Y,
  STRUCTURES,
  TICK_DT,
  TICK_MS,
  UNIT_STATS,
  canSeePosition,
  creepSpawnPoint,
  distanceSq,
  isStructureKind,
  laneDirection,
  normalize,
  opposingTeam,
  settleOutOfWalls,
  type CombatEvent,
  type Team,
  type UnitKind,
  type Vec2,
  type VisibleUnit,
} from "@moba/shared";

const CREEP_WAVE_TICKS = Math.round(CREEP_WAVE_INTERVAL_MS / TICK_MS);
const FIRST_WAVE_TICKS = Math.round(FIRST_CREEP_WAVE_MS / TICK_MS);
const HELP_AGGRO_TICKS = 60;
const CREEP_LEASH_FACTOR = 1.25;
const CREEP_SPACING = 4;
const LANE_SNAP = 4;
const LANE_LOOKAHEAD = 80;

export interface Unit {
  id: string;
  kind: UnitKind;
  team: Team;
  position: Vec2;
  hp: number;
  nextAttackTick: number;
  targetId: string | null;
  forcedTargetId: string | null;
  forcedUntilTick: number;
}

export interface UnitHero {
  id: string;
  team: Team;
  position: Vec2;
  radius: number;
}

export interface UnitWorld {
  readonly tick: number;
  readonly heroes: readonly UnitHero[];
  damageHero(heroId: string, amount: number, source: Unit): void;
  emit(event: CombatEvent): void;
}

export interface UnitListener {
  baseDestroyed(team: Team, killerId: string): void;
}

interface Target {
  id: string;
  position: Vec2;
  radius: number;
  hero: boolean;
  creep: boolean;
}

export class UnitSystem {
  private units: Unit[] = [];
  private nextCreepId = 1;
  private nextWaveTick: number | null = null;

  constructor(private readonly listener: UnitListener) {
    this.reset();
  }

  reset() {
    this.units = STRUCTURES.map(({ kind, team, position }) => createUnit(`${kind}${team}`, kind, team, position));
    this.nextWaveTick = null;
  }

  startWaves(tick: number) {
    this.nextWaveTick = tick + FIRST_WAVE_TICKS;
  }

  all(): readonly Unit[] {
    return this.units;
  }

  get(id: string): Unit | undefined {
    return this.units.find((unit) => unit.id === id);
  }

  isTargetable(unit: Unit): boolean {
    if (unit.hp <= 0) return false;
    if (unit.kind !== "base") return true;
    return !this.units.some((other) => other.kind === "turret" && other.team === unit.team && other.hp > 0);
  }

  hostileTargets(team: Team): Unit[] {
    return this.units.filter((unit) => unit.team !== team && this.isTargetable(unit));
  }

  hostileCreeps(team: Team): Unit[] {
    return this.units.filter((unit) => unit.team !== team && !isStructureKind(unit.kind) && unit.hp > 0);
  }

  teamSees(team: Team, point: Vec2): boolean {
    return this.units.some(
      (unit) => unit.team === team && unit.hp > 0 && canSeePosition(ARENA, unit.position, UNIT_STATS[unit.kind].visionRange, point),
    );
  }

  damage(unitId: string, amount: number, sourceId: string): number {
    const unit = this.get(unitId);
    if (!unit || !this.isTargetable(unit)) return 0;
    const dealt = Math.min(unit.hp, amount);
    unit.hp -= dealt;
    if (unit.hp === 0) this.destroy(unit, sourceId);
    return dealt;
  }

  callForHelp(attacker: UnitHero, victimPosition: Vec2, tick: number) {
    for (const unit of this.units) {
      if (unit.team === attacker.team || unit.hp <= 0) continue;
      const stats = UNIT_STATS[unit.kind];
      const responds =
        isStructureKind(unit.kind)
          ? withinReach(unit, stats.attackRange + stats.radius + attacker.radius, attacker.position)
          : withinReach(unit, stats.visionRange, victimPosition);
      if (!responds) continue;
      unit.forcedTargetId = attacker.id;
      unit.forcedUntilTick = tick + HELP_AGGRO_TICKS;
    }
  }

  forget(targetId: string) {
    for (const unit of this.units) {
      if (unit.targetId === targetId) unit.targetId = null;
      if (unit.forcedTargetId === targetId) unit.forcedTargetId = null;
    }
  }

  update(world: UnitWorld) {
    if (this.nextWaveTick !== null && world.tick >= this.nextWaveTick) {
      this.nextWaveTick = world.tick + CREEP_WAVE_TICKS;
      this.spawnWave(0);
      this.spawnWave(1);
    }

    const targetsByTeam: [Target[], Target[]] = [this.targetsFor(0, world), this.targetsFor(1, world)];
    for (const unit of [...this.units]) {
      if (unit.hp <= 0 || UNIT_STATS[unit.kind].attackDamage === 0) continue;
      this.act(unit, targetsByTeam[unit.team], world);
    }
  }

  visibleUnits(isVisible: (unit: Unit) => boolean): VisibleUnit[] {
    return this.units
      .filter((unit) => unit.hp > 0 && isVisible(unit))
      .map((unit) => ({ id: unit.id, kind: unit.kind, team: unit.team, x: unit.position.x, y: unit.position.y, hp: unit.hp }));
  }

  private spawnWave(team: Team) {
    const spawn = creepSpawnPoint(team);
    const back = -laneDirection(team);
    CREEP_WAVE.forEach((kind, index) => {
      const offset = (index - (CREEP_WAVE.length - 1) / 2) * CREEP_WAVE_SPACING;
      const position = { x: spawn.x + back * Math.abs(offset) * 0.5, y: spawn.y + offset };
      this.units.push(createUnit(`c${this.nextCreepId++}`, kind, team, position));
    });
  }

  private targetsFor(team: Team, world: UnitWorld): Target[] {
    const targets: Target[] = [];
    for (const hero of world.heroes) {
      if (hero.team !== team) targets.push({ id: hero.id, position: hero.position, radius: hero.radius, hero: true, creep: false });
    }
    for (const unit of this.hostileTargets(team)) {
      targets.push({
        id: unit.id,
        position: unit.position,
        radius: UNIT_STATS[unit.kind].radius,
        hero: false,
        creep: !isStructureKind(unit.kind),
      });
    }
    return targets;
  }

  private act(unit: Unit, targets: readonly Target[], world: UnitWorld) {
    const stats = UNIT_STATS[unit.kind];
    const target = this.chooseTarget(unit, targets, world.tick);
    unit.targetId = target?.id ?? null;

    if (target && withinReach(unit, stats.attackRange + stats.radius + target.radius, target.position)) {
      if (world.tick >= unit.nextAttackTick) this.attack(unit, target, world);
      return;
    }
    if (stats.moveSpeed === 0) return;
    this.move(unit, target ? target.position : laneGoal(unit));
  }

  private chooseTarget(unit: Unit, targets: readonly Target[], tick: number): Target | undefined {
    const acquire = (target: Target, factor = 1) => {
      const stats = UNIT_STATS[unit.kind];
      const reach = isStructureKind(unit.kind) ? stats.attackRange + stats.radius + target.radius : stats.visionRange * factor;
      if (!withinReach(unit, reach, target.position)) return false;
      return !target.hero || canSeePosition(ARENA, unit.position, UNIT_STATS[unit.kind].visionRange * factor, target.position);
    };

    if (unit.forcedTargetId !== null) {
      const forced = targets.find((target) => target.id === unit.forcedTargetId);
      if (tick < unit.forcedUntilTick && forced && acquire(forced, CREEP_LEASH_FACTOR)) return forced;
      unit.forcedTargetId = null;
    }

    const current = targets.find((target) => target.id === unit.targetId);
    if (current && acquire(current, CREEP_LEASH_FACTOR)) return current;

    return (
      nearest(unit, targets.filter((target) => target.creep && acquire(target))) ??
      nearest(unit, targets.filter((target) => !target.creep && acquire(target)))
    );
  }

  private attack(unit: Unit, target: Target, world: UnitWorld) {
    const stats = UNIT_STATS[unit.kind];
    unit.nextAttackTick = world.tick + Math.ceil(stats.attackCooldownMs / TICK_MS);
    world.emit({ kind: "hit", attackerId: unit.id, targetId: target.id, damage: stats.attackDamage });
    if (target.hero) world.damageHero(target.id, stats.attackDamage, unit);
    else this.damage(target.id, stats.attackDamage, unit.id);
  }

  private move(unit: Unit, goal: Vec2) {
    const stats = UNIT_STATS[unit.kind];
    const direction = normalize(goal.x - unit.position.x, goal.y - unit.position.y);
    const step = Math.min(stats.moveSpeed * TICK_DT, Math.sqrt(distanceSq(unit.position, goal)));
    const next = { x: unit.position.x + direction.x * step, y: unit.position.y + direction.y * step };
    unit.position = settleOutOfWalls(this.separate(unit, next), stats.radius, ARENA);
  }

  private separate(unit: Unit, position: Vec2): Vec2 {
    let { x, y } = position;
    const radius = UNIT_STATS[unit.kind].radius;
    for (const other of this.units) {
      if (other === unit || other.team !== unit.team || other.hp <= 0 || isStructureKind(other.kind)) continue;
      const minDistance = radius + UNIT_STATS[other.kind].radius + CREEP_SPACING;
      const dx = x - other.position.x;
      const dy = y - other.position.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDistance * minDistance || distSq === 0) continue;
      const dist = Math.sqrt(distSq);
      const push = (minDistance - dist) / 2;
      x += (dx / dist) * push;
      y += (dy / dist) * push;
    }
    return { x, y };
  }

  private destroy(unit: Unit, killerId: string) {
    this.units = this.units.filter((candidate) => candidate !== unit);
    this.forget(unit.id);
    if (unit.kind === "base") this.listener.baseDestroyed(unit.team, killerId);
  }
}

function createUnit(id: string, kind: UnitKind, team: Team, position: Vec2): Unit {
  return {
    id,
    kind,
    team,
    position: { ...position },
    hp: UNIT_STATS[kind].maxHp,
    nextAttackTick: 0,
    targetId: null,
    forcedTargetId: null,
    forcedUntilTick: 0,
  };
}

function laneGoal(unit: Unit): Vec2 {
  const enemyBase = STRUCTURES.find((structure) => structure.kind === "base" && structure.team === opposingTeam(unit.team))!;
  if (Math.abs(unit.position.y - LANE_Y) <= LANE_SNAP) return enemyBase.position;
  return { x: unit.position.x + laneDirection(unit.team) * LANE_LOOKAHEAD, y: LANE_Y };
}

function withinReach(unit: Unit, reach: number, point: Vec2): boolean {
  return distanceSq(unit.position, point) <= reach * reach;
}

function nearest(unit: Unit, targets: readonly Target[]): Target | undefined {
  let best: Target | undefined;
  let bestDistance = Infinity;
  for (const target of targets) {
    const distance = distanceSq(unit.position, target.position);
    if (distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}
