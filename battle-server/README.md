# Battle Weld local server v0.3

This local-only prototype creates battles, joins P2, locks battle state,
streams realtime state over Server-Sent Events (SSE), and accepts
replay-verified ARC attempts. It does not modify ARC.

Run from the repository root:

```sh
node battle-server/dev-server.js
node --test battle-server/tests/
```

The dev server binds only to `127.0.0.1`; its port is `PORT` (default `8899`).
For browser E2E runs with a non-default web origin, set
`BATTLE_DEV_ORIGINS=http://127.0.0.1:<web-port>` so CORS admits that origin.
Battle records live in memory
and disappear when the process exits. `GET /battles/:id` returns public battle
data and each player's best attempt. Credentials, invite hashes, attempt
payload hashes, client scores, bot signals and replay timings remain private.
Send the player secret as `Authorization: Bearer <playerSessionId>.<playerSecret>`
to ready and attempt endpoints.

The server chooses each battle seed. The seed and `taskHash` stay hidden until
the attempt window opens. `inputProfile` (`full` or `touch`) is locked at
creation and describes replay rules, not a verified physical device.

Routes:

- `POST /battles` — create a battle
- `POST /battles/:id/join` — join as P2
- `POST /battles/:id/ready` — mark the authenticated player ready
- `POST /battles/:id/attempts` — validate, replay and privately store an ARC recording
- `POST /battles/:id/finish` — declare that this player will submit no more attempts
- `POST /battles/:id/status` — set the authenticated player status to `welding` or `idle`
- `GET /battles/:id/events` — receive an initial `battle.snapshot`, then ordered SSE events
- `GET /battles/:id` — read public battle state and best attempts

Attempt submissions are limited to 4 MiB; other request bodies remain limited
to 64 KiB. Sanitized recordings are retained privately with their authoritative
attempt so they can be re-verified after a dispute or engine fix. A retention
purge policy is still required before production. Records are held in memory
for local development and disappear when the process exits. A sync battle starts five seconds after both players become ready and has a
15-minute attempt window from `startAt`. A link battle starts when P2 joins and
has a 24-hour attempt window. The adapter schedules the exact deadline and
persists the resulting verdict; reads also apply overdue deadlines.

SSE event IDs are monotonically increasing per battle. Each connection receives
a fresh state snapshot first, then events published after that snapshot.
`Last-Event-ID` replay is not supported: reconnecting clients should fetch a
new snapshot and resume from live events. Streams send a heartbeat every 15
seconds, allow at most eight concurrent connections per battle, and are closed
when the client disconnects. CORS is restricted to origins configured with
`BATTLE_DEV_ORIGINS` (comma-separated); local defaults are
`http://127.0.0.1:8898` and `http://localhost:8898`.
