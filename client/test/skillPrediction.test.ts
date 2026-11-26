import { describe, expect, it } from "vitest";
import { TICK_DT, getSkill } from "@moba/shared";
import { LocalPredictor } from "../src/game/LocalPredictor.js";

const STATS = { radius: 22, moveSpeed: 300 };
const START = { x: 250, y: 450 };
const RIGHT = { x: 1, y: 0 };

function settled(predictor: LocalPredictor) {
  return predictor.renderPosition(1, 10_000);
}

describe("LocalPredictor with statuses", () => {
  it("applies the slow multiplier to predicted movement", () => {
    const predictor = new LocalPredictor(START, STATS);
    predictor.reconcile(START, 0, { slowPercent: 45, slowTicks: 30 });
    for (let i = 0; i < 5; i++) predictor.predict(RIGHT);
    expect(settled(predictor).x).toBeCloseTo(START.x + 5 * 300 * 0.55 * TICK_DT);
  });

  it("holds still for the stunned inputs and resumes after", () => {
    const predictor = new LocalPredictor(START, STATS);
    predictor.reconcile(START, 0, { stunTicks: 3 });
    for (let i = 0; i < 3; i++) predictor.predict(RIGHT);
    expect(settled(predictor).x).toBeCloseTo(START.x);
    predictor.predict(RIGHT);
    expect(settled(predictor).x).toBeCloseTo(START.x + 300 * TICK_DT);
  });

  it("replays server-driven displacement over pending inputs without snapping back", () => {
    const predictor = new LocalPredictor(START, STATS);
    for (let i = 0; i < 3; i++) predictor.predict({ x: 0, y: 0 });

    const motion = { dirX: 1, dirY: 0, step: 30, remaining: 90 };
    predictor.reconcile(START, 1, { motion });
    expect(settled(predictor).x).toBeCloseTo(START.x + 60);

    predictor.predict(RIGHT);
    expect(settled(predictor).x).toBeCloseTo(START.x + 90);
    predictor.predict(RIGHT);
    expect(settled(predictor).x).toBeCloseTo(START.x + 90 + 300 * TICK_DT);
  });

  it("predicts its own dash and keeps it until the server takes over", () => {
    const predictor = new LocalPredictor(START, STATS);
    const dash = getSkill("bladeShadowDash");
    const step = dash.delivery.type === "dash" ? dash.delivery.speed * TICK_DT : 0;

    predictor.predictCast(dash, { x: 900, y: 450 });
    predictor.predict(RIGHT);
    predictor.predict(RIGHT);
    expect(settled(predictor).x).toBeCloseTo(START.x + 2 * step);

    predictor.reconcile(START, 0);
    expect(settled(predictor).x).toBeCloseTo(START.x + 2 * step);

    predictor.reconcile({ x: START.x + step, y: START.y }, 1, {
      motion: { dirX: 1, dirY: 0, step, remaining: 220 - step },
    });
    expect(settled(predictor).x).toBeCloseTo(START.x + 2 * step);

    for (let i = 0; i < 10; i++) predictor.predict({ x: 0, y: 0 });
    expect(settled(predictor).x).toBeCloseTo(START.x + 220);
  });
});
