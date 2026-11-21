# RackPatch Page Mapping: design references -> image files -> Next.js routes

Companion to `01_IMAGE_MANIFEST.md`. Status is based on **repository existence only** (does a `page.tsx` / route exist whose purpose matches the design topic). It does NOT judge visual fidelity, completeness of features inside the page, or tests.

## Caveats

1. **Catalog pages 26-65 cannot be enumerated.** The master prompt catalog is not in the repository and the originating chat is not accessible; `design-references/rackpatch/README.txt` also says page-to-filename mapping cannot be verified. So section B is keyed by **topic IDs (`T01`...) derived from the visible page titles**, not by invented catalog page numbers. Each row has `catalog page = UNKNOWN`. If the catalog is supplied later, only the first column needs filling in.
2. **Early pages 1-16** are numbered visibly in the poster `a_large_composite_ui_showcase_poster_for_rackpatc.png`. Section A uses those numbers. Image matches are by topic only; styles differ from the poster.
3. Status vocabulary: `IMPLEMENTED` = a route exists covering the topic's core purpose; `PARTIAL` = a related route covers only part of the design (or the capability is a section of another page); `NOT_IMPLEMENTED` = no matching route/page in `src/app`.
4. `P` below = `src/app/(app)/app/projects/[projectId]`. Routes at runtime are `/app/projects/[projectId]/...`.

## Existing routes (`src/app/**/page.tsx`, 32 pages) and API routes

| Route | File |
|-------|------|
| `/` | `src/app/page.tsx` (marketing / pilot request) |
| `/about` | `src/app/about/page.tsx` |
| `/demo` | `src/app/demo/page.tsx` |
| `/sign-in` | `src/app/sign-in/page.tsx` (operator sign-in + create administrator) |
| `/invite/[token]` | `src/app/invite/[token]/page.tsx` |
| `/share/handover/[token]` | `src/app/share/handover/[token]/page.tsx` |
| `/app` | `src/app/(app)/app/page.tsx` (workspaces + projects list/create) |
| `/app/admin` | `src/app/(app)/app/admin/page.tsx` (platform admin: pilot requests, activate project) |
| `/app/workspaces/[workspaceId]/team` | `.../workspaces/[workspaceId]/team/page.tsx` |
| `/app/workspaces/[workspaceId]/sites` | `.../workspaces/[workspaceId]/sites/page.tsx` |
| `/app/projects/[projectId]` | `P/page.tsx` (project overview) |
| `.../plan` | `P/plan/page.tsx` (CSV import wizard, publish revision) |
| `.../cables` | `P/cables/page.tsx` |
| `.../cables/[linkId]` | `P/cables/[linkId]/page.tsx` (install & verify, photo evidence, asset/lifecycle) |
| `.../lldp` | `P/lldp/page.tsx` (neighbor evidence, import, collection jobs) |
| `.../collection` | `P/collection/page.tsx` (SSH collection, credentials, targets) |
| `.../exceptions` | `P/exceptions/page.tsx` |
| `.../handover` | `P/handover/page.tsx` |
| `.../handover/[snapshotId]` | `P/handover/[snapshotId]/page.tsx` |
| `.../labels` | `P/labels/page.tsx` (label sheet) |
| `.../scan` | `P/scan/page.tsx` (QR scanner, offline queue) |
| `.../inventory` | `P/inventory/page.tsx` (port inventory, impact simulation) |
| `.../spares` | `P/spares/page.tsx` (stock + append-only ledger) |
| `.../panels` | `P/panels/page.tsx` (patch panels + circuits) |
| `.../capacity` | `P/capacity/page.tsx` |
| `.../twin` | `P/twin/page.tsx` (schematic rack twin) |
| `.../qc` | `P/qc/page.tsx` (QC queue) |
| `.../compliance` | `P/compliance/page.tsx` |
| `.../analytics` | `P/analytics/page.tsx` |
| `.../integrations` | `P/integrations/page.tsx` (NetBox dry-run, webhooks, GitOps) |
| `.../api` | `P/api/page.tsx` (tokens, endpoints) |
| `.../assistant` | `P/assistant/page.tsx` (no design image) |

API routes (not pages): `/api/auth/[...all]`, `/api/field-photos/[photoId]`, `/api/health`, `/api/ready`, `/api/internal/compliance-check`, `/api/v1/projects/[projectId]/{cables,gitops,summary}`.

---

## A. Early pages (poster numbering 1-16)

| Early page | Title on poster | Image file(s) | Existing route(s) | Status |
|-----------|-----------------|---------------|-------------------|--------|
| 1 | Dashboard (Overview) | `a_wide_detailed_ui_screenshot_of_a_web_app_dashbo.png` (best, sidebar C family); alt dashboards: `a_detailed_high_fidelity_web_app_dashboard_ui_for.png`, `a_high_detail_mockup_of_a_web_application_dashboar.png`, `a_high_detail_professional_ui_dashboard_screensho.png` | `/app` (list only), `P/page.tsx` (per-project overview). No cross-project KPI dashboard. | PARTIAL |
| 2 | Projects (List & Management) | `a_wide_high_resolution_ui_screenshot_of_the_rackp.png`, `a_detailed_ui_screenshot_of_rackpatch_data_cent.png` | `/app` | PARTIAL (list + create exist; no master-detail/filter/templates) |
| 3 | Project Details (Overview) | `a_detailed_ui_screenshot_of_rackpatch_data_cent.png`, `a_detailed_ui_screenshot_of_a_desktop_web_app_rac.png` (dark) | `P/page.tsx` | IMPLEMENTED |
| 4 | Sites & Racks | `a_detailed_ui_screenshot_rackpatch_application_wi.png`, `a_highly_detailed_ui_dashboard_screenshot_for_rack.png` | `/app/workspaces/[id]/sites` (sites only), `P/twin` (schematic rack elevation) | PARTIAL |
| 5 | Cable Plan (Cable List) | `a_detailed_ui_screenshot_of_rackpatch_page_4.png`, `a_detailed_ui_screenshot_of_a_desktop_web_app_rac.png` | `P/cables` | IMPLEMENTED |
| 6 | CSV Import (Cable Plan) | `a_high_detail_ui_screenshot_of_rackpatch_in_a_clea.png` | `P/plan` | IMPLEMENTED |
| 7 | Installation Tracking | `a_detailed_screenshot_ui_of_rackpatch_installa.png`, `a_detailed_ui_dashboard_screenshot_a_rackpatch_ca.png`, `a_detailed_dark_themed_enterprise_dashboard_ui_for.png` | `P/cables/[linkId]` (install actions), `P/scan` | PARTIAL (no dedicated installation route/work orders) |
| 8 | Verification (Expected vs Observed) | `a_detailed_high_resolution_ui_screenshot_of_rac.png`, `a_detailed_ui_screenshot_of_a_rackpatch_independe.png`, `a_detailed_high_fidelity_ui_dashboard_collage_scre.png` | `P/cables/[linkId]` (verification detail), `P/lldp`, `P/exceptions` | PARTIAL (no dedicated verification route) |
| 9 | LLDP / CDP Evidence | (no clearly matching single-page image; closest `a_high_detail_ui_screenshot_of_rackpatch_secur.png` = SSH collection, and mismatch panels in `a_detailed_polished_software_dashboard_ui_screens.png`) | `P/lldp`, `P/collection` | IMPLEMENTED (route exists; image match LOW confidence) |
| 10 | Evidence (Photos, Files, Notes) | `a_wide_detailed_ui_screenshot_of_rackpatch_evide.png`, `a_detailed_gui_screenshot_a_rackpatch_evidence_l.png` | `P/cables/[linkId]` photo section, `/api/field-photos/[photoId]` | PARTIAL (no evidence library page) |
| 11 | QR Code & Labels | `a_detailed_ui_screenshot_of_a_rackpatch_cable_lab.png`, `a_detailed_high_contrast_professional_saas_dashb.png` | `P/labels`, `P/scan` | IMPLEMENTED |
| 12 | Handover Reports | `a_detailed_ui_dashboard_screenshot_crisp_modern_s.png`, `a_detailed_high_contrast_ui_dashboard_screenshot.png` | `P/handover`, `P/handover/[snapshotId]`, `/share/handover/[token]` | IMPLEMENTED |
| 13 | Inventory (Devices & Assets) | `a_high_detail_full_screen_professional_ui_dashboa.png` (device inventory), `a_detailed_ui_dashboard_screenshot_for_rackpatch_s.png` (stock ledger) | `P/inventory`, `P/spares` | PARTIAL (port inventory + stock ledger exist; no device/asset list UI as designed) |
| 14 | Users & Roles (Administration) | `a_detailed_ui_dashboard_screenshot_for_rackpatch.png`, `a_detailed_full_screen_ui_dashboard_screenshot_a.png` | `/app/workspaces/[id]/team` (invitations only), `/app/admin` | PARTIAL |
| 15 | Settings (System & Integration) | `a_detailed_ui_screenshot_dashboard_a_high_resol.png`, `a_high_resolution_composite_ui_mockup_image_a_mon.png` (Settings panels) | none | NOT_IMPLEMENTED |
| 16 | First-Run Setup (Initial Admin) | `a_detailed_high_resolution_ui_screenshot_a_rackp.png`, `a_high_resolution_composite_ui_mockup_image_a_mon.png` | `/sign-in` ("Create administrator") | PARTIAL (no multi-step wizard for workspace/site) |

Collage / overview-only images (no single route): `a_large_composite_ui_showcase_poster_for_rackpatc.png` (16-panel poster), `a_clean_ui_design_presentation_collage_for_rackpa.png`, `a_detailed_ui_concept_collage_for_rackpatch_with.png`, `a_high_detail_professional_neon_dark_blue_themed.png` (3 variants of the 6-panel tagline collage), `a_high_resolution_composite_ui_mockup_image_a_mon.png` (9 panels), `a_detailed_dashboard_style_promotional_ui_overview.png` (promo overview), `a_detailed_high_fidelity_ui_dashboard_collage_scre.png` (3 panels).

---

## B. Topic mapping for the remaining designs (catalog pages 26-65: numbers UNKNOWN)

Titles are the visible headlines. Topics already covered in section A are not repeated unless the image is a distinct design.

| Topic | catalog page | Visible page title | Image file(s) | Existing route(s) | Status |
|-------|--------------|--------------------|---------------|-------------------|--------|
| T01 | UNKNOWN | API Keys, Webhooks & Developer Portal | `a_crisp_high_detail_ui_dashboard_screenshot_rack.png` | `P/api`, `P/integrations` (webhooks), `/api/v1/...` | IMPLEMENTED |
| T02 | UNKNOWN | NetBox Integration & GitOps | `a_detailed_colorful_ui_dashboard_screenshot_for.png` | `P/integrations` (NetBox dry-run, GitOps), `/api/v1/projects/[id]/gitops` | IMPLEMENTED |
| T03 | UNKNOWN | Integrations & Automation | `a_detailed_high_resolution_dark_blue_white_ui_das.png` | `P/integrations` | PARTIAL (no vendor cards/workflow automation UI) |
| T04 | UNKNOWN | Installation & Verification (dark) | `a_detailed_dark_themed_enterprise_dashboard_ui_for.png` | `P/cables/[linkId]`, `P/scan` | PARTIAL |
| T05 | UNKNOWN | Cable Capacity Planning & Port Utilization | `a_detailed_full_screen_ui_dashboard_screenshot_in.png` | `P/capacity` | IMPLEMENTED |
| T06 | UNKNOWN | Evidence Library & Photo Management | `a_detailed_gui_screenshot_a_rackpatch_evidence_l.png` | none dedicated (photo section in `P/cables/[linkId]`) | NOT_IMPLEMENTED |
| T07 | UNKNOWN | Evidence Management | `a_wide_detailed_ui_screenshot_of_rackpatch_evide.png` | none dedicated | NOT_IMPLEMENTED |
| T08 | UNKNOWN | QR Labels & Mobile Field Operations | `a_detailed_high_contrast_professional_saas_dashb.png` | `P/labels`, `P/scan` | PARTIAL |
| T09 | UNKNOWN | Mobile Field Operations & Offline Sync | `a_detailed_polished_dashboard_ui_screenshot_a_wi.png` | `P/scan` (offline queue), `P/cables/[linkId]` | PARTIAL |
| T10 | UNKNOWN | Handover Package & Document Generator | `a_detailed_high_contrast_ui_dashboard_screenshot.png` | `P/handover`, `P/handover/[snapshotId]`, `/share/handover/[token]` | PARTIAL (snapshot/export exists; no template/sign-off UI) |
| T11 | UNKNOWN | Handover Management | `a_detailed_ui_dashboard_screenshot_crisp_modern_s.png` | `P/handover` | PARTIAL |
| T12 | UNKNOWN | Cable Plan (dark, GPU Cluster Expansion) | `a_detailed_ui_screenshot_of_a_desktop_web_app_rac.png` | `P/page.tsx`, `P/cables`, `P/plan` | PARTIAL |
| T13 | UNKNOWN | Administration & Deployment | `a_detailed_high_resolution_desktop_web_admin_cons.png` | `/app/admin`, `/api/health`, `/api/ready` | PARTIAL |
| T14 | UNKNOWN | Deployment & Integration Center | `a_detailed_realistic_ui_infographic_dashboard_scr.png` | `/api/health`, `/api/ready` (no UI page) | NOT_IMPLEMENTED |
| T15 | UNKNOWN | Railway Deployment & System Readiness | `a_detailed_ui_screenshot_rackpatch_for_railway.png` | `/api/ready` only (no UI page) | NOT_IMPLEMENTED |
| T16 | UNKNOWN | Network Topology & Connectivity Map | `a_detailed_high_resolution_dashboard_ui_illustrat.png` | `P/twin` (rack-to-rack links) | PARTIAL |
| T17 | UNKNOWN | Digital Twin & 3D Rack Visualization | `a_detailed_photo_realistic_ui_screenshot_a_rackp.png` | `P/twin` (schematic, explicitly "not a survey") | PARTIAL |
| T18 | UNKNOWN | Rack Elevation & Physical Cabling Visualization | `a_highly_detailed_ui_dashboard_screenshot_for_rack.png` | `P/twin` | PARTIAL |
| T19 | UNKNOWN | Cable Lifecycle & Asset Tracking | `a_detailed_high_resolution_ui_dashboard_screensho.png` | `P/cables/[linkId]` (asset/lifecycle card) | PARTIAL |
| T20 | UNKNOWN | Reports & Executive Analytics | `a_detailed_high_resolution_ui_screenshot_of_a_das.png` | `P/analytics` | PARTIAL |
| T21 | UNKNOWN | Product Analytics & Quality Assurance | `a_high_detail_modern_saas_dashboard_ui_screenshot.png` | `P/analytics` | PARTIAL |
| T22 | UNKNOWN | Verification Management | `a_detailed_high_resolution_ui_screenshot_of_rac.png` | `P/lldp`, `P/exceptions`, `P/cables/[linkId]` | PARTIAL |
| T23 | UNKNOWN | Independent Verification & Handover Sign-Off | `a_detailed_ui_screenshot_of_a_rackpatch_independe.png` | `P/qc` (QC queue) | PARTIAL |
| T24 | UNKNOWN | Exception Management & Corrective Actions | `a_detailed_photorealistic_ui_dashboard_screenshot.png` | `P/exceptions` | PARTIAL |
| T25 | UNKNOWN | Exceptions & Issue Management | `wide_detailed_ui_dashboard_screenshot_of_rackpat.png` | `P/exceptions` | PARTIAL |
| T26 | UNKNOWN | Cable Mismatch Detection & Root Cause Analysis | `a_detailed_polished_software_dashboard_ui_screens.png` | `P/lldp`, `P/exceptions` | PARTIAL |
| T27 | UNKNOWN | First-Run Setup & Workspace Onboarding | `a_detailed_high_resolution_ui_screenshot_a_rackp.png` | `/sign-in` | PARTIAL |
| T28 | UNKNOWN | Installation Management | `a_detailed_screenshot_ui_of_rackpatch_installa.png` | `P/cables/[linkId]`, `P/scan` | PARTIAL |
| T29 | UNKNOWN | Installation Work Orders & Field Task Management | `a_detailed_ui_dashboard_screenshot_a_rackpatch_ca.png` | none (no work orders) | NOT_IMPLEMENTED |
| T30 | UNKNOWN | Contractor & Work Order Management | `a_detailed_ui_dashboard_screenshot_a_professional.png` | none | NOT_IMPLEMENTED |
| T31 | UNKNOWN | Contractor QC & Acceptance Queue | `a_high_resolution_ui_dashboard_screenshot_in_the_s.png` | `P/qc` | PARTIAL |
| T32 | UNKNOWN | Cable Plan Revisions & Change Control | `a_detailed_ui_dashboard_screenshot_a_clean_modern.png` | `P/plan` (publish new revision) | PARTIAL |
| T33 | UNKNOWN | Cable Plan Import & Validation | `a_high_detail_ui_screenshot_of_rackpatch_in_a_clea.png` | `P/plan` | IMPLEMENTED |
| T34 | UNKNOWN | Notifications & Activity Center | `a_detailed_ui_dashboard_screenshot_a_rackpatch_n.png` | none | NOT_IMPLEMENTED |
| T35 | UNKNOWN | Fiber Patch Panels & Circuit Management | `a_detailed_ui_dashboard_screenshot_a_wide_high_re.png` | `P/panels` | IMPLEMENTED |
| T36 | UNKNOWN | Fiber & Patch Panel Management | `a_detailed_ui_dashboard_screenshot_rackpatch_fib.png` | `P/panels` | PARTIAL (no MPO/optical test UI) |
| T37 | UNKNOWN | User Management & Role Permissions | `a_detailed_full_screen_ui_dashboard_screenshot_a.png` | `/app/workspaces/[id]/team` | PARTIAL |
| T38 | UNKNOWN | Users & Roles Management | `a_detailed_ui_dashboard_screenshot_for_rackpatch.png` | `/app/workspaces/[id]/team` | PARTIAL |
| T39 | UNKNOWN | Spare Stock Ledger & Cable Inventory | `a_detailed_ui_dashboard_screenshot_for_rackpatch_s.png` | `P/spares` | IMPLEMENTED |
| T40 | UNKNOWN | Network Device Inventory & Interface Mapping | `a_high_detail_full_screen_professional_ui_dashboa.png` | `P/inventory` (port inventory only) | PARTIAL |
| T41 | UNKNOWN | Global Search & Advanced Filtering | `a_detailed_ui_dashboard_screenshot_in_the_same_rac.png` | none | NOT_IMPLEMENTED |
| T42 | UNKNOWN | Cable Testing & Certification | `a_detailed_ui_dashboard_screenshot_no_people_of.png` | none | NOT_IMPLEMENTED |
| T43 | UNKNOWN | Release Management & Product Updates | `a_detailed_ui_screenshot_a_rackpatch_administrati.png` | none | NOT_IMPLEMENTED |
| T44 | UNKNOWN | Security & Access Control Center | `a_detailed_ui_screenshot_a_rackpatch_security.png` | `P/collection` (credentials only) | PARTIAL |
| T45 | UNKNOWN | Secure SSH Collection & Credential Management | `a_high_detail_ui_screenshot_of_rackpatch_secur.png` | `P/collection` | IMPLEMENTED |
| T46 | UNKNOWN | System Settings & Workspace Configuration | `a_detailed_ui_screenshot_dashboard_a_high_resol.png` | none | NOT_IMPLEMENTED |
| T47 | UNKNOWN | Cable Label Designer & Print Management | `a_detailed_ui_screenshot_of_a_rackpatch_cable_lab.png` | `P/labels` (label sheet) | PARTIAL |
| T48 | UNKNOWN | Cable Trace & Connectivity Explorer | `a_detailed_ui_screenshot_of_a_rackpatch_cable_tr.png` | `P/inventory` (impact simulation), `P/cables/[linkId]` | PARTIAL |
| T49 | UNKNOWN | Help Center, Documentation & Support | `a_detailed_ui_screenshot_of_a_rackpatch_help_cen.png` | `/about` (docs links only) | NOT_IMPLEMENTED |
| T50 | UNKNOWN | Compliance Policies & Notifications | `a_detailed_ui_screenshot_rackpatch_in_a_modern_b.png` | `P/compliance`, `/api/internal/compliance-check`, `src/lib/email.ts` | IMPLEMENTED |
| T51 | UNKNOWN | Project Templates & Guided Workflows | `a_wide_detailed_software_ui_dashboard_screenshot.png` | none | NOT_IMPLEMENTED |
| T52 | UNKNOWN | Projects (list) + project cable plan detail | `a_detailed_ui_screenshot_of_rackpatch_data_cent.png` | `/app`, `P/page.tsx` | PARTIAL |
| T53 | UNKNOWN | Sites & Racks | `a_detailed_ui_screenshot_rackpatch_application_wi.png` | `/app/workspaces/[id]/sites`, `P/twin` | PARTIAL |
| T54 | UNKNOWN | Projects Management | `a_wide_high_resolution_ui_screenshot_of_the_rackp.png` | `/app` | PARTIAL |
| T55 | UNKNOWN | Cable Plans | `a_detailed_ui_screenshot_of_rackpatch_page_4.png` | `P/cables`, `P/plan` | IMPLEMENTED |
| T56 | UNKNOWN | Welcome back / Welcome to RackPatch (dashboards) | `a_detailed_high_fidelity_web_app_dashboard_ui_for.png`, `a_high_detail_mockup_of_a_web_application_dashboar.png`, `a_high_detail_professional_ui_dashboard_screensho.png`, `a_wide_detailed_ui_screenshot_of_a_web_app_dashbo.png` | `/app`, `P/page.tsx` | PARTIAL |

### Routes with no design image
- `P/assistant` (Assistant), `/demo`, `/about`, `/invite/[token]`, `/app/admin` (Platform admin: partial overlap with T13 only).

## Counts

- Early pages (16): IMPLEMENTED 6 (3, 5, 6, 9, 11, 12), PARTIAL 9 (1, 2, 4, 7, 8, 10, 13, 14, 16), NOT_IMPLEMENTED 1 (15).
- Topics T01-T56: IMPLEMENTED 9, PARTIAL 34, NOT_IMPLEMENTED 13. NOT_IMPLEMENTED topics are T06, T07, T14, T15, T29, T30, T34, T41, T42, T43, T46, T49, T51.
- Image coverage: every one of the 66 images appears in section A, section B, or the collage list.

