# Marketplace assets

Screenshots captured from the live smoke project (2026-11-21):

| File | Scene |
|------|--------|
| `01-overview.png` | Project overview (9 links, 2 exceptions) |
| `02-cables.png` | Cable inventory |
| `03-exceptions.png` | Swapped-pair exceptions C-201 / C-202 |
| `04-handover.png` | Handover report snapshot |

`TEMPLATE_README.md` is the Railway template overview markdown for `railway templates publish --readme-file`.

## Publish checklist (Railway dashboard)

CLI `templates create` from this workspace currently fails with “Service web does not have a source that can be used to generate a template” even after connecting GitHub. Use the dashboard:

1. Open project **RackPatch-Template** (or the live **RackPatch** project after GitHub source is confirmed)
2. Project settings → **Generate Template from Project**
3. Confirm Postgres + web, variable references, public networking
4. Publish with category **Other** (or Starters), description from `MARKETPLACE_LISTING.md`, overview from `TEMPLATE_README.md`
5. Card image: upload `01-overview.png` or host via GitHub raw URL after push
