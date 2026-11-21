"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input, Button } from "@/components/ui";

export function GlobalSearchPageClient({ initialQ }: { initialQ: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/app/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cable ID, device, rack, project…"
        aria-label="Search"
        className="flex-1"
      />
      <Button type="submit">Search</Button>
    </form>
  );
}
