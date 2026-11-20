# Demo walkthrough (~3 minutes)

Synthetic lab: two leaves, eight servers, swapped C-201/C-202, C-203 awaiting, physical verify path, blocked cable.

1. Open `/` → **Open demo** or sign in to seeded project.
2. Overview: totals, rack progress, exceptions strip.
3. Cables: show install/verify pills; open C-201.
4. LLDP: import `fixtures/demo-lldp-leaf02.txt` as Leaf-02 (if not seeded).
5. Exceptions: expected vs observed for both swaps.
6. Note: missing LLDP ≠ disconnected cable (C-203 awaiting).
7. Handover: not clear while exceptions open; export CSV / snapshot.

Buyer line: both swapped links can be up; RackPatch shows which ports to fix.
