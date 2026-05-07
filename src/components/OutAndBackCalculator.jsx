import { useState } from "react";
import { Wind, Clock, Gauge, ArrowRight, ChevronDown } from "lucide-react";

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

  const [baseSpeed, setBaseSpeed] = useState(45);
  const [distance, setDistance] = useState(14.10);
  const [deltaV, setDeltaV] = useState(5);

  const [vOut, setVOut] = useState(36);
  const [vBack, setVBack] = useState(50);

  const [powerOut, setPowerOut] = useState(298);
  const [powerBack, setPowerBack] = useState(319);
  const [powerAvg, setPowerAvg] = useState(305);
  const [autoPowerSlider, setAutoPowerSlider] = useState("back");
  const [cda, setCda] = useState(0.23);
  const [riderMass, setRiderMass] = useState(75);
  const [bikeMass, setBikeMass] = useState(9);
  const [windKph, setWindKph] = useState(23);
  const [windAngle, setWindAngle] = useState(12);
  const [courseHeading, setCourseHeading] = useState(315);
  const [grade, setGrade] = useState(0);
  const [crr, setCrr] = useState(0.004);
  const [lossDt, setLossDt] = useState(2);
  const [rho, setRho] = useState(1.225);
  const [draft, setDraft] = useState(1.0);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const fOut = Math.max(0.1, baseSpeed - deltaV);
  const fBack = baseSpeed + deltaV;
  const fAvg = (2 * fOut * fBack) / (fOut + fBack);
  const fDvAvg = baseSpeed - fAvg;
  const fTBase = (distance / baseSpeed) * 60;
  const fTAct = (distance / fAvg) * 60;
  const fDt = (fTAct - fTBase) * 60;

  const rOut = Math.max(0.1, vOut);
  const rBack = Math.max(0.1, vBack);
  const rBase = (rOut + rBack) / 2;
  const rAvg = (2 * rOut * rBack) / (rOut + rBack);
  const rDvAvg = rBase - rAvg;
  const rTBase = (distance / rBase) * 60;
  const rTAct = (distance / rAvg) * 60;
  const rDt = (rTAct - rTBase) * 60;

  const totalMass = riderMass + bikeMass;
  const relAngleRad = ((windAngle - courseHeading) * Math.PI) / 180;
  const windParallelKph = windKph * Math.cos(relAngleRad);
  const windCrossKph = Math.abs(windKph * Math.sin(relAngleRad));
  const windParallelMs = windParallelKph / 3.6;

  const physicsBase = { cda, mass: totalMass, crr, lossDtPct: lossDt, rho, draft };
  const vhwOutMs = +windParallelMs;
  const vhwBackMs = -windParallelMs;
  const gradeOut = +grade;
  const gradeBack = -grade;

  let displayedOut = powerOut;
  let displayedBack = powerBack;
  let displayedAvg = powerAvg;

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

  const pOutMs = solveSpeedFromPower({ ...physicsBase, power: displayedOut, vhwMs: vhwOutMs, gradePct: gradeOut });
  const pBackMs = solveSpeedFromPower({ ...physicsBase, power: displayedBack, vhwMs: vhwBackMs, gradePct: gradeBack });
  const pOut = pOutMs * 3.6;
  const pBack = pBackMs * 3.6;

  if (autoPowerSlider === "avg") {
    displayedAvg = (displayedOut / pOut + displayedBack / pBack) / (1 / pOut + 1 / pBack);
  }

  const pIdealMs = solveSpeedFromPower({ ...physicsBase, power: displayedAvg, vhwMs: 0, gradePct: 0 });
  const pIdealAvg = pIdealMs * 3.6;
  const pAvg = (2 * pOut * pBack) / (pOut + pBack);
  const pDvAvg = pIdealAvg - pAvg;
  const pTBase = (distance / pIdealAvg) * 60;
  const pTAct = (distance / pAvg) * 60;
  const pDt = (pTAct - pTBase) * 60;

  const isReverse = mode === "reverse";
  const isPower = mode === "power";
  let data;
  if (isPower) {
    data = { base: pIdealAvg, vOut: pOut, vBack: pBack, vAvg: pAvg, dvAvg: pDvAvg, tBase: pTBase, tAct: pTAct, dt: pDt };
  } else if (isReverse) {
    data = { base: rBase, vOut: rOut, vBack: rBack, vAvg: rAvg, dvAvg: rDvAvg, tBase: rTBase, tAct: rTAct, dt: rDt };
  } else {
    data = { base: baseSpeed, vOut: fOut, vBack: fBack, vAvg: fAvg, dvAvg: fDvAvg, tBase: fTBase, tAct: fTAct, dt: fDt };
  }

  const formatTime = (mins) => {
    if (!isFinite(mins) || mins < 0) return "—:——.—";
    const totalTenths = Math.round(mins * 600);
    const m = Math.floor(totalTenths / 600);
    const remaining = totalTenths - m * 600;
    const s = Math.floor(remaining / 10);
    const tenths = remaining - s * 10;
    return `${m}:${s.toString().padStart(2, "0")}.${tenths}`;
  };

  const sliderPct = (deltaV / 15) * 100;

  function handleAutoChange(newTarget) {
    if (autoPowerSlider === "out") setPowerOut(Math.round(displayedOut));
    else if (autoPowerSlider === "back") setPowerBack(Math.round(displayedBack));
    else if (autoPowerSlider === "avg") setPowerAvg(Math.round(displayedAvg));
    setAutoPowerSlider(newTarget);
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
          <div className="flex flex-1 items-center justify-between border-r border-zinc-200 bg-zinc-50 px-3">
            <ArrowRight className="h-3.5 w-3.5 text-zinc-700" strokeWidth={2.5} />
            <Num className="text-xs font-semibold text-zinc-900">
              {data.vOut.toFixed(1)} kph
            </Num>
          </div>
          <div className="flex flex-1 items-center justify-between bg-emerald-50 px-3">
            <Num className="text-xs font-semibold text-emerald-900">
              {data.vBack.toFixed(1)} kph
            </Num>
            <ArrowRight className="h-3.5 w-3.5 rotate-180 text-emerald-700" strokeWidth={2.5} />
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
              <NumberInput label="Base speed" value={baseSpeed} onChange={setBaseSpeed} unit="kph" step={0.5} />
              <NumberInput label="Distance" value={distance} onChange={setDistance} unit="km" step={0.1} />
            </div>
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Δv per leg
                </label>
                <Num className="text-sm">
                  <span className="font-semibold text-zinc-950">±{deltaV.toFixed(1)}</span>
                  <span className="ml-1 text-zinc-400">kph</span>
                </Num>
              </div>
              <input
                type="range"
                min="0"
                max="15"
                step="0.5"
                value={deltaV}
                onChange={(e) => setDeltaV(parseFloat(e.target.value))}
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
            </div>
          </div>
        )}
        {mode === "reverse" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Out leg" value={vOut} onChange={setVOut} unit="kph" step={0.5} />
              <NumberInput label="Back leg" value={vBack} onChange={setVBack} unit="kph" step={0.5} />
            </div>
            <NumberInput label="Total distance" value={distance} onChange={setDistance} unit="km" step={0.1} />
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                Implied no-wind speed
              </span>
              <Num className="text-base font-semibold text-emerald-900">
                {rBase.toFixed(2)} <span className="text-xs font-normal text-emerald-700">kph</span>
              </Num>
            </div>
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
              <div className="grid grid-cols-2 gap-3">
                <NumberInput label="Bike mass" value={bikeMass} onChange={setBikeMass} unit="kg" step={0.1} />
                <NumberInput label="Crr" value={crr} onChange={setCrr} unit="" step={0.0005} />
                <NumberInput label="Drivetrain loss" value={lossDt} onChange={setLossDt} unit="%" step={0.5} />
                <NumberInput label="Air density" value={rho} onChange={setRho} unit="kg/m³" step={0.005} />
                <NumberInput label="Draft factor" value={draft} onChange={setDraft} unit="" step={0.05} />
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

        <div className="mb-5 inline-flex gap-0.5 rounded-xl bg-zinc-200/70 p-1">
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
