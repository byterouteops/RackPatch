export default function AppLoading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded-lg bg-slate-200/80" />
      <div className="h-4 w-96 max-w-full rounded bg-slate-200/60" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-white/80 shadow-sm ring-1 ring-slate-200/80" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-white/80 shadow-sm ring-1 ring-slate-200/80" />
    </div>
  );
}
