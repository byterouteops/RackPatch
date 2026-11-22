import Link from "next/link";
import type { FabricLink, LinkStatus } from "@/lib/fabric/load";

export function FabricStats({ links, fabric, base }: { links: FabricLink[]; fabric: string; base: string }) {
  const ls = links.filter((l) => l.fabric === fabric);
  const n = (s: LinkStatus[]) => ls.filter((l) => s.includes(l.state)).length;
  const installed = ls.filter((l) => l.installStatus === "INSTALLED").length;
  const items: Array<[string, number, string]> = [
    ["Planned", ls.length, `${base}/cables?fabric=${fabric}`],
    ["Installed", installed, `${base}/cables?fabric=${fabric}&status=INSTALLED`],
    ["Verified", n(["VERIFIED_LLDP", "VERIFIED_PHYSICAL"]), `${base}/verify?result=match`],
    ["Mismatch", n(["MISMATCH"]), `${base}/verify?result=mismatch`],
    ["Needs review", n(["NEEDS_REVIEW"]), `${base}/verify?result=review`],
    ["Awaiting", n(["AWAITING", "NONE"]), `${base}/verify?result=pending`],
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map(([label, v, href]) => (
        <Link key={label} href={href} className="rounded-md border border-[var(--border)] bg-white px-3 py-2 hover:border-[var(--accent)]">
          <div className="text-[11px] font-semibold uppercase text-[var(--muted-fg)]">{label}</div>
          <div className="text-xl font-extrabold">{v}</div>
        </Link>
      ))}
    </div>
  );
}
