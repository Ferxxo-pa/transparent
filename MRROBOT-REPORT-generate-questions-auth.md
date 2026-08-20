== Mr. Robot dispatch 20260820-065319-1198715 2026-08-20T06:53:19-05:00 ==
repo=/home/openclaw_agent/.openclaw/workspace/transparent
brief_src=/tmp/mrrobot-brief-transparent-genq.md
---

# Report: `generate-questions` auth gate + prompt-injection hardening

**Branch:** `security/generate-questions-auth-2026-08-20`
**Commit:** `61382f6`
**Tests:** 35 / 35 pass (`node --experimental-strip-types`)

---

## What was done

### 1. Auth gate

`supabase/functions/generate-questions/index.ts` now:

- Reads a `GameAuthToken` (`{ message, signature, publicKey }`) from the
  request body, exactly as `advance-phase` does.
- Calls `verifyGameAuth(auth, gameId)` from `_shared/gameAuth.ts` — validates
  ed25519 signature, message format, game ID match, and expiry.
- Error mapping:
  - Missing / malformed token → **401**
  - Invalid signature → **401**
  - Expired token → **401**
  - Token is for a different game → **403**
- After signature is verified, queries the DB (service role) to confirm the
  wallet is either the game host or a player in `gameId` → **403** if not.

### 2. Input validation

Extracted into `supabase/functions/generate-questions/validate.ts` (no Deno
deps — importable from Node for testing):

| Field | Rule | Response |
|---|---|---|
| `vibe` | Must be one of: `college`, `coworkers`, `couples`, `new_friends`, `family`, `chaos` | **400** |
| `spiceLevel` | Must be one of: `0.5`, `0.75`, `1.0` | **400** |
| `context` | `string.length <= 500` | **400** |

### 3. Prompt-injection hardening

`sanitizeContext()` in `validate.ts`:

- Strips ASCII control chars (0x00-0x08, 0x0b, 0x0c, 0x0e-0x1f, 0x7f) —
  preserves `\t` and `\n`.
- Replaces injection markers with `[...]`:
  - `ignore previous instructions` (case-insensitive)
  - `system:` (case-insensitive)
  - triple-backtick
  - `<|` sequences

The sanitized context is also wrapped in `<context>...</context>` delimiters in
the prompt with an explicit instruction to treat it as flavor only, not
instructions.

### 4. CORS

`corsHeadersForOrigin()` in `validate.ts`:

- Allowed origins: `https://transparent-five.vercel.app`, `http://localhost:5173`,
  `http://localhost:3000`.
- All other origins (including `null`) fall back to the prod origin.
- Never emits `*`. Sets `Vary: Origin`.

The handler reads `origin` from the request header and uses `corsHeadersForOrigin`
for every response including OPTIONS preflight.

### 5. Rate limit

- New Supabase table `question_gen_rate` (primary key: `wallet + game_id + minute_bucket`).
- New PL/pgSQL function `increment_question_gen_rate` — atomic `INSERT ON CONFLICT UPDATE`
  returning the new count; avoids read-then-write races.
- Handler calls the RPC; rejects with **429** if `count > 5` calls/minute per
  `wallet+game_id`.
- Migration file: `supabase/migrations/20260820_question_gen_rate.sql` — NOT applied.
  Ez applies manually from a clean copy.

---

## Files changed

| File | Change |
|---|---|
| `supabase/functions/generate-questions/index.ts` | Auth + validation + CORS + rate limit |
| `supabase/functions/generate-questions/validate.ts` | New — pure validation helpers |
| `supabase/functions/generate-questions/validate.test.ts` | New — 35 unit tests (Node) |
| `supabase/migrations/20260820_question_gen_rate.sql` | New — rate limit table + RPC fn |

NOT touched: `advance-phase`, `settle-game`, `_shared/gameAuth.ts`, anything on-chain.

---

## Test coverage

Run with: `node --experimental-strip-types supabase/functions/generate-questions/validate.test.ts`

| Brief test case | How covered |
|---|---|
| No `GameAuthToken` -> 401 | `verifyGameAuth` throws "missing auth token" -> 401 (handler logic verified by code review; Deno integration test needed to run against live fn) |
| Invalid signed token -> 401 | Same path, "invalid signature" error |
| Expired token -> 401 | Same path, "auth token expired" error |
| Valid token from wrong game -> 403 | "auth token is for a different game" -> classified as 403 |
| `context.length > 500` -> 400 | `validateContextLength` unit test PASS |
| Invalid `vibe` -> 400 | `validateVibe` unit tests PASS |
| Invalid `spiceLevel` -> 400 | `validateSpiceLevel` unit tests PASS |
| Valid token + all inputs valid -> 200 | Requires Deno + live Supabase (integration) |
| CORS preflight from evil origin -> not reflected | `corsHeadersForOrigin` unit tests PASS |

The 401/403/200 full-handler paths require a Deno runtime + Supabase instance (no
Deno available on this machine). All pure validation + CORS logic is covered by
the 35 unit tests that run under Node 24.

---

## Client call sites

No existing client code calls `generate-questions` (confirmed: `AIVibeCheck.tsx`
loads from the static `ai-questions.json` bank). When the client is wired to
call this edge function, the host already holds a `GameAuthToken` (issued after
`join-game` / `advance-phase`) and must pass `{ auth, gameId, vibe, spiceLevel, ... }`
in the request body.

---

## Notes for Ez

1. **Apply migration before deploying the function.** The rate-limit RPC
   (`increment_question_gen_rate`) must exist in Postgres before the edge fn
   starts using it, or every request will get a 500.
2. **No secrets changed.** `GROQ_API_KEY` and `OPENAI_API_KEY` stay
   server-only; neither is exposed in responses.
3. **`_shared/gameAuth.ts` CORS is still `*`** — only `generate-questions`
   is restricted here, as the brief targeted only this function. Hardening the
   other fns is a separate task.

MRROBOT:DONE
