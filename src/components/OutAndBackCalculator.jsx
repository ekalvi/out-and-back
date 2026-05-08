import { useState, useEffect } from "react";
import { Wind, Clock, Gauge, ArrowRight, ChevronDown } from "lucide-react";

const STATE_KEYS = [
  ["mode", "mo", "string"],
  ["distance", "di", "number"],
  ["vOut", "vo", "number"],
  ["vBack", "vb", "number"],
  ["powerOut", "po", "number"],
  ["powerBack", "pb", "number"],
  ["powerAvg", "pa", "number"],
  ["autoPowerSlider", "ap", "string"],
  ["cda", "cd", "number"],
  ["riderMass", "rm", "number"],
  ["bikeMass", "bm", "number"],
  ["windKph", "ws", "number"],
  ["windFactorPct", "wf", "number"],
  ["windAngle", "wa", "number"],
  ["courseHeading", "ch", "number"],
  ["grade", "gr", "number"],
  ["crr", "cr", "number"],
  ["lossDt", "ld", "number"],
  ["rho", "rh", "number"],
  ["draft", "df", "number"],
];

function encodeStateToHash(state) {
  const p = new URLSearchParams();
  for (const [longK, shortK] of STATE_KEYS) {
    const v = state[longK];
    if (v === undefined || v === null) continue;
    p.set(shortK, String(v));
  }
  return p.toString();
}

function decodeStateFromHash(hash) {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!trimmed) return {};
  const p = new URLSearchParams(trimmed);
  const out = {};
  for (const [longK, shortK, type] of STATE_KEYS) {
    if (!p.has(shortK)) continue;
    const raw = p.get(shortK);
    if (type === "number") {
      const n = parseFloat(raw);
      if (!isNaN(n)) out[longK] = n;
    } else {
      out[longK] = raw;
    }
  }
  return out;
}

const G = 9.80665;

function solveSpeedFromPower({ power, cda, mass, vhwMs, gradePct, crr, lossDtPct, rho, draft }) {
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

function legBackground(parallelHeadKph) {
  const max = 20;
  const t = Math.max(-1, Math.min(1, parallelHeadKph / max));
  const lerp = (a, b, x) => a + (b - a) * x;
  let r, g, b;
  if (t >= 0) {
    r = lerp(250, 253, t);
    g = lerp(250, 164, t);
    b = lerp(250, 175, t);
  } else {
    const at = -t;
    r = lerp(250, 110, at);
    g = lerp(250, 231, at);
    b = lerp(250, 183, at);
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function bisectPowerForAbsDeltaV({ targetDvKph, displayedAvg, physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack }) {
  const compute = (powerOut) => {
    const powerBack = findPowerForAvg({
      targetAvg: displayedAvg, fixedPower: powerOut, fixedLeg: "out",
      physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack,
    });
    if (powerBack < 1 || powerBack > 1999) return null;
    const vOutMs = solveSpeedFromPower({ ...physics, power: powerOut, vhwMs: vhwOutMs, gradePct: gradeOut });
    const vBackMs = solveSpeedFromPower({ ...physics, power: powerBack, vhwMs: vhwBackMs, gradePct: gradeBack });
    return ((vBackMs - vOutMs) * 3.6) / 2;  // signed
  };
  // Establish current sign with avg-equal pacing as reference
  const refDv = compute(displayedAvg);
  const targetSigned = (refDv >= 0 ? 1 : -1) * targetDvKph;
  // Bisect powerOut over [50, 800]: signed dv decreases as powerOut increases
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

function impliedCdAFromSplits({ vOutKph, vBackKph, pOut, pBack, vhwParallelMs, gradeOut, gradeBack, physics }) {
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

function optimizePowerSplit({ targetAvg, physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack, distance }) {
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

function findPowerForAvg({ targetAvg, fixedPower, fixedLeg, physics, vhwOutMs, vhwBackMs, gradeOut, gradeBack }) {
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

export default function OutAndBackCalculator({ commitSha }) {
  const [mode, setMode] = useState("power");

  const [distance, setDistance] = useState(14.10);
  const [vOut, setVOut] = useState(36.3);
  const [vBack, setVBack] = useState(50.2);

  const [powerOut, setPowerOut] = useState(298);
  const [powerBack, setPowerBack] = useState(319);
  const [powerAvg, setPowerAvg] = useState(305);
  const [autoPowerSlider, setAutoPowerSlider] = useState("back");
  const [cda, setCda] = useState(0.23);
  const [riderMass, setRiderMass] = useState(75);
  const [bikeMass, setBikeMass] = useState(9);
  const [windKph, setWindKph] = useState(23);
  const [windFactorPct, setWindFactorPct] = useState(70);
  const [windAngle, setWindAngle] = useState(12);
  const [courseHeading, setCourseHeading] = useState(315);
  const [grade, setGrade] = useState(0);
  const [crr, setCrr] = useState(0.004);
  const [lossDt, setLossDt] = useState(2);
  const [rho, setRho] = useState(1.225);
  const [draft, setDraft] = useState(1.0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [presets, setPresets] = useState(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem("outback:presets") || "[]"); }
    catch { return []; }
  });

  const SETTERS = {
    mode: setMode,
    distance: setDistance,
    vOut: setVOut, vBack: setVBack,
    powerOut: setPowerOut, powerBack: setPowerBack, powerAvg: setPowerAvg,
    autoPowerSlider: setAutoPowerSlider,
    cda: setCda, riderMass: setRiderMass, bikeMass: setBikeMass,
    windKph: setWindKph, windFactorPct: setWindFactorPct, windAngle: setWindAngle,
    courseHeading: setCourseHeading,
    grade: setGrade, crr: setCrr, lossDt: setLossDt, rho: setRho, draft: setDraft,
  };

  const applyState = (s) => {
    for (const [key, value] of Object.entries(s)) {
      if (SETTERS[key]) SETTERS[key](value);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;
    const decoded = decodeStateFromHash(window.location.hash);
    applyState(decoded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalMass = riderMass + bikeMass;
  const windFactor = windFactorPct / 100;
  const effectiveWindKph = windKph * windFactor;
  const relAngleRad = ((windAngle - courseHeading) * Math.PI) / 180;
  const windParallelKph = effectiveWindKph * Math.cos(relAngleRad);
  const windCrossKph = Math.abs(effectiveWindKph * Math.sin(relAngleRad));
  const windParallelMs = windParallelKph / 3.6;

  const isReverse = mode === "reverse";
  const isPower = mode === "power";
  const isActualMode = isReverse;

  const vhwOutMs = +windParallelMs;
  const vhwBackMs = -windParallelMs;
  const gradeOut = +grade;
  const gradeBack = -grade;

  // First settle displayed power values (auto-compute) using user's CdA
  // so the avg→leg bisections aren't moving CdA around.
  const physicsForPower = { cda, mass: totalMass, crr, lossDtPct: lossDt, rho, draft };

  let displayedOut = powerOut;
  let displayedBack = powerBack;
  let displayedAvg = powerAvg;

  if (autoPowerSlider === "out") {
    displayedOut = findPowerForAvg({
      targetAvg: powerAvg, fixedPower: powerBack, fixedLeg: "back",
      physics: physicsForPower, vhwOutMs, vhwBackMs, gradeOut, gradeBack,
    });
  } else if (autoPowerSlider === "back") {
    displayedBack = findPowerForAvg({
      targetAvg: powerAvg, fixedPower: powerOut, fixedLeg: "out",
      physics: physicsForPower, vhwOutMs, vhwBackMs, gradeOut, gradeBack,
    });
  }

  // In Actual mode, derive CdA from observed splits + power + course
  const derivedCda = isActualMode
    ? impliedCdAFromSplits({
        vOutKph: vOut, vBackKph: vBack,
        pOut: displayedOut, pBack: displayedBack,
        vhwParallelMs: windParallelMs,
        gradeOut, gradeBack,
        physics: { mass: totalMass, crr, lossDtPct: lossDt, rho, draft },
      })
    : null;

  const effectiveCda = isActualMode ? derivedCda : cda;
  const physicsBase = { cda: effectiveCda, mass: totalMass, crr, lossDtPct: lossDt, rho, draft };

  // Predicted leg speeds via the model (in Actual mode they will match observed by construction)
  const pOutMs = solveSpeedFromPower({ ...physicsBase, power: displayedOut, vhwMs: vhwOutMs, gradePct: gradeOut });
  const pBackMs = solveSpeedFromPower({ ...physicsBase, power: displayedBack, vhwMs: vhwBackMs, gradePct: gradeBack });
  const pOut = pOutMs * 3.6;
  const pBack = pBackMs * 3.6;

  if (autoPowerSlider === "avg") {
    displayedAvg = (displayedOut / pOut + displayedBack / pBack) / (1 / pOut + 1 / pBack);
  }

  // For penalty: in Actual mode use observed leg speeds; in Theoretical use predicted
  const actualVOut = isActualMode ? vOut : pOut;
  const actualVBack = isActualMode ? vBack : pBack;
  const actualAvg = (2 * actualVOut * actualVBack) / (actualVOut + actualVBack);

  const pIdealMs = solveSpeedFromPower({ ...physicsBase, power: displayedAvg, vhwMs: 0, gradePct: 0 });
  const pIdealAvg = pIdealMs * 3.6;
  const pDvAvg = pIdealAvg - actualAvg;
  const pTBase = (distance / pIdealAvg) * 60;
  const pTAct = (distance / actualAvg) * 60;
  const pDt = (pTAct - pTBase) * 60;

  const data = {
    base: pIdealAvg, vOut: actualVOut, vBack: actualVBack, vAvg: actualAvg,
    dvAvg: pDvAvg, tBase: pTBase, tAct: pTAct, dt: pDt,
    headOut: windParallelKph,
  };
  const derivedDeltaV = Math.abs((actualVBack - actualVOut) / 2);

  const formatTime = (mins) => {
    if (!isFinite(mins) || mins < 0) return "—:——.—";
    const totalTenths = Math.round(mins * 600);
    const m = Math.floor(totalTenths / 600);
    const remaining = totalTenths - m * 600;
    const s = Math.floor(remaining / 10);
    const tenths = remaining - s * 10;
    return `${m}:${s.toString().padStart(2, "0")}.${tenths}`;
  };

  const sliderPct = (Math.min(15, derivedDeltaV) / 15) * 100;

  function applyDeltaV(targetDvKph) {
    const newPowerOut = bisectPowerForAbsDeltaV({
      targetDvKph,
      displayedAvg,
      physics: physicsBase,
      vhwOutMs, vhwBackMs, gradeOut, gradeBack,
    });
    setPowerOut(Math.round(newPowerOut));
    setAutoPowerSlider("back");
  }

  function handleOptimize() {
    const optPowerOut = optimizePowerSplit({
      targetAvg: displayedAvg,
      physics: physicsBase,
      vhwOutMs, vhwBackMs, gradeOut, gradeBack,
      distance,
    });
    setPowerOut(Math.round(optPowerOut));
    setAutoPowerSlider("back");
  }

  function handleAutoChange(newTarget) {
    if (autoPowerSlider === "out") setPowerOut(Math.round(displayedOut));
    else if (autoPowerSlider === "back") setPowerBack(Math.round(displayedBack));
    else if (autoPowerSlider === "avg") setPowerAvg(Math.round(displayedAvg));
    setAutoPowerSlider(newTarget);
  }

  function getCurrentState() {
    return {
      mode, distance, vOut, vBack,
      powerOut, powerBack, powerAvg, autoPowerSlider,
      cda, riderMass, bikeMass,
      windKph, windFactorPct, windAngle, courseHeading,
      grade, crr, lossDt, rho, draft,
    };
  }

  function handleShare() {
    if (typeof window === "undefined") return;
    const hash = encodeStateToHash(getCurrentState());
    const url = `${window.location.origin}${window.location.pathname}#${hash}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    });
  }

  function handleSavePreset() {
    const name = window.prompt("Save preset as:");
    if (!name) return;
    const next = [...presets.filter((p) => p.name !== name), { name, state: getCurrentState() }];
    setPresets(next);
    window.localStorage.setItem("outback:presets", JSON.stringify(next));
  }

  function handleLoadPreset(name) {
    const preset = presets.find((p) => p.name === name);
    if (!preset) return;
    applyState(preset.state);
  }

  function handleDeletePreset(name) {
    if (!window.confirm(`Delete preset "${name}"?`)) return;
    const next = presets.filter((p) => p.name !== name);
    setPresets(next);
    window.localStorage.setItem("outback:presets", JSON.stringify(next));
  }

  const penaltyCard = (
    <Card className="mb-4">
      <div className="flex items-baseline justify-between">
        <Eyebrow>
          {isPower ? "Penalty vs flat & calm" : isReverse ? "vs no-wind potential" : "Penalty vs ideal"}
        </Eyebrow>
        <Num className="text-[11px] text-zinc-500">
          {isPower ? "no-wind" : "base"} @ {data.base.toFixed(2)} kph
        </Num>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-6 sm:gap-10">
        <div>
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            <Clock className="h-3 w-3" strokeWidth={2.5} /> Ideal
          </div>
          <Num className="mt-2 block text-4xl font-bold tracking-tight text-emerald-700 sm:text-5xl">
            {formatTime(data.tBase)}
          </Num>
          <Num className="mt-1.5 block text-xs text-zinc-500">
            {data.base.toFixed(2)} kph
          </Num>
        </div>
        <div>
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-rose-700">
            <Wind className="h-3 w-3" strokeWidth={2.5} /> Actual
          </div>
          <Num className="mt-2 block text-4xl font-bold tracking-tight text-rose-700 sm:text-5xl">
            {formatTime(data.tAct)}
          </Num>
          <Num className="mt-1.5 block text-xs text-zinc-500">
            {data.vAvg.toFixed(2)} kph avg
          </Num>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-3">
        <PenaltyBlock
          icon={<Gauge className="h-3 w-3" strokeWidth={2.5} />}
          label="Speed loss"
          value={(data.dvAvg >= 0 ? "−" : "+") + Math.abs(data.dvAvg).toFixed(2)}
          unit="kph"
        />
        <PenaltyBlock
          icon={<Clock className="h-3 w-3" strokeWidth={2.5} />}
          label="Time loss"
          value={(data.dt >= 0 ? "+" : "−") + Math.abs(data.dt).toFixed(1)}
          unit="sec"
        />
      </div>
    </Card>
  );

  const courseCard = (
    <Card className="mb-4">
      <div className="flex items-baseline justify-between">
        <Eyebrow>Course profile</Eyebrow>
        <Num className="text-[11px] text-zinc-500">
          {distance.toFixed(2)} km · turn at {(distance / 2).toFixed(2)}
        </Num>
      </div>

      <div className="relative mt-4">
        <div className="flex h-9 overflow-hidden rounded-lg border border-zinc-200">
          <div
            className="flex flex-1 items-center justify-between border-r border-zinc-200 px-3 transition-colors"
            style={{ backgroundColor: legBackground(+data.headOut) }}
          >
            <ArrowRight className="h-3.5 w-3.5 text-zinc-700" strokeWidth={2.5} />
            <Num className="text-xs font-semibold text-zinc-900">
              {data.vOut.toFixed(1)} kph
            </Num>
          </div>
          <div
            className="flex flex-1 items-center justify-between px-3 transition-colors"
            style={{ backgroundColor: legBackground(-data.headOut) }}
          >
            <Num className="text-xs font-semibold text-zinc-900">
              {data.vBack.toFixed(1)} kph
            </Num>
            <ArrowRight className="h-3.5 w-3.5 rotate-180 text-zinc-700" strokeWidth={2.5} />
          </div>
        </div>
        <div className="mono mt-1.5 flex justify-between text-[10px] uppercase tracking-wider text-zinc-500">
          <span>start</span>
          <span className="absolute left-1/2 -translate-x-1/2">turn</span>
          <span>finish</span>
        </div>
      </div>
    </Card>
  );

  const inputsCard = (
    <Card className="mb-8">
      <Eyebrow>
        {isPower ? "Power model inputs" : isReverse ? "Observed leg speeds" : "Forward inputs"}
      </Eyebrow>
      <div className="mt-4">
        {mode === "forward" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Base speed
                </label>
                <div className="mono w-full rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2.5 text-base font-medium text-zinc-700">
                  {pIdealAvg.toFixed(2)} <span className="text-[11px] text-zinc-400">kph</span>
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">No-wind avg from Power tab</p>
              </div>
              <NumberInput label="Distance" value={distance} onChange={setDistance} unit="km" step={0.1} />
            </div>
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Δv per leg
                </label>
                <Num className="text-sm">
                  <span className="font-semibold text-zinc-950">±{derivedDeltaV.toFixed(1)}</span>
                  <span className="ml-1 text-zinc-400">kph</span>
                </Num>
              </div>
              <input
                type="range"
                min="0"
                max="15"
                step="0.5"
                value={Math.min(15, derivedDeltaV)}
                onChange={(e) => applyDeltaV(parseFloat(e.target.value))}
                className="slider-thumb h-2 w-full cursor-pointer rounded-full"
                style={{
                  background: `linear-gradient(to right, #18181b 0%, #18181b ${sliderPct}%, #e4e4e7 ${sliderPct}%, #e4e4e7 100%)`,
                }}
              />
              <div className="mono mt-1.5 flex justify-between text-[10px] text-zinc-400">
                <span>0</span>
                <span>5</span>
                <span>10</span>
                <span>15</span>
              </div>
              <p className="mt-2 text-[10px] text-zinc-500">Adjusts the power split (out vs back, holding avg) to produce this Δv. Wind/grade unchanged.</p>
            </div>
          </div>
        )}
        {mode === "reverse" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Out leg (observed)" value={vOut} onChange={setVOut} unit="kph" step={0.1} />
              <NumberInput label="Back leg (observed)" value={vBack} onChange={setVBack} unit="kph" step={0.1} />
            </div>
            <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
              <div className="flex items-center justify-between">
                <Eyebrow>Power · auto-compute</Eyebrow>
                <div className="flex gap-0.5 rounded-md bg-zinc-200/70 p-0.5">
                  <ToggleBtn active={autoPowerSlider === "out"} onClick={() => handleAutoChange("out")}>Out</ToggleBtn>
                  <ToggleBtn active={autoPowerSlider === "back"} onClick={() => handleAutoChange("back")}>Back</ToggleBtn>
                  <ToggleBtn active={autoPowerSlider === "avg"} onClick={() => handleAutoChange("avg")}>Avg</ToggleBtn>
                </div>
              </div>
              <SliderInput
                label="Avg power"
                value={autoPowerSlider === "avg" ? Math.round(displayedAvg) : powerAvg}
                onChange={setPowerAvg}
                min={100} max={500} step={5} unit="W"
                disabled={autoPowerSlider === "avg"}
              />
              <SliderInput
                label="Out leg power"
                value={autoPowerSlider === "out" ? Math.round(displayedOut) : powerOut}
                onChange={setPowerOut}
                min={100} max={500} step={5} unit="W"
                disabled={autoPowerSlider === "out"}
              />
              <SliderInput
                label="Back leg power"
                value={autoPowerSlider === "back" ? Math.round(displayedBack) : powerBack}
                onChange={setPowerBack}
                min={100} max={500} step={5} unit="W"
                disabled={autoPowerSlider === "back"}
              />
            </div>

            <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
              <Eyebrow>Course & wind</Eyebrow>
              <SliderInput label="Course heading (out)" value={courseHeading} onChange={setCourseHeading} min={0} max={360} step={5} unit="°" />
              <SliderInput label="Wind speed" value={windKph} onChange={setWindKph} min={0} max={50} step={0.5} unit="kph" />
              <SliderInput label="Wind from" value={windAngle} onChange={setWindAngle} min={0} max={360} step={5} unit="°" />
              <div className="flex items-center gap-3 pt-1">
                <WindCompass courseHeadingDeg={courseHeading} windAngleDeg={windAngle} hasWind={windKph > 0.05} />
                <div className="mono flex-1 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Out leg</span>
                    <span className="text-zinc-900">
                      {Math.abs(windParallelKph) < 0.05
                        ? "—"
                        : (windParallelKph > 0 ? "−" : "+") + Math.abs(windParallelKph).toFixed(1) + " kph"}
                      <span className="ml-1 text-zinc-400">
                        {Math.abs(windParallelKph) < 0.05 ? "" : windParallelKph > 0 ? "head" : "tail"}
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Back leg</span>
                    <span className="text-zinc-900">
                      {Math.abs(windParallelKph) < 0.05
                        ? "—"
                        : (windParallelKph > 0 ? "+" : "−") + Math.abs(windParallelKph).toFixed(1) + " kph"}
                      <span className="ml-1 text-zinc-400">
                        {Math.abs(windParallelKph) < 0.05 ? "" : windParallelKph > 0 ? "tail" : "head"}
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Crosswind</span>
                    <span className="text-zinc-900">{windCrossKph.toFixed(1)} kph</span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-200 pt-1 text-zinc-400">
                    <span>Effective</span>
                    <span>{effectiveWindKph.toFixed(1)} kph ({windKph.toFixed(1)} × {windFactor.toFixed(2)})</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Distance" value={distance} onChange={setDistance} unit="km" step={0.1} />
              <NumberInput label="Grade (out)" value={grade} onChange={setGrade} unit="%" step={0.1} />
            </div>
            <NumberInput label="Rider mass" value={riderMass} onChange={setRiderMass} unit="kg" step={0.5} />

            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
            >
              <span>Advanced</span>
              <ChevronDown
                className={"h-3.5 w-3.5 transition-transform " + (advancedOpen ? "rotate-180" : "")}
                strokeWidth={2.5}
              />
            </button>
            {advancedOpen && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput label="Bike mass" value={bikeMass} onChange={setBikeMass} unit="kg" step={0.1} />
                  <NumberInput label="Wind factor" value={windFactorPct} onChange={setWindFactorPct} unit="%" step={5} />
                  <NumberInput label="Crr" value={crr} onChange={setCrr} unit="" step={0.0005} />
                  <NumberInput label="Drivetrain loss" value={lossDt} onChange={setLossDt} unit="%" step={0.5} />
                  <NumberInput label="Air density" value={rho} onChange={setRho} unit="kg/m³" step={0.005} />
                  <NumberInput label="Draft factor" value={draft} onChange={setDraft} unit="" step={0.05} />
                </div>
                <p className="text-[10px] leading-relaxed text-zinc-500">
                  Wind factor: weather-app wind speed is measured at ~10 m. At cyclist height (~1-2 m), wind is typically 60-80% of that. If derived CdA looks unreasonable, adjust this first.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Derived CdA</span>
                <Num className="text-base font-semibold text-amber-900">
                  {(derivedCda ?? 0).toFixed(3)} <span className="text-xs font-normal text-amber-700">m²</span>
                </Num>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">No-wind avg</span>
                <Num className="text-base font-semibold text-emerald-900">
                  {pIdealAvg.toFixed(2)} <span className="text-xs font-normal text-emerald-700">kph</span>
                </Num>
              </div>
            </div>
            <button
              type="button"
              onClick={() => derivedCda && setCda(parseFloat(derivedCda.toFixed(3)))}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
            >
              Use derived CdA in theoretical mode
            </button>
          </div>
        )}
        {mode === "power" && (
          <div className="space-y-5">
            <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
              <div className="flex items-center justify-between">
                <Eyebrow>Power · auto-compute</Eyebrow>
                <div className="flex gap-0.5 rounded-md bg-zinc-200/70 p-0.5">
                  <ToggleBtn active={autoPowerSlider === "out"} onClick={() => handleAutoChange("out")}>Out</ToggleBtn>
                  <ToggleBtn active={autoPowerSlider === "back"} onClick={() => handleAutoChange("back")}>Back</ToggleBtn>
                  <ToggleBtn active={autoPowerSlider === "avg"} onClick={() => handleAutoChange("avg")}>Avg</ToggleBtn>
                </div>
              </div>
              <SliderInput
                label="Avg power"
                value={autoPowerSlider === "avg" ? Math.round(displayedAvg) : powerAvg}
                onChange={setPowerAvg}
                min={100} max={500} step={5} unit="W"
                disabled={autoPowerSlider === "avg"}
              />
              <SliderInput
                label="Out leg power"
                value={autoPowerSlider === "out" ? Math.round(displayedOut) : powerOut}
                onChange={setPowerOut}
                min={100} max={500} step={5} unit="W"
                disabled={autoPowerSlider === "out"}
              />
              <SliderInput
                label="Back leg power"
                value={autoPowerSlider === "back" ? Math.round(displayedBack) : powerBack}
                onChange={setPowerBack}
                min={100} max={500} step={5} unit="W"
                disabled={autoPowerSlider === "back"}
              />
              <button
                type="button"
                onClick={handleOptimize}
                title="Find the power split that minimizes total time at the current avg power"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
              >
                Optimize split for fastest time
              </button>
            </div>

            <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
              <Eyebrow>Course & wind</Eyebrow>
              <SliderInput label="Course heading (out)" value={courseHeading} onChange={setCourseHeading} min={0} max={360} step={5} unit="°" />
              <SliderInput label="Wind speed" value={windKph} onChange={setWindKph} min={0} max={50} step={0.5} unit="kph" />
              <SliderInput label="Wind from" value={windAngle} onChange={setWindAngle} min={0} max={360} step={5} unit="°" />
              <div className="flex items-center gap-3 pt-1">
                <WindCompass courseHeadingDeg={courseHeading} windAngleDeg={windAngle} hasWind={windKph > 0.05} />
                <div className="mono flex-1 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Out leg</span>
                    <span className="text-zinc-900">
                      {Math.abs(windParallelKph) < 0.05
                        ? "—"
                        : (windParallelKph > 0 ? "−" : "+") +
                          Math.abs(windParallelKph).toFixed(1) +
                          " kph"}
                      <span className="ml-1 text-zinc-400">
                        {Math.abs(windParallelKph) < 0.05 ? "" : windParallelKph > 0 ? "head" : "tail"}
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Back leg</span>
                    <span className="text-zinc-900">
                      {Math.abs(windParallelKph) < 0.05
                        ? "—"
                        : (windParallelKph > 0 ? "+" : "−") +
                          Math.abs(windParallelKph).toFixed(1) +
                          " kph"}
                      <span className="ml-1 text-zinc-400">
                        {Math.abs(windParallelKph) < 0.05 ? "" : windParallelKph > 0 ? "tail" : "head"}
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Crosswind</span>
                    <span className="text-zinc-900">{windCrossKph.toFixed(1)} kph</span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-200 pt-1 text-zinc-400">
                    <span>Effective</span>
                    <span>{effectiveWindKph.toFixed(1)} kph ({windKph.toFixed(1)} × {windFactor.toFixed(2)})</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="CdA" value={cda} onChange={setCda} unit="m²" step={0.005} />
              <NumberInput label="Rider mass" value={riderMass} onChange={setRiderMass} unit="kg" step={0.5} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Distance" value={distance} onChange={setDistance} unit="km" step={0.1} />
              <NumberInput label="Grade (out)" value={grade} onChange={setGrade} unit="%" step={0.1} />
            </div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
            >
              <span>Advanced</span>
              <ChevronDown
                className={"h-3.5 w-3.5 transition-transform " + (advancedOpen ? "rotate-180" : "")}
                strokeWidth={2.5}
              />
            </button>
            {advancedOpen && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput label="Bike mass" value={bikeMass} onChange={setBikeMass} unit="kg" step={0.1} />
                  <NumberInput label="Wind factor" value={windFactorPct} onChange={setWindFactorPct} unit="%" step={5} />
                  <NumberInput label="Crr" value={crr} onChange={setCrr} unit="" step={0.0005} />
                  <NumberInput label="Drivetrain loss" value={lossDt} onChange={setLossDt} unit="%" step={0.5} />
                  <NumberInput label="Air density" value={rho} onChange={setRho} unit="kg/m³" step={0.005} />
                  <NumberInput label="Draft factor" value={draft} onChange={setDraft} unit="" step={0.05} />
                </div>
                <p className="text-[10px] leading-relaxed text-zinc-500">
                  Wind factor: weather-app wind speed is measured at ~10 m. At cyclist height (~1-2 m), wind is typically 60-80% of that due to the boundary layer + terrain. Lower for sheltered courses, higher for open plains.
                </p>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                No-wind, flat avg
              </span>
              <Num className="text-base font-semibold text-emerald-900">
                {pIdealAvg.toFixed(2)} <span className="text-xs font-normal text-emerald-700">kph</span>
              </Num>
            </div>
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <div
      className="min-h-screen bg-zinc-50 text-zinc-950 antialiased"
      style={{
        fontFamily:
          '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <style>{`
        .num { font-variant-numeric: tabular-nums; }
        .mono { font-family: "Geist Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
        .slider-thumb { -webkit-appearance: none; appearance: none; }
        .slider-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          background: white;
          border: 2.5px solid #18181b;
          border-radius: 9999px;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(24,24,27,0.2);
        }
        .slider-thumb::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: white;
          border: 2.5px solid #18181b;
          border-radius: 9999px;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(24,24,27,0.2);
        }
        .slider-thumb:disabled::-webkit-slider-thumb { border-color: #a1a1aa; cursor: not-allowed; }
        .slider-thumb:disabled::-moz-range-thumb { border-color: #a1a1aa; cursor: not-allowed; }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
        <header className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
              <img src="/favicon.svg" alt="" aria-hidden="true" className="h-4 w-4" />
              Out and Back
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              TT split calculator
            </span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-950 sm:text-5xl">
            Asymmetric split penalty
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Wind makes your two legs unequal. Average speed becomes the harmonic mean — and you always lose time vs. the no-wind ideal.
          </p>
        </header>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex gap-0.5 rounded-xl bg-zinc-200/70 p-1">
            <ModeTab active={mode === "power"} onClick={() => setMode("power")}>
              Power
            </ModeTab>
            <ModeTab active={mode === "forward"} onClick={() => setMode("forward")}>
              Δv
            </ModeTab>
            <ModeTab active={mode === "reverse"} onClick={() => setMode("reverse")}>
              Splits
            </ModeTab>
          </div>
          <div className="flex items-center gap-2">
            <PresetMenu
              presets={presets}
              onLoad={handleLoadPreset}
              onSave={handleSavePreset}
              onDelete={handleDeletePreset}
            />
            <button
              type="button"
              onClick={handleShare}
              title={shareCopied ? "Copied to clipboard" : "Copy share link"}
              aria-label="Share"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900"
            >
              <ShareIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{shareCopied ? "Copied!" : "Share"}</span>
            </button>
          </div>
        </div>

        {penaltyCard}
        {courseCard}
        {inputsCard}

        {isPower ? (
          <>
            <p className="mono px-1 text-[11px] leading-relaxed text-zinc-500">
              P·η = ½·ρ·CdA·draft·(v + v_w)²·v + (m_r + m_b)·g·(Crr·cosθ + sinθ)·v
            </p>
            <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-zinc-400">
              v, v_w in m/s (UI inputs in kph are divided by 3.6 internally) · θ = atan(grade)
            </p>
            <p className="mt-2 px-1 text-xs leading-relaxed text-zinc-500">
              At fixed power, headwind costs more time than the equivalent tailwind saves — aero drag scales with apparent-wind squared. Wind direction is decomposed into a parallel (head/tail) and crosswind component using your course heading; only the parallel piece changes apparent wind here.
            </p>
            <p className="mt-2 px-1 text-[11px] leading-relaxed text-zinc-500">
              Power model adapted from{" "}
              <a
                href="https://github.com/gmerritt123/ttt_model/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-zinc-300 underline-offset-2 transition hover:text-zinc-900 hover:decoration-zinc-500"
              >
                gmerritt123/ttt_model
              </a>
              .
            </p>
          </>
        ) : (
          <>
            <p className="mono px-1 text-[11px] leading-relaxed text-zinc-500">
              v̄ = 2·v₁·v₂ / (v₁ + v₂) &nbsp;·&nbsp; Δv̄ ≈ Δv² / v_base
            </p>
            <p className="mt-2 px-1 text-xs leading-relaxed text-zinc-500">
              Penalty is quadratic in Δv. ±2 kph barely costs anything; ±10 costs almost a minute on 14 km.
            </p>
          </>
        )}

        <Footer commitSha={commitSha} />
      </div>
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={"rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 " + className}>
      {children}
    </div>
  );
}

function Eyebrow({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
      {children}
    </p>
  );
}

function Num({ children, className = "", ...props }) {
  return (
    <span className={"num " + className} {...props}>
      {children}
    </span>
  );
}

function Separator() {
  return <div className="my-5 h-px w-full bg-zinc-100 sm:my-6" />;
}

function ShareIcon({ className = "h-4 w-4" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.475l6.733-3.366A2.52 2.52 0 0 1 13 4.5Z" />
    </svg>
  );
}

function BookmarkIcon({ className = "h-4 w-4" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" d="M10 2c-1.716 0-3.408.106-5.07.31C3.806 2.45 3 3.414 3 4.517V17.25a.75.75 0 0 0 1.075.676L10 15.082l5.925 2.844A.75.75 0 0 0 17 17.25V4.517c0-1.103-.806-2.068-1.93-2.207A41.403 41.403 0 0 0 10 2Z" clipRule="evenodd" />
    </svg>
  );
}

function PresetMenu({ presets, onLoad, onSave, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Presets"
        aria-label="Presets"
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900"
      >
        <BookmarkIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Presets</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={() => { setOpen(false); onSave(); }}
              className="block w-full px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-900"
            >
              + Save current as…
            </button>
            {presets.length > 0 && <div className="h-px bg-zinc-100" />}
            {presets.map((p) => (
              <div key={p.name} className="flex items-center">
                <button
                  type="button"
                  onClick={() => { setOpen(false); onLoad(p.name); }}
                  className="flex-1 px-3 py-2 text-left text-xs text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-900"
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(p.name)}
                  aria-label={`Delete ${p.name}`}
                  className="px-2 py-2 text-xs text-zinc-400 transition hover:text-rose-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ModeTab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-lg px-4 py-1.5 text-sm font-medium transition-all " +
        (active
          ? "bg-white text-zinc-950 shadow-sm"
          : "text-zinc-600 hover:text-zinc-950")
      }
    >
      {children}
    </button>
  );
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-all " +
        (active
          ? "bg-white text-zinc-950 shadow-sm"
          : "text-zinc-600 hover:text-zinc-950")
      }
    >
      {children}
    </button>
  );
}

function NumberInput({ label, value, onChange, unit, step }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          value={value}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          className="mono w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 pr-12 text-base font-medium text-zinc-950 transition-all hover:border-zinc-300 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/15"
        />
        <span className="mono pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">
          {unit}
        </span>
      </div>
    </div>
  );
}

function SliderInput({ label, value, onChange, min, max, step, unit, disabled = false }) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const clampedPct = Math.max(0, Math.min(100, pct));
  return (
    <div className={disabled ? "opacity-70" : ""}>
      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
        {disabled && (
          <span className="rounded bg-zinc-200 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
            auto
          </span>
        )}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className={
            "slider-thumb h-2 flex-1 rounded-full " +
            (disabled ? "cursor-not-allowed" : "cursor-pointer")
          }
          style={{
            background: disabled
              ? `linear-gradient(to right, #a1a1aa 0%, #a1a1aa ${clampedPct}%, #e4e4e7 ${clampedPct}%, #e4e4e7 100%)`
              : `linear-gradient(to right, #18181b 0%, #18181b ${clampedPct}%, #e4e4e7 ${clampedPct}%, #e4e4e7 100%)`,
          }}
        />
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={value}
            step={step}
            disabled={disabled}
            readOnly={disabled}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onChange(v);
            }}
            className={
              "mono w-20 rounded-lg border px-2 py-1.5 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-zinc-900/15 " +
              (disabled
                ? "border-zinc-200 bg-zinc-100 text-zinc-500"
                : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300 focus:border-zinc-900")
            }
          />
          {unit && (
            <span className="mono whitespace-nowrap text-[11px] text-zinc-400">
              {unit}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function WindCompass({ courseHeadingDeg, windAngleDeg, hasWind }) {
  const cx = 50, cy = 50, r = 38;
  const courseRad = (courseHeadingDeg * Math.PI) / 180;
  const windRad = (windAngleDeg * Math.PI) / 180;

  const outX = cx + r * Math.sin(courseRad);
  const outY = cy - r * Math.cos(courseRad);
  const backX = cx - r * Math.sin(courseRad);
  const backY = cy + r * Math.cos(courseRad);

  const wsx = cx + r * Math.sin(windRad);
  const wsy = cy - r * Math.cos(windRad);
  const innerR = 8;
  const wtx = cx - innerR * Math.sin(windRad);
  const wty = cy + innerR * Math.cos(windRad);

  return (
    <svg viewBox="0 0 100 100" className="h-20 w-20 flex-shrink-0">
      <defs>
        <marker id="course-arrow-head" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill="#3f3f46" />
        </marker>
        <marker id="wind-arrow-head" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 z" fill="#10b981" />
        </marker>
      </defs>

      <circle cx={cx} cy={cy} r={r} fill="white" stroke="#e4e4e7" strokeWidth="1" />

      <line x1={cx} y1={cy - r - 1} x2={cx} y2={cy - r + 3} stroke="#a1a1aa" strokeWidth="1" />
      <text x={cx} y={cy - r - 4} textAnchor="middle" fontSize="7" fontWeight="700" fill="#a1a1aa" fontFamily="ui-monospace, monospace">
        N
      </text>

      <line
        x1={backX}
        y1={backY}
        x2={outX}
        y2={outY}
        stroke="#3f3f46"
        strokeWidth="2.5"
        strokeLinecap="round"
        markerEnd="url(#course-arrow-head)"
      />
      <circle cx={backX} cy={backY} r="2" fill="#3f3f46" />

      {hasWind && (
        <line
          x1={wsx}
          y1={wsy}
          x2={wtx}
          y2={wty}
          stroke="#10b981"
          strokeWidth="2.2"
          strokeLinecap="round"
          markerEnd="url(#wind-arrow-head)"
        />
      )}
    </svg>
  );
}

function PenaltyBlock({ icon, label, value, unit }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5">
      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {icon} {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <Num className="text-2xl font-semibold text-rose-700">{value}</Num>
        <Num className="text-xs text-zinc-500">{unit}</Num>
      </div>
    </div>
  );
}

const REPO_URL = "https://github.com/ekalvi/out-and-back";

function Footer({ commitSha }) {
  const isRealSha = commitSha && commitSha !== "dev" && commitSha !== "unknown";
  const shaHref = isRealSha ? `${REPO_URL}/commit/${commitSha}` : REPO_URL;
  return (
    <footer className="mt-10 border-t border-zinc-200 pt-5">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        <span>outback.q5m.io</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="1" />
              <path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z" />
              <path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z" />
            </svg>
            <span>q5m</span>
          </span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Source on GitHub"
            className="inline-flex items-center text-zinc-500 transition hover:text-zinc-900"
          >
            <GithubIcon />
          </a>
          <a
            href={shaHref}
            target="_blank"
            rel="noopener noreferrer"
            title={commitSha}
            className="font-mono normal-case tracking-normal text-zinc-500 transition hover:text-zinc-900"
          >
            {commitSha?.slice(0, 7) ?? "dev"}
          </a>
        </span>
      </div>
    </footer>
  );
}

function GithubIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.73.5.67 5.56.67 11.83c0 5.02 3.24 9.27 7.74 10.78.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.13-3.15.69-3.81-1.34-3.81-1.34-.51-1.31-1.25-1.66-1.25-1.66-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.51-.29-5.16-1.26-5.16-5.6 0-1.24.44-2.25 1.16-3.04-.12-.29-.5-1.45.11-3.02 0 0 .95-.3 3.11 1.16.9-.25 1.87-.38 2.83-.38.96 0 1.93.13 2.83.38 2.16-1.46 3.11-1.16 3.11-1.16.61 1.57.23 2.73.11 3.02.72.79 1.16 1.8 1.16 3.04 0 4.35-2.66 5.31-5.19 5.59.4.34.76 1.02.76 2.06 0 1.49-.01 2.69-.01 3.06 0 .3.21.66.79.55 4.49-1.5 7.73-5.76 7.73-10.78C23.33 5.56 18.27.5 12 .5z" />
    </svg>
  );
}
