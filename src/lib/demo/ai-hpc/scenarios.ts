/**
 * The 20 presenter scenarios for the AI/HPC demo. Drives the in-app Demo Tour and the
 * scenario/presenter docs. Routes are relative to /app/projects/:id.
 */
export type DemoScenario = {
  id: number;
  title: string;
  route: string;
  /** Demo user key to sign in as (see DEMO_USERS in the seed). */
  as: string;
  show: string[];
  expect: string;
  limitation?: string;
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  { id: 1, title: "Executive commissioning overview", route: "", as: "owner", show: ["KPI strip: matched, swapped, mismatch, awaiting, installed, blocked", "Handover gate: critical exceptions and signed stages", "Every figure links to its records"], expect: "KPIs equal the counts on the Cables and Exceptions pages." },
  { id: 2, title: "Fabric overview (FE / BE / OOB / EXT)", route: "/fabric", as: "lead", show: ["Per-fabric planned/installed/verified (also on the overview 'Fabric readiness')", "Design attributes labelled 'design'"], expect: "Per-fabric totals add up to the cable total.", limitation: "EVPN, RoCEv2, PFC/ECN are design metadata only; LLDP does not verify them." },
  { id: 3, title: "Rack elevations", route: "/racks", as: "lead", show: ["14 racks, devices by rack unit", "Status colour per device"], expect: "Device U positions never overlap; all fit in 42U." },
  { id: 4, title: "GPU rack front/rear", route: "/racks/R08", as: "tech", show: ["8U GPU servers", "FE 100G, BE 400G rail-aligned, BMC ports"], expect: "Each GPU has 2 FE, 4 BE and 1 BMC cable." },
  { id: 5, title: "Fabric topology", route: "/fabric", as: "engineer", show: ["FE spine/leaf + border", "BE spine/leaf rails A/B"], expect: "No cable connects FE switching to BE switching." },
  { id: 6, title: "Back-end rail view", route: "/fabric/be", as: "engineer", show: ["NIC k \u2192 BE-LEAF-0(k+1)", "800G spine uplinks"], expect: "Rail A = BE-LEAF-01/02, rail B = BE-LEAF-03/04." },
  { id: 7, title: "Cable plan import + validation", route: "/plan", as: "lead", show: ["Upload fixtures/demos/ai-hpc/pod-a-plan.csv", "Duplicate / port-conflict fixtures show errors"], expect: "Invalid files are rejected with line numbers; nothing is published." },
  { id: 8, title: "Cable list by fabric", route: "/cables", as: "lead", show: ["Filter FE/BE/OOB/EXT/STORAGE/PATCH", "Speed, length, connector, rail"], expect: "Filters match fabric counts on the overview." },
  { id: 9, title: "Work orders and field progress", route: "/work-orders", as: "tech", show: ["Done FE/BE, in-progress OOB, blocked trunks"], expect: "Blocked cables carry a reason." },
  { id: 10, title: "Mobile field workflow", route: "/scan", as: "tech", show: ["Scan QR, update status, photo"], expect: "Works offline and syncs later.", limitation: "Responsive web app with offline capability, not a native app." },
  { id: 11, title: "Evidence explorer (multi-vendor)", route: "/evidence/explorer", as: "engineer", show: ["NX-OS, EOS, Cumulus, Junos, IOS-XE, Linux lldpd", "Raw CLI \u2192 parsed \u2192 expected vs observed"], expect: "Every capture is labelled SYNTHETIC with its snapshot.", limitation: "Synthetic playback, not a live SSH collection." },
  { id: 12, title: "Swapped cables (FE and BE)", route: "/exceptions", as: "engineer", show: ["FE swap names its partner", "BE NIC swap = right device, wrong port"], expect: "Both swaps appear with a fix playbook." },
  { id: 13, title: "Wrong device / wrong port / missing neighbor", route: "/verify?result=mismatch", as: "engineer", show: ["Unplanned spare host", "Free leaf port", "Uplink up but no LLDP"], expect: "Each has a distinct finding type and next action." },
  { id: 14, title: "Unobservable and unsupported links", route: "/verify", as: "engineer", show: ["Firewall HA, console server, panels, demarcs"], expect: "Never marked LLDP-verified; physical check required." },
  { id: 15, title: "Stale and parser-error evidence", route: "/compliance", as: "lead", show: ["RTR-02 capture older than policy", "OOB-SW2 capture failed to parse"], expect: "Stale \u2192 Needs review; parser error affects only links no other side observes." },
  { id: 16, title: "Exception assignment and due dates", route: "/exceptions", as: "lead", show: ["Assign to contractor, set due date", "Waiver requires reason"], expect: "Assignment and waiver are audited." },
  { id: 17, title: "Independent physical QC", route: "/qc", as: "qc", show: ["Confirm/reject each end", "Installer cannot verify own work"], expect: "Rejection re-opens the cable as an exception." },
  { id: 18, title: "Playback: fault \u2192 corrected", route: "/evidence/explorer", as: "lead", show: ["Switch snapshot to CORRECTED", "Exceptions auto-close with audit"], expect: "Corrected snapshot has no LLDP mismatches." },
  { id: 19, title: "Staged handover approvals", route: "/handover", as: "owner", show: ["Installation \u2192 QC \u2192 Engineering \u2192 Owner", "Owner blocked while critical exceptions open"], expect: "Owner approval only after exceptions are closed or waived." },
  { id: 20, title: "Read-only auditor", route: "/handover", as: "viewer", show: ["Viewer sees everything", "No mutation controls"], expect: "Every mutation is refused for the Viewer role." },
];
