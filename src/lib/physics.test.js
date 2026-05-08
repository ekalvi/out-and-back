import { describe, it, expect } from "vitest";
import {
  solveSpeedFromPower,
  findPowerForAvg,
  findPowerBackForAvgSpeed,
  impliedCdAFromSplits,
  impliedCdAFromSingleSpeed,
  impliedWindSpeedFromSplits,
  optimizePowerSplit,
} from "./physics.js";

const PHYSICS = { cda: 0.25, mass: 84, crr: 0.004, lossDtPct: 2, rho: 1.225, draft: 1.0 };

describe("solveSpeedFromPower", () => {
  it("scales monotonically with power on a flat, calm course", () => {
    const v100 = solveSpeedFromPower({ ...PHYSICS, power: 100, vhwMs: 0, gradePct: 0 });
    const v200 = solveSpeedFromPower({ ...PHYSICS, power: 200, vhwMs: 0, gradePct: 0 });
    const v400 = solveSpeedFromPower({ ...PHYSICS, power: 400, vhwMs: 0, gradePct: 0 });
    expect(v100).toBeLessThan(v200);
    expect(v200).toBeLessThan(v400);
  });

  it("produces a plausible speed for a typical-rider 250 W flat-and-calm ride", () => {
    const v = solveSpeedFromPower({ ...PHYSICS, power: 250, vhwMs: 0, gradePct: 0 });
    const kph = v * 3.6;
    // Typical drops/clip-ons rider at 250 W lands in the high 30s kph.
    expect(kph).toBeGreaterThan(35);
    expect(kph).toBeLessThan(45);
  });

  it("produces an out-and-back time penalty at fixed power vs the calm baseline (harmonic-mean cost)", () => {
    const calm = solveSpeedFromPower({ ...PHYSICS, power: 250, vhwMs: 0, gradePct: 0 });
    const head = solveSpeedFromPower({ ...PHYSICS, power: 250, vhwMs: +3, gradePct: 0 });
    const tail = solveSpeedFromPower({ ...PHYSICS, power: 250, vhwMs: -3, gradePct: 0 });
    const distHalf = 8000;
    const tCalm = distHalf / calm + distHalf / calm;
    const tWindy = distHalf / head + distHalf / tail;
    expect(tWindy).toBeGreaterThan(tCalm);
  });

  it("reproduces the bot-flagged solver-stuck case (regression marker)", () => {
    // 120 W with 1 kph parallel headwind on a 5.8% climb: real root is ~18.49 m/s,
    // but the current Newton's solver clamps to 0.05 m/s and stays there.
    // This test pins the broken behavior so a fix is detectable.
    const v = solveSpeedFromPower({
      ...PHYSICS, power: 120, vhwMs: -1 / 3.6, gradePct: -5.8,
    });
    expect(v).toBeCloseTo(0.05, 5);
  });
});

describe("findPowerForAvg", () => {
  it("round-trips: forward harmonic-mean of leg powers equals the target", () => {
    const targetAvg = 240;
    const powerOut = 230;
    const physics = PHYSICS;
    const vhwOutMs = 2, vhwBackMs = -2, gradeOut = 0, gradeBack = 0;
    const powerBack = findPowerForAvg({
      targetAvg, fixedPower: powerOut, fixedLeg: "out",
      physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack,
    });
    const vOut = solveSpeedFromPower({ ...physics, power: powerOut, vhwMs: vhwOutMs, gradePct: gradeOut });
    const vBack = solveSpeedFromPower({ ...physics, power: powerBack, vhwMs: vhwBackMs, gradePct: gradeBack });
    const actualAvg = (powerOut / vOut + powerBack / vBack) / (1 / vOut + 1 / vBack);
    expect(actualAvg).toBeCloseTo(targetAvg, 0);
  });
});

describe("findPowerBackForAvgSpeed", () => {
  it("round-trips: time-weighted avg speed of the resulting leg-pair equals the target", () => {
    const targetAvgSpeedKph = 38;
    const fixedPowerOut = 240;
    const physics = PHYSICS;
    const vhwOutMs = 2, vhwBackMs = -2, gradeOut = 0, gradeBack = 0;
    const powerBack = findPowerBackForAvgSpeed({
      targetAvgSpeedKph, fixedPowerOut, physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack,
    });
    const vOutKph = solveSpeedFromPower({ ...physics, power: fixedPowerOut, vhwMs: vhwOutMs, gradePct: gradeOut }) * 3.6;
    const vBackKph = solveSpeedFromPower({ ...physics, power: powerBack, vhwMs: vhwBackMs, gradePct: gradeBack }) * 3.6;
    const avgKph = (2 * vOutKph * vBackKph) / (vOutKph + vBackKph);
    expect(avgKph).toBeCloseTo(targetAvgSpeedKph, 1);
  });
});

describe("impliedCdAFromSplits", () => {
  it("recovers the seeded CdA when fed the speeds it would produce", () => {
    const trueCda = 0.245;
    const physics = { mass: 84, crr: 0.004, lossDtPct: 2, rho: 1.225, draft: 1.0 };
    const vhwParallelMs = 2.0;
    const pOut = 250, pBack = 250;
    const vOutKph = solveSpeedFromPower({ ...physics, cda: trueCda, power: pOut, vhwMs: +vhwParallelMs, gradePct: 0 }) * 3.6;
    const vBackKph = solveSpeedFromPower({ ...physics, cda: trueCda, power: pBack, vhwMs: -vhwParallelMs, gradePct: 0 }) * 3.6;
    const recovered = impliedCdAFromSplits({
      vOutKph, vBackKph, pOut, pBack, vhwParallelMs,
      gradeOut: 0, gradeBack: 0, physics,
    });
    expect(recovered).toBeCloseTo(trueCda, 2);
  });
});

describe("impliedCdAFromSingleSpeed", () => {
  it("recovers the seeded CdA when fed the speed it would produce", () => {
    const trueCda = 0.245;
    const physics = { mass: 84, crr: 0.004, lossDtPct: 2, rho: 1.225, draft: 1.0 };
    const power = 250;
    const vhwMs = 1.5;
    const gradePct = 1.2;
    const vKph = solveSpeedFromPower({ ...physics, cda: trueCda, power, vhwMs, gradePct }) * 3.6;
    const recovered = impliedCdAFromSingleSpeed({ vKph, power, vhwMs, gradePct, physics });
    expect(recovered).toBeCloseTo(trueCda, 2);
  });
});

describe("impliedWindSpeedFromSplits", () => {
  it("recovers the seeded wind speed when fed the splits it would produce", () => {
    const trueWindKph = 18;
    const factor = 0.7;
    const relAngleRad = (15 * Math.PI) / 180;
    const physics = PHYSICS;
    const pOut = 250, pBack = 250;
    const vhwMs = (trueWindKph / 3.6) * factor * Math.cos(relAngleRad);
    const vOutKph = solveSpeedFromPower({ ...physics, power: pOut, vhwMs: +vhwMs, gradePct: 0 }) * 3.6;
    const vBackKph = solveSpeedFromPower({ ...physics, power: pBack, vhwMs: -vhwMs, gradePct: 0 }) * 3.6;
    const recovered = impliedWindSpeedFromSplits({
      vOutKph, vBackKph, pOut, pBack, factor, relAngleRad,
      gradeOut: 0, gradeBack: 0, physics,
    });
    expect(recovered).toBeCloseTo(trueWindKph, 1);
  });

  it("recovers the wind speed when wind aligns with the back leg (cosRel < 0)", () => {
    // Wind coming from behind the start = tailwind on out, headwind on back.
    // Bisection direction has to flip; the un-flipped version drives away
    // from the root and returns wildly inflated speeds.
    const trueWindKph = 18;
    const factor = 0.7;
    const relAngleRad = (165 * Math.PI) / 180; // cos ≈ -0.966
    const physics = PHYSICS;
    const pOut = 250, pBack = 250;
    const vhwMs = (trueWindKph / 3.6) * factor * Math.cos(relAngleRad);
    const vOutKph = solveSpeedFromPower({ ...physics, power: pOut, vhwMs: +vhwMs, gradePct: 0 }) * 3.6;
    const vBackKph = solveSpeedFromPower({ ...physics, power: pBack, vhwMs: -vhwMs, gradePct: 0 }) * 3.6;
    const recovered = impliedWindSpeedFromSplits({
      vOutKph, vBackKph, pOut, pBack, factor, relAngleRad,
      gradeOut: 0, gradeBack: 0, physics,
    });
    expect(recovered).toBeCloseTo(trueWindKph, 1);
  });
});

describe("optimizePowerSplit", () => {
  it("beats equal-power pacing on a windy course at the same avg power", () => {
    const physics = PHYSICS;
    const vhwOutMs = 3, vhwBackMs = -3, gradeOut = 0, gradeBack = 0;
    const distance = 16;
    const targetAvg = 250;

    const optPowerOut = optimizePowerSplit({
      targetAvg, physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack, distance,
    });
    const optPowerBack = findPowerForAvg({
      targetAvg, fixedPower: optPowerOut, fixedLeg: "out",
      physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack,
    });
    const vOpt1 = solveSpeedFromPower({ ...physics, power: optPowerOut, vhwMs: vhwOutMs, gradePct: gradeOut });
    const vOpt2 = solveSpeedFromPower({ ...physics, power: optPowerBack, vhwMs: vhwBackMs, gradePct: gradeBack });
    const halfM = (distance * 1000) / 2;
    const tOpt = halfM / vOpt1 + halfM / vOpt2;

    const vEqual1 = solveSpeedFromPower({ ...physics, power: targetAvg, vhwMs: vhwOutMs, gradePct: gradeOut });
    const vEqual2 = solveSpeedFromPower({ ...physics, power: targetAvg, vhwMs: vhwBackMs, gradePct: gradeBack });
    const tEqual = halfM / vEqual1 + halfM / vEqual2;

    expect(tOpt).toBeLessThan(tEqual);
    // Optimal split pushes harder into the headwind leg.
    expect(optPowerOut).toBeGreaterThan(targetAvg);
  });
});
