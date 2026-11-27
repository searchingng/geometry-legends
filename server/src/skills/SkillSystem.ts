import {
  ARENA,
  TICK_DT,
  advanceMotion,
  distanceToSegment,
  getHero,
  getSkill,
  normalize,
  planDash,
  resolveSkillAim,
  segmentObstacleEntry,
  settleOutOfWalls,
  shapeHits,
  sweepCircle,
  type CombatEvent,
  type GameMap,
  type ForcedMotion,
  type HeroId,
  type SkillDefinition,
  type SkillId,
  type SkillShape,
  type StatusAppliedEvent,
  type StatusKind,
  type SkillSlot,
  type SkillZone,
  type Vec2,
  type VisibleProjectile,
  type VisibleZone,
} from "@moba/shared";
import {
  absorbDamage,
  addShield,
  applySlow,
  applyStun,
  canAct,
  isProtected,
  msToTicks,
  setMotion,
  type CombatStatus,
} from "./CombatStatus.js";

export interface SkillActor {
  id: string;
  heroId: HeroId;
  position: Vec2;
  hp: number;
  status: CombatStatus;
  skillReadyTick: [number, number, number];
}

export interface DamageResult {
  dealt: number;
  absorbed: number;
}

export interface CreepTarget {
  id: string;
  position: Vec2;
  radius: number;
}

export interface SkillWorld<A extends SkillActor> {
  readonly tick: number;
  readonly actors: readonly A[];
  creepsHostileTo?(caster: A): readonly CreepTarget[];
  damageCreep?(creepId: string, amount: number, source: A): number;
  isAlive(actor: A): boolean;
  damage(target: A, amount: number, source: A): DamageResult;
  reveal(targetId: string, viewerId: string, ticks: number): void;
  emit(event: CombatEvent): void;
}

export type PointVisibility = (point: Vec2, casterId: string) => boolean;

export interface ZoneArea {
  origin: Vec2;
  direction: Vec2;
  shape: SkillShape;
  anchor: SkillZone["anchor"];
  casterId: string;
}

export type ZoneVisibility = (zone: ZoneArea) => boolean;

interface Projectile<A> {
  id: number;
  caster: A;
  skillId: SkillId;
  position: Vec2;
  direction: Vec2;
  speed: number;
  traveled: number;
  range: number;
  hitRadius: number;
}

interface PendingZone<A> {
  id: number;
  caster: A;
  skillId: SkillId;
  zoneIndex: number;
  origin: Vec2;
  direction: Vec2;
  triggerTick: number;
  delayTicks: number;
}

interface Dash<A> {
  caster: A;
  skillId: SkillId;
  start: Vec2;
  direction: Vec2;
  swept: Set<string>;
}

const KNOCKBACK_SPEED = 1300;
const CONTACT_MARGIN = 10;
const DEFAULT_PROJECTILE_RADIUS = 15;
const OPEN_ARENA: GameMap = { ...ARENA, walls: [] };

export class SkillSystem<A extends SkillActor> {
  private nextId = 1;
  private projectiles: Projectile<A>[] = [];
  private zones: PendingZone<A>[] = [];
  private readonly dashes = new Map<string, Dash<A>>();

  cast(caster: A, slot: SkillSlot, aim: Vec2, world: SkillWorld<A>): boolean {
    const tick = world.tick;
    if (!world.isAlive(caster) || !canAct(caster.status, tick) || tick < caster.skillReadyTick[slot]) return false;

    const skillId = getHero(caster.heroId).skills[slot];
    const skill = getSkill(skillId);
    const { direction, point } = resolveSkillAim(skill, caster.position, aim);
    caster.skillReadyTick[slot] = tick + msToTicks(skill.cooldownMs);
    caster.status.protectedUntilTick = 0;
    world.emit({
      kind: "skillCast",
      casterId: caster.id,
      skillId,
      slot,
      x: caster.position.x,
      y: caster.position.y,
      dirX: direction.x,
      dirY: direction.y,
      aimX: point.x,
      aimY: point.y,
    });

    const delivery = skill.delivery;
    if (delivery.type === "projectile") {
      this.launch(caster, skillId, skill, direction, delivery.speed);
    } else if (delivery.type === "dash") {
      const distance = skill.aim === "direction" ? delivery.distance : Math.min(delivery.distance, distanceBetween(caster.position, point));
      const radius = getHero(caster.heroId).radius;
      this.startDash(caster, skillId, direction, planDash(caster.position, direction, distance, delivery.speed * TICK_DT, delivery.wallMode, radius, ARENA));
    } else {
      skill.zones.forEach((zone, index) => {
        const origin = zone.anchor === "aimPoint" ? point : caster.position;
        this.placeZone(caster, skillId, index, { ...origin }, direction, world);
      });
    }
    return true;
  }

  update(world: SkillWorld<A>) {
    this.advanceMotions(world);
    this.advanceProjectiles(world);
    this.triggerZones(world);
  }

  cancelDash(actorId: string) {
    this.dashes.delete(actorId);
  }

  reset() {
    this.projectiles = [];
    this.zones = [];
    this.dashes.clear();
  }

  removeActor(actorId: string) {
    this.dashes.delete(actorId);
    this.projectiles = this.projectiles.filter((projectile) => projectile.caster.id !== actorId);
    this.zones = this.zones.filter((zone) => zone.caster.id !== actorId);
  }

  visibleProjectiles(isVisible: PointVisibility): VisibleProjectile[] {
    return this.projectiles
      .filter((projectile) => isVisible(projectile.position, projectile.caster.id))
      .map((projectile) => ({
        id: projectile.id,
        skillId: projectile.skillId,
        casterId: projectile.caster.id,
        x: projectile.position.x,
        y: projectile.position.y,
        dirX: projectile.direction.x,
        dirY: projectile.direction.y,
        speed: projectile.speed,
      }));
  }

  visibleZones(isVisible: ZoneVisibility, tick: number): VisibleZone[] {
    return this.zones
      .filter((zone) => {
        const definition = zoneOf(zone);
        return isVisible({
          origin: zone.origin,
          direction: zone.direction,
          shape: definition.shape,
          anchor: definition.anchor,
          casterId: zone.caster.id,
        });
      })
      .map((zone) => ({
        id: zone.id,
        skillId: zone.skillId,
        zoneIndex: zone.zoneIndex,
        casterId: zone.caster.id,
        x: zone.origin.x,
        y: zone.origin.y,
        dirX: zone.direction.x,
        dirY: zone.direction.y,
        remainingTicks: Math.max(0, zone.triggerTick - tick),
        delayTicks: zone.delayTicks,
      }));
  }

  private launch(caster: A, skillId: SkillId, skill: SkillDefinition, direction: Vec2, speed: number) {
    const line = skill.zones.find((zone) => zone.shape.type === "line")?.shape;
    this.projectiles.push({
      id: this.nextId++,
      caster,
      skillId,
      position: { ...caster.position },
      direction,
      speed,
      traveled: 0,
      range: skill.range,
      hitRadius: line?.type === "line" ? line.width / 2 : DEFAULT_PROJECTILE_RADIUS,
    });
  }

  private startDash(caster: A, skillId: SkillId, direction: Vec2, motion: ForcedMotion) {
    if (motion.remaining <= 0) return;
    setMotion(caster.status, motion, "dash");
    this.dashes.set(caster.id, { caster, skillId, start: { ...caster.position }, direction, swept: new Set() });
  }

  private placeZone(caster: A, skillId: SkillId, zoneIndex: number, origin: Vec2, direction: Vec2, world: SkillWorld<A>) {
    const zone = getSkill(skillId).zones[zoneIndex];
    if (zone.delayMs) {
      const delayTicks = msToTicks(zone.delayMs);
      this.zones.push({
        id: this.nextId++,
        caster,
        skillId,
        zoneIndex,
        origin,
        direction,
        triggerTick: world.tick + delayTicks,
        delayTicks,
      });
      return;
    }
    this.resolveZone(caster, skillId, zoneIndex, origin, direction, world);
  }

  private resolveZone(caster: A, skillId: SkillId, zoneIndex: number, origin: Vec2, direction: Vec2, world: SkillWorld<A>) {
    const zone = getSkill(skillId).zones[zoneIndex];
    world.emit({ kind: "skillZone", casterId: caster.id, skillId, zoneIndex, x: origin.x, y: origin.y, dirX: direction.x, dirY: direction.y });

    if (zone.targets === "self") {
      if (world.isAlive(caster)) this.applyEffects(caster, caster, skillId, zone, origin, direction, world);
      return;
    }
    for (const target of this.enemiesOf(caster, world)) {
      if (shapeHits(zone.shape, origin, direction, target.position, getHero(target.heroId).radius)) {
        this.applyEffects(caster, target, skillId, zone, origin, direction, world);
      }
    }
    for (const creep of creepsOf(caster, world)) {
      if (shapeHits(zone.shape, origin, direction, creep.position, creep.radius)) this.hitCreep(caster, creep, skillId, zone, world);
    }
  }

  private hitCreep(caster: A, creep: CreepTarget, skillId: SkillId, zone: SkillZone, world: SkillWorld<A>) {
    let damage = 0;
    for (const effect of zone.effects) {
      if (effect.type === "damage") damage += world.damageCreep?.(creep.id, effect.amount, caster) ?? 0;
    }
    if (damage > 0) world.emit({ kind: "skillHit", casterId: caster.id, targetId: creep.id, skillId, damage, absorbed: 0, healed: 0 });
  }

  private applyEffects(caster: A, target: A, skillId: SkillId, zone: SkillZone, origin: Vec2, direction: Vec2, world: SkillWorld<A>) {
    const tick = world.tick;
    if (target !== caster && isProtected(target.status, tick)) return;
    const applied = (status: StatusKind, details: Partial<StatusAppliedEvent>) =>
      world.emit({ kind: "statusApplied", targetId: target.id, sourceId: caster.id, status, ...details });
    let damage = 0;
    let absorbed = 0;
    let healed = 0;

    for (const effect of zone.effects) {
      if (!world.isAlive(target)) break;
      switch (effect.type) {
        case "damage": {
          const result = world.damage(target, effect.amount, caster);
          damage += result.dealt;
          absorbed += result.absorbed;
          break;
        }
        case "stun": {
          const passing = target.status.motion?.passWalls === true;
          applyStun(target.status, msToTicks(effect.durationMs), tick);
          if (target.status.motion === null) this.dashes.delete(target.id);
          if (passing && target.status.motion === null) settle(target);
          applied("stun", { durationTicks: msToTicks(effect.durationMs) });
          break;
        }
        case "slow":
          applySlow(target.status, effect.percent, msToTicks(effect.durationMs), tick);
          applied("slow", { durationTicks: msToTicks(effect.durationMs), percent: effect.percent });
          break;
        case "knockback":
          this.knockback(target, origin, direction, effect.distance);
          applied("knockback", { distance: effect.distance });
          break;
        case "reveal":
          world.reveal(target.id, caster.id, msToTicks(effect.durationMs));
          break;
        case "shield":
          addShield(target.status, effect.amount, msToTicks(effect.durationMs), tick);
          applied("shield", { durationTicks: msToTicks(effect.durationMs), amount: effect.amount });
          break;
        case "heal": {
          const missing = getHero(target.heroId).maxHp - target.hp;
          const amount = Math.max(0, Math.min(missing, effect.amount));
          target.hp += amount;
          healed += amount;
          break;
        }
      }
    }

    world.emit({ kind: "skillHit", casterId: caster.id, targetId: target.id, skillId, damage, absorbed, healed });
  }

  private knockback(target: A, origin: Vec2, direction: Vec2, distance: number) {
    const away = normalize(target.position.x - origin.x, target.position.y - origin.y);
    const push = away.x === 0 && away.y === 0 ? direction : away;
    this.dashes.delete(target.id);
    if (target.status.motion?.passWalls) settle(target);
    setMotion(
      target.status,
      { dirX: push.x, dirY: push.y, step: KNOCKBACK_SPEED * TICK_DT, remaining: distance },
      "knockback",
    );
  }

  private advanceMotions(world: SkillWorld<A>) {
    for (const actor of world.actors) {
      const motion = actor.status.motion;
      if (!motion || !world.isAlive(actor)) continue;

      const dash = this.dashes.get(actor.id);
      const contactT = dash ? this.contactAlong(dash, motion, world) : null;
      const limited = contactT === null ? motion : { ...motion, remaining: Math.min(motion.remaining, motion.step * contactT) };

      const before = actor.position;
      const result = advanceMotion(before, limited, getHero(actor.heroId).radius, ARENA);
      actor.position = result.position;
      setMotion(actor.status, contactT === null ? result.motion : null, actor.status.motionKind);
      if (contactT !== null && motion.passWalls) settle(actor);

      if (!dash) continue;
      this.sweepDash(dash, before, actor.position, world);
      if (actor.status.motion === null && this.dashes.get(actor.id) === dash) this.finishDash(dash, world);
    }
  }

  private contactAlong(dash: Dash<A>, motion: ForcedMotion, world: SkillWorld<A>): number | null {
    if (!getSkill(dash.skillId).zones.some((zone) => zone.anchor === "dashEnd")) return null;
    const from = dash.caster.position;
    const step = Math.min(motion.step, motion.remaining);
    const to = { x: from.x + motion.dirX * step, y: from.y + motion.dirY * step };
    const casterRadius = getHero(dash.caster.heroId).radius;

    let earliest: number | null = null;
    for (const enemy of this.enemiesOf(dash.caster, world)) {
      const t = sweepCircle(from, to, enemy.position, casterRadius + getHero(enemy.heroId).radius + CONTACT_MARGIN);
      if (t !== null && (earliest === null || t < earliest)) earliest = t;
    }
    return earliest;
  }

  private sweepDash(dash: Dash<A>, from: Vec2, to: Vec2, world: SkillWorld<A>) {
    const skill = getSkill(dash.skillId);
    skill.zones.forEach((zone, index) => {
      if (zone.anchor !== "caster" || zone.targets !== "enemy" || zone.shape.type !== "line") return;
      const reach = zone.shape.width / 2;
      for (const target of this.enemiesOf(dash.caster, world)) {
        const key = `${index}:${target.id}`;
        if (dash.swept.has(key)) continue;
        if (distanceToSegment(target.position, from, to) > reach + getHero(target.heroId).radius) continue;
        dash.swept.add(key);
        this.applyEffects(dash.caster, target, dash.skillId, zone, dash.start, dash.direction, world);
      }
      for (const creep of creepsOf(dash.caster, world)) {
        const key = `${index}:${creep.id}`;
        if (dash.swept.has(key) || distanceToSegment(creep.position, from, to) > reach + creep.radius) continue;
        dash.swept.add(key);
        this.hitCreep(dash.caster, creep, dash.skillId, zone, world);
      }
    });
  }

  private finishDash(dash: Dash<A>, world: SkillWorld<A>) {
    this.dashes.delete(dash.caster.id);
    setMotion(dash.caster.status, null, null);

    const skill = getSkill(dash.skillId);
    const end = { ...dash.caster.position };
    skill.zones.forEach((zone, index) => {
      if (zone.anchor === "dashEnd") {
        this.placeZone(dash.caster, dash.skillId, index, end, dash.direction, world);
      } else if (zone.anchor === "caster" && zone.shape.type === "line") {
        world.emit({
          kind: "skillZone",
          casterId: dash.caster.id,
          skillId: dash.skillId,
          zoneIndex: index,
          x: dash.start.x,
          y: dash.start.y,
          dirX: dash.direction.x,
          dirY: dash.direction.y,
          length: distanceBetween(dash.start, end),
        });
      }
    });
  }

  private advanceProjectiles(world: SkillWorld<A>) {
    this.projectiles = this.projectiles.filter((projectile) => this.advanceProjectile(projectile, world));
  }

  private advanceProjectile(projectile: Projectile<A>, world: SkillWorld<A>): boolean {
    const stepLength = Math.min(projectile.speed * TICK_DT, projectile.range - projectile.traveled);
    const from = projectile.position;
    const to = {
      x: from.x + projectile.direction.x * stepLength,
      y: from.y + projectile.direction.y * stepLength,
    };

    let hitT = Infinity;
    let hitTarget: A | undefined;
    for (const enemy of this.enemiesOf(projectile.caster, world)) {
      const t = sweepCircle(from, to, enemy.position, projectile.hitRadius + getHero(enemy.heroId).radius);
      if (t !== null && t < hitT) {
        hitT = t;
        hitTarget = enemy;
      }
    }
    let hitCreep: CreepTarget | undefined;
    for (const creep of creepsOf(projectile.caster, world)) {
      const t = sweepCircle(from, to, creep.position, projectile.hitRadius + creep.radius);
      if (t !== null && t < hitT) {
        hitT = t;
        hitCreep = creep;
        hitTarget = undefined;
      }
    }
    const boundsT = segmentObstacleEntry(from, to, OPEN_ARENA) ?? Infinity;

    if (hitCreep && hitT <= boundsT) {
      this.endProjectile(projectile, lerpPoint(from, to, hitT), world, hitCreep.id);
      for (const zone of getSkill(projectile.skillId).zones) this.hitCreep(projectile.caster, hitCreep, projectile.skillId, zone, world);
      return false;
    }
    if (hitTarget && hitT <= boundsT) {
      const at = lerpPoint(from, to, hitT);
      this.endProjectile(projectile, at, world, hitTarget.id);
      for (const zone of getSkill(projectile.skillId).zones) {
        this.applyEffects(projectile.caster, hitTarget, projectile.skillId, zone, at, projectile.direction, world);
      }
      return false;
    }
    if (boundsT !== Infinity) {
      this.endProjectile(projectile, lerpPoint(from, to, boundsT), world);
      return false;
    }

    projectile.position = to;
    projectile.traveled += stepLength;
    if (projectile.traveled >= projectile.range - 0.01) {
      this.endProjectile(projectile, to, world);
      return false;
    }
    return true;
  }

  private endProjectile(projectile: Projectile<A>, at: Vec2, world: SkillWorld<A>, targetId?: string) {
    world.emit({
      kind: "projectileEnd",
      projectileId: projectile.id,
      casterId: projectile.caster.id,
      skillId: projectile.skillId,
      x: at.x,
      y: at.y,
      ...(targetId === undefined ? {} : { targetId }),
    });
  }

  private triggerZones(world: SkillWorld<A>) {
    const due = this.zones.filter((zone) => zone.triggerTick <= world.tick);
    if (due.length === 0) return;
    this.zones = this.zones.filter((zone) => zone.triggerTick > world.tick);
    for (const zone of due) {
      this.resolveZone(zone.caster, zone.skillId, zone.zoneIndex, zone.origin, zone.direction, world);
    }
  }

  private enemiesOf(caster: A, world: SkillWorld<A>): A[] {
    return world.actors.filter((actor) => actor.id !== caster.id && world.isAlive(actor));
  }
}

export function dealDamage(target: SkillActor, amount: number, tick: number): DamageResult {
  const absorbed = absorbDamage(target.status, amount, tick);
  const dealt = Math.min(target.hp, amount - absorbed);
  target.hp -= dealt;
  return { dealt, absorbed };
}

function creepsOf<A extends SkillActor>(caster: A, world: SkillWorld<A>): readonly CreepTarget[] {
  return world.creepsHostileTo?.(caster) ?? [];
}

function zoneOf(zone: { skillId: SkillId; zoneIndex: number }): SkillZone {
  return getSkill(zone.skillId).zones[zone.zoneIndex];
}

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerpPoint(from: Vec2, to: Vec2, t: number): Vec2 {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

function settle(actor: SkillActor) {
  actor.position = settleOutOfWalls(actor.position, getHero(actor.heroId).radius, ARENA);
}
