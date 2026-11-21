# 03 — Feature Gap Matrix (summary)

Full page/image inventory: `01_IMAGE_MANIFEST.md`, `02_PAGE_MAPPING.md`, `02_PAGE_MAPPING_CATALOG_26_65.md`.

Status vocabulary from the master prompt.

## P0 core workflow

| Capability | UI | Backend | DB | Authz | Tests | Class |
|------------|----|---------|----|-------|-------|-------|
| Auth / bootstrap | `/sign-in` | Better Auth | User | — | yes | IMPLEMENTED_AND_TESTED |
| Workspaces / projects | `/app` | actions | Workspace/Project | owner | yes | PARTIALLY_IMPLEMENTED |
| Sites | `/workspaces/.../sites` | ensureSite | Site | owner | partial | PARTIALLY_IMPLEMENTED |
| CSV plan import | `/plan` | plan-import | PlanRevision/PlannedLink | lead | yes | IMPLEMENTED_AND_TESTED |
| Install tracking | cable detail | install actions | LinkRuntime | tech | yes | IMPLEMENTED_AND_TESTED |
| LLDP/CDP evidence | `/lldp` | parsers + import | EvidenceImport | lead | yes | IMPLEMENTED_AND_TESTED |
| SSH collect | `/collection` | ssh2 allowlist | DeviceCredential | lead | unit | PARTIALLY_IMPLEMENTED |
| Mismatch / exceptions | `/exceptions` | recompute | VerificationFinding | lead | yes | IMPLEMENTED_AND_TESTED |
| Physical verify | cable detail | verify action | PhysicalVerification | tech | yes | IMPLEMENTED_AND_TESTED |
| Handover + share | `/handover` | handover | HandoverSnapshot | lead | yes | IMPLEMENTED_AND_TESTED |
| QR labels + scan | `/labels` `/scan` | qrcode + parse | — | member | yes | PARTIALLY_IMPLEMENTED |
| Offline + photos | scan + cable | FieldPhoto | FieldPhoto | tech | yes | PARTIALLY_IMPLEMENTED |

## P1 design / IA

| Item | Status |
|------|--------|
| Design tokens navy/blue/fonts | Batch 1 in progress |
| Grouped project subnav | Batch 1 |
| Evidence library page | NOT_IMPLEMENTED |
| Settings page | NOT_IMPLEMENTED |
| Reports page | NOT_IMPLEMENTED |
| Global search | NOT_IMPLEMENTED (control disabled + labeled) |
| Work orders | NOT_IMPLEMENTED |

## P2 / deferred (honest)

| Item | Reason |
|------|--------|
| Native mobile app | Out of scope |
| Worker fleet / scheduler | External cron only |
| NetBox writes | Explicitly not claimed |
| Full 3D twin / LIDAR | Schematic SVG only |
| Invented analytics KPIs from PNGs | Forbidden |
| Cable testing instruments | No device integration |
| Strand/MPO graph | Not built |

## Rule

A screenshot KPI (e.g. 8,960 cables) is **not** product data. UI must show live Prisma aggregates or empty states.
