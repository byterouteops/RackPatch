export default function ProjectLoading() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-busy="true" aria-label="Loading project">
      <div className="h-3 w-64 rounded bg-slate-200/70" />
      <div className="h-12 rounded-xl bg-white/90 ring-1 ring-slate-200/80" />
      <div className="h-9 w-56 rounded-lg bg-slate-200/80" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70" />
        ))}
      </div>
      <div className="h-72 rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70" />
    </div>
  );
}
