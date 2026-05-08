import { useState, useEffect } from "react";
import { Wind, Clock, Gauge, ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import {
  solveSpeedFromPower,
  findPowerForAvg,
  findPowerBackForAvgSpeed,
  bisectPowerForAbsDeltaV,
  impliedCdAFromSplits,
  impliedCdAFromSingleSpeed,
  impliedWindSpeedFromSplits,
  optimizePowerSplit,
} from "../lib/physics.js";

const STATE_KEYS = [
  ["mode", "md", "string"],
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

const DEFAULTS = {
  mode: "splits",
  distance: 16.00,
  vOut: 34.0,
  vBack: 46.4,
  powerOut: 250,
  powerBack: 250,
  powerAvg: 250,
  autoPowerSlider: "back",
  cda: 0.25,
  riderMass: 75,
  bikeMass: 9,
  windKph: 15,
  windFactorPct: 70,
  windAngle: 20,
  courseHeading: 0,
  grade: 0,
  crr: 0.004,
  lossDt: 2,
  rho: 1.225,
  draft: 1.0,
};

export default function OutAndBackCalculator({ commitSha }) {
  const [mode, setMode] = useState(DEFAULTS.mode);
  const [distance, setDistance] = useState(DEFAULTS.distance);
  const [vOut, setVOut] = useState(DEFAULTS.vOut);
  const [vBack, setVBack] = useState(DEFAULTS.vBack);

  const [powerOut, setPowerOut] = useState(DEFAULTS.powerOut);
  const [powerBack, setPowerBack] = useState(DEFAULTS.powerBack);
  const [powerAvg, setPowerAvg] = useState(DEFAULTS.powerAvg);
  const [autoPowerSlider, setAutoPowerSlider] = useState(DEFAULTS.autoPowerSlider);
  const [cda, setCda] = useState(DEFAULTS.cda);
  const [riderMass, setRiderMass] = useState(DEFAULTS.riderMass);
  const [bikeMass, setBikeMass] = useState(DEFAULTS.bikeMass);
  const [windKph, setWindKph] = useState(DEFAULTS.windKph);
  const [windFactorPct, setWindFactorPct] = useState(DEFAULTS.windFactorPct);
  const [windAngle, setWindAngle] = useState(DEFAULTS.windAngle);
  const [courseHeading, setCourseHeading] = useState(DEFAULTS.courseHeading);
  const [grade, setGrade] = useState(DEFAULTS.grade);
  const [crr, setCrr] = useState(DEFAULTS.crr);
  const [lossDt, setLossDt] = useState(DEFAULTS.lossDt);
  const [rho, setRho] = useState(DEFAULTS.rho);
  const [draft, setDraft] = useState(DEFAULTS.draft);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = encodeStateToHash({
      mode, distance, vOut, vBack, powerOut, powerBack, powerAvg, autoPowerSlider,
      cda, riderMass, bikeMass,
      windKph, windFactorPct, windAngle, courseHeading,
      grade, crr, lossDt, rho, draft,
    });
    const url = `${window.location.pathname}${window.location.search}${hash ? "#" + hash : ""}`;
    window.history.replaceState(null, "", url);
  }, [
    mode, distance, vOut, vBack, powerOut, powerBack, powerAvg, autoPowerSlider,
    cda, riderMass, bikeMass,
    windKph, windFactorPct, windAngle, courseHeading,
    grade, crr, lossDt, rho, draft,
  ]);

  const isSplit = mode === "splits";
  const totalMass = riderMass + bikeMass;
  const windFactor = windFactorPct / 100;
  const effectiveWindKph = windKph * windFactor;
  const relAngleRad = ((windAngle - courseHeading) * Math.PI) / 180;
  const windParallelKph = effectiveWindKph * Math.cos(relAngleRad);
  const windParallelMs = windParallelKph / 3.6;

  const vhwOutMs = +windParallelMs;
  const vhwBackMs = -windParallelMs;
  const gradeOut = +grade;
  const gradeBack = -grade;

  const physicsBase = { cda, mass: totalMass, crr, lossDtPct: lossDt, rho, draft };

  let displayedOut = powerOut;
  let displayedBack = powerBack;
  let displayedAvg = powerAvg;

  if (isSplit) {
    if (autoPowerSlider === "out") {
      displayedOut = findPowerForAvg({
        targetAvg: powerAvg, fixedPower: powerBack, fixedLeg: "back",
        physics: physicsBase, vhwOutMs, vhwBackMs, gradeOut, gradeBack,
      });
    } else if (autoPowerSlider === "back") {
      displayedBack = findPowerForAvg({
        targetAvg: powerAvg, fixedPower: powerOut, fixedLeg: "out",
        physics: physicsBase, vhwOutMs, vhwBackMs, gradeOut, gradeBack,
      });
    }
  } else {
    // Point-to-point: single leg, single power. Avg power == leg power.
    displayedOut = powerAvg;
    displayedBack = powerAvg;
    displayedAvg = powerAvg;
  }

  const pOutMs = solveSpeedFromPower({ ...physicsBase, power: displayedOut, vhwMs: vhwOutMs, gradePct: gradeOut });
  const pBackMs = isSplit
    ? solveSpeedFromPower({ ...physicsBase, power: displayedBack, vhwMs: vhwBackMs, gradePct: gradeBack })
    : pOutMs;
  const pOut = pOutMs * 3.6;
  const pBack = pBackMs * 3.6;

  if (isSplit && autoPowerSlider === "avg") {
    displayedAvg = (displayedOut / pOut + displayedBack / pBack) / (1 / pOut + 1 / pBack);
  }

  // Calibration helper (always computed): given observed splits, what CdA fits?
  const derivedCda = isSplit
    ? impliedCdAFromSplits({
        vOutKph: vOut, vBackKph: vBack,
        pOut: displayedOut, pBack: displayedBack,
        vhwParallelMs: windParallelMs,
        gradeOut, gradeBack,
        physics: { mass: totalMass, crr, lossDtPct: lossDt, rho, draft },
      })
    : impliedCdAFromSingleSpeed({
        vKph: vOut, power: displayedOut,
        vhwMs: vhwOutMs, gradePct: gradeOut,
        physics: { mass: totalMass, crr, lossDtPct: lossDt, rho, draft },
      });

  // Derived wind speed: only meaningful from splits asymmetry.
  const derivedWindKph = isSplit
    ? impliedWindSpeedFromSplits({
        vOutKph: vOut, vBackKph: vBack,
        pOut: displayedOut, pBack: displayedBack,
        factor: windFactor, relAngleRad,
        gradeOut, gradeBack,
        physics: { cda, mass: totalMass, crr, lossDtPct: lossDt, rho, draft },
      })
    : 0;

  const pAvg = isSplit ? (2 * pOut * pBack) / (pOut + pBack) : pOut;
  const pIdealMs = solveSpeedFromPower({ ...physicsBase, power: displayedAvg, vhwMs: 0, gradePct: 0 });
  const pIdealAvg = pIdealMs * 3.6;
  const pDvAvg = pIdealAvg - pAvg;
  const pTBase = (distance / pIdealAvg) * 60;
  const pTAct = (distance / pAvg) * 60;
  const pDt = (pTAct - pTBase) * 60;

  const data = {
    base: pIdealAvg, vOut: pOut, vBack: pBack, vAvg: pAvg,
    dvAvg: pDvAvg, tBase: pTBase, tAct: pTAct, dt: pDt,
    headOut: windParallelKph,
  };
  const derivedDeltaV = Math.abs((pBack - pOut) / 2);

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
    const targetAvgSpeedKph = pAvg;
    const newPowerOut = bisectPowerForAbsDeltaV({
      targetDvKph,
      targetAvgSpeedKph,
      physics: physicsBase,
      vhwOutMs, vhwBackMs, gradeOut, gradeBack,
    });
    const newPowerBack = findPowerBackForAvgSpeed({
      targetAvgSpeedKph, fixedPowerOut: newPowerOut,
      physics: physicsBase, vhwOutMs, vhwBackMs, gradeOut, gradeBack,
    });
    setPowerOut(Math.round(newPowerOut));
    setPowerBack(Math.round(newPowerBack));
    setAutoPowerSlider("avg");
  }

  function handleOptimize() {
    const optPowerOut = optimizePowerSplit({
      targetAvg: displayedAvg,
      physics: physicsBase,
      vhwOutMs, vhwBackMs, gradeOut, gradeBack,
      distance,
    });
    const optPowerBack = findPowerForAvg({
      targetAvg: displayedAvg, fixedPower: optPowerOut, fixedLeg: "out",
      physics: physicsBase, vhwOutMs, vhwBackMs, gradeOut, gradeBack,
    });
    setPowerOut(Math.round(optPowerOut));
    setPowerBack(Math.round(optPowerBack));
    setAutoPowerSlider("avg");
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

  function handleReset() {
    if (!window.confirm("Reset all inputs to defaults?")) return;
    applyState(DEFAULTS);
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  const penaltyCard = (
    <Card className="mb-4">
      <div className="grid grid-cols-2 gap-6 sm:gap-10">
        <div>
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            <Clock className="h-3 w-3" strokeWidth={2.5} /> Ideal
          </div>
          <Num className="mt-2 block text-4xl font-bold tracking-tight text-emerald-700 sm:text-5xl">
            {formatTime(data.tBase)}
          </Num>
          <Num className="mt-1.5 block text-sm font-medium text-emerald-700/80">
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
          <Num className="mt-1.5 block text-sm font-medium text-rose-700/80">
            {data.vAvg.toFixed(2)} kph
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
        {isSplit && (
          <Num className="text-[11px] text-zinc-500">
            turn at {(distance / 2).toFixed(2)} km
          </Num>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto]">
        <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
          <NumberInput label="Distance" value={distance} onChange={setDistance} unit="km" step={0.1} />
          <SliderInput label="Heading" value={courseHeading} onChange={setCourseHeading} min={0} max={360} step={5} unit="°" />
          <SliderInput label="Wind speed" value={windKph} onChange={setWindKph} min={0} max={50} step={0.5} unit="kph" />
          <SliderInput label="Wind from" value={windAngle} onChange={setWindAngle} min={0} max={360} step={5} unit="°" />
        </div>
        <div className="flex justify-center sm:block">
          <WindCompass courseHeadingDeg={courseHeading} windAngleDeg={windAngle} hasWind={windKph > 0.05} />
        </div>
      </div>

      <div className="relative mt-5">
        {isSplit && (
          <div className="relative mb-1.5 h-4">
            <ResetIcon className="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 text-zinc-500" />
          </div>
        )}
        <div className="flex h-9 overflow-hidden rounded-lg border border-zinc-200">
          {isSplit ? (
            <>
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
            </>
          ) : (
            <div
              className="flex flex-1 items-center justify-between px-3 transition-colors"
              style={{ backgroundColor: legBackground(+data.headOut) }}
            >
              <ArrowRight className="h-3.5 w-3.5 text-zinc-700" strokeWidth={2.5} />
              <Num className="text-xs font-semibold text-zinc-900">
                {data.vOut.toFixed(1)} kph
              </Num>
            </div>
          )}
        </div>
        <div className="mono mt-1.5 flex justify-between text-[10px] uppercase tracking-wider text-zinc-500">
          <span>start</span>
          {isSplit && <span className="absolute left-1/2 -translate-x-1/2">turn</span>}
          <span>finish</span>
        </div>
      </div>
    </Card>
  );

  const inputsCard = (
    <Card className="mb-8">
      <Eyebrow>Inputs</Eyebrow>
      <div className="mt-4 space-y-5">
            <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
              {isSplit ? (
                <>
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
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Optimize split for fastest time
                  </button>
                </>
              ) : (
                <>
                  <Eyebrow>Power</Eyebrow>
                  <SliderInput
                    label="Power"
                    value={powerAvg}
                    onChange={setPowerAvg}
                    min={100} max={500} step={5} unit="W"
                  />
                </>
              )}
            </div>

            {isSplit && (
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
            )}

            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="CdA" value={cda} onChange={setCda} unit="m²" step={0.005} />
              <NumberInput label="Rider mass" value={riderMass} onChange={setRiderMass} unit="kg" step={0.5} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label={isSplit ? "Grade (out)" : "Grade"} value={grade} onChange={setGrade} unit="%" step={0.1} />
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

            <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
              <Eyebrow>Calibrate from actual ride</Eyebrow>
              {isSplit ? (
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput label="Out leg observed" value={vOut} onChange={setVOut} unit="kph" step={0.1} />
                  <NumberInput label="Back leg observed" value={vBack} onChange={setVBack} unit="kph" step={0.1} />
                </div>
              ) : (
                <NumberInput label="Speed observed" value={vOut} onChange={setVOut} unit="kph" step={0.1} />
              )}
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Derived CdA</span>
                <Num className="text-base font-semibold text-amber-900">
                  {derivedCda.toFixed(3)} <span className="text-xs font-normal text-amber-700">m²</span>
                </Num>
              </div>
              <button
                type="button"
                onClick={() => setCda(parseFloat(derivedCda.toFixed(3)))}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
              >
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
                Use derived CdA
              </button>
              {isSplit && (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Derived wind speed</span>
                    <Num className="text-base font-semibold text-amber-900">
                      {derivedWindKph.toFixed(1)} <span className="text-xs font-normal text-amber-700">kph</span>
                    </Num>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWindKph(parseFloat(derivedWindKph.toFixed(1)))}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Use derived wind speed
                  </button>
                </>
              )}
              <p className="text-[10px] leading-relaxed text-zinc-500">
                {isSplit
                  ? "Enter your actual leg speeds to back-solve. Derived CdA matches the average speed; derived wind speed matches the speed delta between legs. If wind speed pegs to 0 or 100, your observed Δv can't be explained by wind alone — check that course heading and wind direction reflect your ride."
                  : "Enter your actual leg speed to back-solve CdA against this power, wind, and grade. Wind speed can't be back-solved from a single observation — that requires splits."}
              </p>
            </div>
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
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
            >
              <img src="/favicon.svg" alt="" aria-hidden="true" className="h-4 w-4" />
              Out and Back
            </a>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-950 sm:text-5xl">
            TT Calculator
          </h1>
        </header>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-0.5 rounded-md bg-zinc-200/70 p-0.5">
            <ToggleBtn active={mode === "splits"} onClick={() => setMode("splits")}>Out &amp; back</ToggleBtn>
            <ToggleBtn active={mode === "p2p"} onClick={() => setMode("p2p")}>Point to point</ToggleBtn>
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
              onClick={handleReset}
              title="Reset to defaults"
              aria-label="Reset to defaults"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900"
            >
              <ResetIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Reset</span>
            </button>
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

function ResetIcon({ className = "h-4 w-4" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
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
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    // Sync external value into the local input draft only when the field isn't
    // being edited, so programmatic updates (presets, optimizer) don't fight
    // user typing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!focused) setText(String(value));
  }, [value, focused]);
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          value={text}
          step={step}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            const v = parseFloat(text);
            if (isNaN(v)) setText(String(value));
            else if (v !== value) onChange(v);
          }}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const v = parseFloat(next);
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
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!focused) setText(String(value));
  }, [value, focused]);
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
            value={text}
            step={step}
            disabled={disabled}
            readOnly={disabled}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              const v = parseFloat(text);
              if (isNaN(v)) setText(String(value));
              else if (v !== value) onChange(v);
            }}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              const v = parseFloat(next);
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
    <div>
      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {icon} {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <Num className="text-base font-semibold text-zinc-700">{value}</Num>
        <Num className="text-[11px] text-zinc-500">{unit}</Num>
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
        <span>
          Made in Canada 🇨🇦 by{" "}
          <a
            href="https://github.com/ekalvi"
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-zinc-900"
          >
            ekalvi
          </a>
        </span>
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
