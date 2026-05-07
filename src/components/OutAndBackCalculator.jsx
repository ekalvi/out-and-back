import { useState } from 'react';
import { Wind, Clock, Gauge, Bike, ArrowRight } from 'lucide-react';

export default function OutAndBackCalculator() {
  const [mode, setMode] = useState('forward');

  // Forward inputs
  const [baseSpeed, setBaseSpeed] = useState(45);
  const [distance, setDistance] = useState(14.10);
  const [deltaV, setDeltaV] = useState(5);

  // Reverse inputs (default to Erik's actual TT)
  const [vOut, setVOut] = useState(36);
  const [vBack, setVBack] = useState(50);

  // Forward calc
  const fOut = Math.max(0.1, baseSpeed - deltaV);
  const fBack = baseSpeed + deltaV;
  const fAvg = (2 * fOut * fBack) / (fOut + fBack);
  const fDvAvg = baseSpeed - fAvg;
  const fTBase = (distance / baseSpeed) * 60;
  const fTAct = (distance / fAvg) * 60;
  const fDt = (fTAct - fTBase) * 60;

  // Reverse calc — midpoint of legs is the implied no-wind base
  const rOut = Math.max(0.1, vOut);
  const rBack = Math.max(0.1, vBack);
  const rBase = (rOut + rBack) / 2;
  const rAvg = (2 * rOut * rBack) / (rOut + rBack);
  const rDvAvg = rBase - rAvg;
  const rTBase = (distance / rBase) * 60;
  const rTAct = (distance / rAvg) * 60;
  const rDt = (rTAct - rTBase) * 60;

  const isReverse = mode === 'reverse';
  const data = isReverse
    ? { base: rBase, vOut: rOut, vBack: rBack, vAvg: rAvg, dvAvg: rDvAvg, tBase: rTBase, tAct: rTAct, dt: rDt }
    : { base: baseSpeed, vOut: fOut, vBack: fBack, vAvg: fAvg, dvAvg: fDvAvg, tBase: fTBase, tAct: fTAct, dt: fDt };

  const formatTime = (mins) => {
    if (!isFinite(mins) || mins < 0) return '—:——.—';
    const totalTenths = Math.round(mins * 600);
    const m = Math.floor(totalTenths / 600);
    const remaining = totalTenths - m * 600;
    const s = Math.floor(remaining / 10);
    const tenths = remaining - s * 10;
    return `${m}:${s.toString().padStart(2, '0')}.${tenths}`;
  };

  const sliderPct = (deltaV / 15) * 100;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600;700&display=swap');
        .font-geist { font-family: 'Geist', ui-sans-serif, system-ui, sans-serif; }
        .font-mono-g { font-family: 'Geist Mono', ui-monospace, 'SF Mono', monospace; font-feature-settings: 'tnum' on, 'cv11' on; }
        .slider-thumb { -webkit-appearance: none; appearance: none; }
        .slider-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          background: white;
          border: 2.5px solid #f97316;
          border-radius: 9999px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(249,115,22,0.35);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .slider-thumb::-webkit-slider-thumb:hover { transform: scale(1.12); box-shadow: 0 3px 12px rgba(249,115,22,0.5); }
        .slider-thumb::-webkit-slider-thumb:active { transform: scale(1.05); }
        .slider-thumb::-moz-range-thumb {
          width: 22px;
          height: 22px;
          background: white;
          border: 2.5px solid #f97316;
          border-radius: 9999px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(249,115,22,0.35);
        }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.25s ease-out; }
      `}</style>

      <div
        className="min-h-screen font-geist bg-stone-50 text-stone-900 p-4 md:p-8"
        style={{
          backgroundImage:
            'radial-gradient(circle at 15% 0%, rgba(249,115,22,0.05) 0, transparent 55%), radial-gradient(circle at 85% 100%, rgba(16,185,129,0.04) 0, transparent 55%)',
        }}
      >
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-stone-900 flex items-center justify-center shadow-md">
                <Bike className="w-4 h-4 text-orange-400" strokeWidth={2.2} />
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Out-and-back TT
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-stone-900 mb-2 leading-[1.1]">
              Asymmetric split penalty
            </h1>
            <p className="text-sm text-stone-600 max-w-md leading-relaxed">
              Wind makes your two legs unequal. Average speed becomes the harmonic mean — and you always lose time vs. the no-wind ideal.
            </p>
          </header>

          {/* Mode tabs */}
          <div className="inline-flex p-1 bg-stone-200/70 rounded-xl mb-5 gap-0.5">
            <button
              onClick={() => setMode('forward')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                !isReverse
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Predict penalty
            </button>
            <button
              onClick={() => setMode('reverse')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                isReverse
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Analyze splits
            </button>
          </div>

          {/* Inputs card */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 mb-4 shadow-sm">
            {!isReverse ? (
              <div className="space-y-5 fade-in">
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput
                    label="Base speed"
                    value={baseSpeed}
                    onChange={setBaseSpeed}
                    unit="kph"
                    step={0.5}
                  />
                  <NumberInput
                    label="Distance"
                    value={distance}
                    onChange={setDistance}
                    unit="km"
                    step={0.1}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-baseline mb-2">
                    <label className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                      Δv per leg
                    </label>
                    <div className="font-mono-g text-sm">
                      <span className="text-stone-900 font-semibold">±{deltaV.toFixed(1)}</span>
                      <span className="text-stone-400 ml-1">kph</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="15"
                    step="0.5"
                    value={deltaV}
                    onChange={(e) => setDeltaV(parseFloat(e.target.value))}
                    className="w-full h-2 rounded-full cursor-pointer slider-thumb"
                    style={{
                      background: `linear-gradient(to right, #f97316 0%, #f97316 ${sliderPct}%, #e7e5e4 ${sliderPct}%, #e7e5e4 100%)`,
                    }}
                  />
                  <div className="flex justify-between text-[10px] text-stone-400 mt-1.5 font-mono-g">
                    <span>0</span>
                    <span>5</span>
                    <span>10</span>
                    <span>15</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 fade-in">
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput
                    label="Out leg"
                    value={vOut}
                    onChange={setVOut}
                    unit="kph"
                    step={0.5}
                  />
                  <NumberInput
                    label="Back leg"
                    value={vBack}
                    onChange={setVBack}
                    unit="kph"
                    step={0.5}
                  />
                </div>
                <NumberInput
                  label="Total distance"
                  value={distance}
                  onChange={setDistance}
                  unit="km"
                  step={0.1}
                />
                <div className="px-3 py-2.5 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                    Implied no-wind speed
                  </span>
                  <span className="font-mono-g text-base font-semibold text-emerald-900">
                    {rBase.toFixed(2)} <span className="text-xs font-normal text-emerald-700">kph</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Course profile visualization */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 mb-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Course profile
              </div>
              <div className="font-mono-g text-[11px] text-stone-500">
                {distance.toFixed(2)} km · turn at {(distance / 2).toFixed(2)}
              </div>
            </div>

            <div className="relative">
              <div className="flex h-9 rounded-lg overflow-hidden border border-stone-200">
                <div className="flex-1 bg-orange-50 border-r border-stone-200 flex items-center justify-between px-3">
                  <ArrowRight className="w-3.5 h-3.5 text-orange-700" strokeWidth={2.5} />
                  <span className="font-mono-g text-xs font-semibold text-orange-900">
                    {data.vOut.toFixed(1)} kph
                  </span>
                </div>
                <div className="flex-1 bg-emerald-50 flex items-center justify-between px-3">
                  <span className="font-mono-g text-xs font-semibold text-emerald-900">
                    {data.vBack.toFixed(1)} kph
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-700 rotate-180" strokeWidth={2.5} />
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-stone-500 mt-1.5 font-mono-g uppercase tracking-wider">
                <span>start</span>
                <span className="absolute left-1/2 -translate-x-1/2">turn</span>
                <span>finish</span>
              </div>
            </div>
          </div>

          {/* Results card */}
          <div className="bg-stone-900 text-stone-100 rounded-2xl overflow-hidden shadow-xl shadow-stone-900/15">
            <div className="px-6 py-3.5 border-b border-stone-800 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                {isReverse ? 'vs no-wind potential' : 'Penalty vs ideal'}
              </div>
              <div className="font-mono-g text-[11px] text-stone-500">
                base @ {data.base.toFixed(2)} kph
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Time comparison */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" strokeWidth={2.5} /> Ideal
                  </div>
                  <div className="font-mono-g text-3xl font-semibold text-emerald-300 leading-none">
                    {formatTime(data.tBase)}
                  </div>
                  <div className="text-[11px] text-stone-500 mt-1.5 font-mono-g">
                    {data.base.toFixed(2)} kph
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-orange-400 font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Wind className="w-3 h-3" strokeWidth={2.5} /> Actual
                  </div>
                  <div className="font-mono-g text-3xl font-semibold text-orange-300 leading-none">
                    {formatTime(data.tAct)}
                  </div>
                  <div className="text-[11px] text-stone-500 mt-1.5 font-mono-g">
                    {data.vAvg.toFixed(2)} kph avg
                  </div>
                </div>
              </div>

              {/* Penalty boxes */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-stone-800">
                <div className="bg-stone-800/60 border border-stone-700/40 rounded-xl p-3.5">
                  <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Gauge className="w-3 h-3" strokeWidth={2.5} /> Speed loss
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono-g text-2xl font-semibold text-orange-300">
                      −{data.dvAvg.toFixed(2)}
                    </span>
                    <span className="text-xs text-stone-500 font-mono-g">kph</span>
                  </div>
                </div>
                <div className="bg-stone-800/60 border border-stone-700/40 rounded-xl p-3.5">
                  <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" strokeWidth={2.5} /> Time loss
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono-g text-2xl font-semibold text-orange-300">
                      +{data.dt.toFixed(1)}
                    </span>
                    <span className="text-xs text-stone-500 font-mono-g">sec</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Math reference */}
          <div className="mt-6 px-1">
            <div className="font-mono-g text-[11px] text-stone-500 leading-relaxed">
              v̄ = 2·v₁·v₂ / (v₁ + v₂) &nbsp;·&nbsp; Δv̄ = Δv² / v_base
            </div>
            <div className="text-xs text-stone-500 mt-2 leading-relaxed">
              Penalty is quadratic in Δv. ±2 kph barely costs anything; ±10 costs almost a minute on 14 km.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function NumberInput({ label, value, onChange, unit, step }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1.5">
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
          className="w-full px-3 py-2.5 pr-12 bg-stone-50 border border-stone-200 rounded-lg font-mono-g text-base font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-orange-500 transition-all hover:border-stone-300"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-stone-400 font-mono-g pointer-events-none">
          {unit}
        </span>
      </div>
    </div>
  );
}
