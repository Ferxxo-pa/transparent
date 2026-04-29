# Transparent — Known Bugs

## BUG-001: First transaction always fails, second succeeds
- **Reported:** 2026-02-28
- **Status:** FIXED 2026-04-29
- **Root cause:** Race condition between React effect cleanup (which nulled `walletWarmupRef`) and the new effect setting it — leaving a window where `sendTransaction` had no warmup promise to await, so it fired immediately before Privy's key-provider was ready.
- **Fix:** Added `walletStabilizedRef` (a ref mirroring the `walletStabilized` state). `sendTransaction` now checks: if warmup promise exists, await it; else if not yet stabilized, poll the ref every 100ms (max 5s) before proceeding. Both paths guarantee Privy is ready before the first signing call.
