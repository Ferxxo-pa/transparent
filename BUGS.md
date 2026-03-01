# Transparent — Known Bugs

## BUG-001: First transaction always fails, second succeeds
- **Reported:** 2026-02-28
- **Severity:** High (every user hits this)
- **Description:** When signing the first transaction (login, sending money, etc.), it always fails. The second attempt works fine.
- **Likely cause:** Nonce issue, wallet not fully connected on first tx, or stale provider state
- **Possible fixes:**
  - Add connection readiness check before first tx
  - Retry logic with small delay
  - Ensure wallet handshake completes before enabling tx buttons
  - Check if `eth_estimateGas` fails on first call (stale state)
- **Status:** Not started — investigate during next Transparent sprint
