import { useState } from "react";
import { Wind, Clock, Gauge, ArrowRight } from "lucide-react";

export default function OutAndBackCalculator({ commitSha }) {
  const [mode, setMode] = useState("forward");

  const [baseSpeed, setBaseSpeed] = useState(45);
  const [distance, setDistance] = useState(14.10);
  const [deltaV, setDeltaV] = useState(5);

  const [vOut, setVOut] = useState(36);
  const [vBack, setVBack] = useState(50);

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

  const isReverse = mode === "reverse";
  const data = isReverse
    ? { base: rBase, vOut: rOut, vBack: rBack, vAvg: rAvg, dvAvg: rDvAvg, tBase: rTBase, tAct: rTAct, dt: rDt }
    : { base: baseSpeed, vOut: fOut, vBack: fBack, vAvg: fAvg, dvAvg: fDvAvg, tBase: fTBase, tAct: fTAct, dt: fDt };

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
          <ModeTab active={!isReverse} onClick={() => setMode("forward")}>
            Predict penalty
          </ModeTab>
          <ModeTab active={isReverse} onClick={() => setMode("reverse")}>
            Analyze splits
          </ModeTab>
        </div>

        <Card className="mb-4">
          <Eyebrow>{isReverse ? "Observed leg speeds" : "Forward inputs"}</Eyebrow>
          <div className="mt-4">
            {!isReverse ? (
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
            ) : (
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
          </div>
        </Card>

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

        <Card className="mb-8">
          <div className="flex items-baseline justify-between">
            <Eyebrow>{isReverse ? "vs no-wind potential" : "Penalty vs ideal"}</Eyebrow>
            <Num className="text-[11px] text-zinc-500">
              base @ {data.base.toFixed(2)} kph
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
              value={`−${data.dvAvg.toFixed(2)}`}
              unit="kph"
            />
            <PenaltyBlock
              icon={<Clock className="h-3 w-3" strokeWidth={2.5} />}
              label="Time loss"
              value={`+${data.dt.toFixed(1)}`}
              unit="sec"
            />
          </div>
        </Card>

        <p className="mono px-1 text-[11px] leading-relaxed text-zinc-500">
          v̄ = 2·v₁·v₂ / (v₁ + v₂) &nbsp;·&nbsp; Δv̄ ≈ Δv² / v_base
        </p>
        <p className="mt-2 px-1 text-xs leading-relaxed text-zinc-500">
          Penalty is quadratic in Δv. ±2 kph barely costs anything; ±10 costs almost a minute on 14 km.
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

function Footer({ commitSha }) {
  return (
    <footer className="mt-10 border-t border-zinc-200 pt-5">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        <span>outback.q5m.io</span>
        <span className="flex items-center gap-2">
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
          <span className="font-mono normal-case tracking-normal" title={commitSha}>
            {commitSha?.slice(0, 7) ?? "dev"}
          </span>
        </span>
      </div>
    </footer>
  );
}
