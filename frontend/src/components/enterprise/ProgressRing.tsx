export function ProgressRing({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100));
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative flex h-48 w-48 items-center justify-center">
      <svg className="h-48 w-48 -rotate-90" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={radius} stroke="rgba(148,163,184,0.14)" strokeWidth="10" fill="none" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          stroke="#38BDF8"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-3xl font-bold text-slate-50">{percent.toFixed(0)}%</div>
        <div className="mt-1 text-xs uppercase tracking-[0.28em] text-slate-500">{label}</div>
        <div className="mt-3 text-xs text-slate-400">{value.toLocaleString()} / {max.toLocaleString()}</div>
      </div>
    </div>
  );
}
