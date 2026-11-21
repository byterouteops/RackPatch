import { Search } from "lucide-react";
import { requireSessionUser } from "@/lib/session";
import { globalSearch } from "@/lib/search/global-search";
import { PageHeader, EmptyState } from "@/components/ui";
import { GlobalSearchPageClient } from "@/components/global-search-page-client";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireSessionUser();
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const hits = query.length >= 2 ? await globalSearch(user, query) : [];

  return (
    <div>
      <PageHeader
        title="Global search"
        description="Find cables, devices, and projects across workspaces you can access."
      />
      <GlobalSearchPageClient initialQ={query} />
      {query.length >= 2 && hits.length === 0 && (
        <EmptyState
          icon={<Search className="h-5 w-5" aria-hidden />}
          title="No results"
          description={`Nothing matched “${query}”.`}
        />
      )}
      {hits.length > 0 && (
        <ul className="mt-4 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {hits.map((h) => (
            <li key={`${h.kind}-${h.id}`}>
              <a href={h.href} className="block px-4 py-3 hover:bg-[var(--muted)]">
                <p className="text-sm font-semibold text-[var(--foreground)]">{h.title}</p>
                <p className="text-xs text-[var(--muted-fg)]">
                  {h.kind} · {h.subtitle}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
