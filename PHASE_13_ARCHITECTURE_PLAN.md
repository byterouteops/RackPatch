# Phase 13 — Architecture Plan (Labels / QR / Mobile Field)

**Date:** 2026-11-21  
**Implementation status:** Partial foundations only

## What exists

| Capability | Status |
|------------|--------|
| QR generation for cables | Partial (`qrcode` dependency / labels route exists) |
| Mobile-friendly cable detail | Implemented |
| Install / block / physical verify | Implemented |
| Installer ≠ verifier rule | Implemented |
| Label template designer / batch PDF | **Limited / not full Phase 13 scope** |
| Camera QR scanner | **Implemented** (BarcodeDetector + paste fallback; this project only) |
| Photo evidence store | **Implemented** |
| Offline sync | **Implemented** (device queue → server sync) |

## GO / NO-GO

**GO** for camera scan + offline queue + photo evidence. Full label template designer remains limited.
