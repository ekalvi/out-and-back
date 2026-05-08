export const G = 9.80665;

// P·η = ½·ρ·CdA·draft·(v + v_w)²·v + (m_r + m_b)·g·(Crr·cosθ + sinθ)·v
// Solved for v via Newton's method.
export function solveSpeedFromPower({ power, cda, mass, vhwMs, gradePct, crr, lossDtPct, rho, draft }) {
  const eta = 1 - lossDtPct / 100;
  const Pav = power * eta;
  const theta = Math.atan(gradePct / 100);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const a = 0.5 * rho * cda * draft;
  const b = mass * G * (crr * cosT + sinT);

  const f = (v) => a * (v + vhwMs) * (v + vhwMs) * v + b * v - Pav;
  const fp = (v) => a * (3 * v * v + 4 * vhwMs * v + vhwMs * vhwMs) + b;

  let v = 10;
  for (let i = 0; i < 100; i++) {
    const fv = f(v);
    const dfv = fp(v);
    if (!isFinite(fv) || !isFinite(dfv) || Math.abs(dfv) < 1e-12) break;
    let next = v - fv / dfv;
    if (next < 0.05) next = 0.05;
    if (Math.abs(next - v) < 1e-8) { v = next; break; }
    v = next;
  }
  return v;
}

export function findPowerForAvg({ targetAvg, fixedPower, fixedLeg, physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack }) {
  let lo = 1, hi = 2000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    let vOut, vBack;
    if (fixedLeg === "out") {
      vOut = solveSpeedFromPower({ ...physics, power: fixedPower, vhwMs: vhwOutMs, gradePct: gradeOut });
      vBack = solveSpeedFromPower({ ...physics, power: mid, vhwMs: vhwBackMs, gradePct: gradeBack });
    } else {
      vOut = solveSpeedFromPower({ ...physics, power: mid, vhwMs: vhwOutMs, gradePct: gradeOut });
      vBack = solveSpeedFromPower({ ...physics, power: fixedPower, vhwMs: vhwBackMs, gradePct: gradeBack });
    }
    const pOutW = fixedLeg === "out" ? fixedPower : mid;
    const pBackW = fixedLeg === "out" ? mid : fixedPower;
    const actualAvg = (pOutW / vOut + pBackW / vBack) / (1 / vOut + 1 / vBack);
    if (actualAvg < targetAvg) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function findPowerBackForAvgSpeed({ targetAvgSpeedKph, fixedPowerOut, physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack }) {
  const vOutKph = solveSpeedFromPower({ ...physics, power: fixedPowerOut, vhwMs: vhwOutMs, gradePct: gradeOut }) * 3.6;
  let lo = 1, hi = 2000;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const vBackKph = solveSpeedFromPower({ ...physics, power: mid, vhwMs: vhwBackMs, gradePct: gradeBack }) * 3.6;
    const avgKph = (2 * vOutKph * vBackKph) / (vOutKph + vBackKph);
    if (avgKph < targetAvgSpeedKph) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function bisectPowerForAbsDeltaV({ targetDvKph, targetAvgSpeedKph, physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack }) {
  const compute = (powerOut) => {
    const powerBack = findPowerBackForAvgSpeed({
      targetAvgSpeedKph, fixedPowerOut: powerOut,
      physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack,
    });
    if (powerBack < 1 || powerBack > 1999) return null;
    const vOutMs = solveSpeedFromPower({ ...physics, power: powerOut, vhwMs: vhwOutMs, gradePct: gradeOut });
    const vBackMs = solveSpeedFromPower({ ...physics, power: powerBack, vhwMs: vhwBackMs, gradePct: gradeBack });
    return ((vBackMs - vOutMs) * 3.6) / 2;  // signed
  };
  const refDv = compute(250);
  const targetSigned = (refDv >= 0 ? 1 : -1) * targetDvKph;
  let lo = 50, hi = 800;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const dv = compute(mid);
    if (dv === null) { hi = mid; continue; }
    if (dv > targetSigned) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function impliedCdAFromSplits({ vOutKph, vBackKph, pOut, pBack, vhwParallelMs, gradeOut, gradeBack, physics }) {
  let lo = 0.05, hi = 0.80;
  for (let i = 0; i < 60; i++) {
    const cdaTry = (lo + hi) / 2;
    const predOut = solveSpeedFromPower({ ...physics, cda: cdaTry, power: pOut, vhwMs: +vhwParallelMs, gradePct: gradeOut }) * 3.6;
    const predBack = solveSpeedFromPower({ ...physics, cda: cdaTry, power: pBack, vhwMs: -vhwParallelMs, gradePct: gradeBack }) * 3.6;
    const avgPred = (predOut + predBack) / 2;
    const avgAct = (vOutKph + vBackKph) / 2;
    if (avgPred > avgAct) lo = cdaTry;
    else hi = cdaTry;
  }
  return (lo + hi) / 2;
}

export function impliedCdAFromSingleSpeed({ vKph, power, vhwMs, gradePct, physics }) {
  let lo = 0.05, hi = 0.80;
  for (let i = 0; i < 60; i++) {
    const cdaTry = (lo + hi) / 2;
    const predKph = solveSpeedFromPower({ ...physics, cda: cdaTry, power, vhwMs, gradePct }) * 3.6;
    if (predKph > vKph) lo = cdaTry;
    else hi = cdaTry;
  }
  return (lo + hi) / 2;
}

export function impliedWindSpeedFromSplits({ vOutKph, vBackKph, pOut, pBack, factor, relAngleRad, gradeOut, gradeBack, physics }) {
  const targetDelta = vBackKph - vOutKph;
  const cosRel = Math.cos(relAngleRad);
  // predDelta is monotonically increasing in wKph when cosRel > 0 (headwind on
  // the out leg) and monotonically decreasing when cosRel < 0 (tailwind on the
  // out leg). Flip the comparison sign so the bisection converges either way.
  const sign = cosRel >= 0 ? 1 : -1;
  let lo = 0, hi = 100;
  for (let i = 0; i < 60; i++) {
    const wKph = (lo + hi) / 2;
    const vhwMs = (wKph / 3.6) * factor * cosRel;
    const predOut = solveSpeedFromPower({ ...physics, power: pOut, vhwMs: +vhwMs, gradePct: gradeOut }) * 3.6;
    const predBack = solveSpeedFromPower({ ...physics, power: pBack, vhwMs: -vhwMs, gradePct: gradeBack }) * 3.6;
    const predDelta = predBack - predOut;
    if (sign * predDelta < sign * targetDelta) lo = wKph;
    else hi = wKph;
  }
  return (lo + hi) / 2;
}

export function optimizePowerSplit({ targetAvg, physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack, distance }) {
  const timeAt = (powerOut) => {
    const powerBack = findPowerForAvg({
      targetAvg, fixedPower: powerOut, fixedLeg: "out",
      physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack,
    });
    if (powerBack < 1 || powerBack > 1999) return Infinity;
    const vOutMs = solveSpeedFromPower({ ...physics, power: powerOut, vhwMs: vhwOutMs, gradePct: gradeOut });
    const vBackMs = solveSpeedFromPower({ ...physics, power: powerBack, vhwMs: vhwBackMs, gradePct: gradeBack });
    const halfM = (distance * 1000) / 2;
    return halfM / vOutMs + halfM / vBackMs;
  };
  // Golden-section search over powerOut in [50, 800]
  const phi = (Math.sqrt(5) - 1) / 2;
  let lo = 50, hi = 800;
  let m1 = hi - phi * (hi - lo);
  let m2 = lo + phi * (hi - lo);
  let t1 = timeAt(m1), t2 = timeAt(m2);
  for (let i = 0; i < 60 && hi - lo > 0.5; i++) {
    if (t1 < t2) {
      hi = m2; m2 = m1; t2 = t1;
      m1 = hi - phi * (hi - lo); t1 = timeAt(m1);
    } else {
      lo = m1; m1 = m2; t1 = t2;
      m2 = lo + phi * (hi - lo); t2 = timeAt(m2);
    }
  }
  return (lo + hi) / 2;
}
