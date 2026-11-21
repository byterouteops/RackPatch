# 11 — Known Limitations

Honest gaps vs UI references and catalog pages 26–65.

1. **Screenshot KPIs are fictional** — mockups show invent metrics (e.g. 8,960 cables, 99.98% uptime). The app only displays live aggregates.
2. **Global search** — top-bar control is disabled and labeled; Page 64 not built.
3. **Work orders** — no WorkOrder model; installation is per-cable (Page 53 deferred).
4. **Label designer** — print sheet + QR exist; template canvas / Zebra driver claims not implemented.
5. **Evidence library** — project photo gallery added; no video/docs types from mockups.
6. **NetBox** — dry-run / compare only; no writes.
7. **SSH** — allowlisted show-commands; no worker fleet or scheduler.
8. **Compliance notifications** — require external cron + Resend; not a built-in scheduler.
9. **3D twin** — SVG schematic slots, not surveyed U positions or WebGL.
10. **AI assistant** — grounded rule-based (+ optional LLM reword); no invented diagnostics.
11. **Settings / Reports / Help Center** — partial or docs-only vs dedicated admin screens.
12. **Cable testing & certification** — no instrument integration (Page 37).
13. **Notifications center** — no in-app notification store.
14. **Design PNG archive** — stored locally under `design-references/`; large binaries gitignored.
15. **Uncommitted feature work** — prior CE slices still local until explicitly committed.

No deployment or publication without approval.
