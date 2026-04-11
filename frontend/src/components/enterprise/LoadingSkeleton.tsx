export function LoadingSkeleton({
  rows = 4,
  compact = false,
}: {
  rows?: number;
  compact?: boolean;
}) {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-56 rounded bg-slate-800" />
      <div className={`grid gap-4 ${compact ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'}`}>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-32 rounded-2xl border border-white/5 bg-slate-900/40" />
        ))}
      </div>
      <div className="h-96 rounded-2xl border border-white/5 bg-slate-900/40" />
    </div>
  );
}
