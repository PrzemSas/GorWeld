# Battle Weld server v0.4

The shared HTTP layer serves the local development adapter and production
entry point. Both expose the same routes and checks. Production persists battle
records as one JSON file per battle and re-arms deadlines after restart. It does
not modify ARC scoring or verdict rules.

Run from the repository root:

```sh
node battle-server/dev-server.js
node --test battle-server/tests/
```

The dev server binds only to `127.0.0.1`; its port is `PORT` (default `8899`).
For browser E2E runs with a non-default web origin, set
`BATTLE_DEV_ORIGINS=http://127.0.0.1:<web-port>` so CORS admits that origin.
The dev adapter keeps records in memory. `GET /battles/:id` returns public battle
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
attempt. A sync battle starts five seconds after both players become ready and has a
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

## Production entry point

Production startup requires `BATTLE_DATA_DIR` and `BATTLE_ORIGINS` (a
comma-separated list of exact HTTP(S) origins, without `*`). `HOST` defaults to
`127.0.0.1`; `PORT` defaults to `8899`. Retention defaults are 30 days for
recordings, 180 days for completed/expired battles, and 7 days for battles that
never started. `TRUST_PROXY=1` accepts the first `X-Forwarded-For` address only
when the socket peer is loopback. Abuse limits can be configured with
`BATTLE_CREATE_LIMIT_PER_HOUR`, `BATTLE_JOIN_LIMIT_PER_HOUR`,
`BATTLE_SSE_LIMIT_PER_IP`, and `BATTLE_ACTIVE_CAPACITY`.

```sh
BATTLE_DATA_DIR=/var/lib/battleweld \
BATTLE_ORIGINS=https://gorweldarc.com,https://www.gorweldarc.com \
node battle-server/server.js
```

Production records live at `<BATTLE_DATA_DIR>/battles/<battleId>.json`;
directories use mode `0700`, records `0600`, and writes use a synced temporary
file followed by rename. `GET /health` contains only service status, ARC engine
and scoring versions, and uptime. Request logs use route templates and omit
battle IDs, names, secrets, recordings and client IPs. SIGTERM closes the
listener and SSE streams, then flushes the store.

`node battle-server/purge.js --dry-run` prints only the counts of recordings
and battles matching retention rules. Systemd/Caddy templates, deployment
dry-run, rollback and backup steps are in [deploy/SETUP.md](deploy/SETUP.md).
The ARC constant `BATTLE_PROD_API` remains `null`.

The battle lock queue and SSE hub are in memory. Run one API process only;
multiple workers or replicas could conflict and do not share live events.

## Test on a phone in the home network

This exposes the local test client and API to devices on your private Wi-Fi. Use
the computer's Windows LAN address in the phone browser; do not use its changing
WSL address there.

In WSL, start the static client and Battle API in separate terminals:

```sh
python3 battle-server/static-dev.py --host 0.0.0.0 --port 8898
HOST=0.0.0.0 PORT=8899 BATTLE_DEV_ORIGINS=http://<WINDOWS-LAN-IP>:8898 node battle-server/dev-server.js
```

Find the current WSL address with `hostname -I` (or
`ip -4 -o addr show scope global`) and the Windows LAN address with
`ipconfig`. From an elevated PowerShell, forward the two ports to WSL, replacing
`<WSL-IP>` with the current WSL address:

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=8898 connectaddress=<WSL-IP> connectport=8898
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=8899 connectaddress=<WSL-IP> connectport=8899
New-NetFirewallRule -DisplayName "GORWELD Battle LAN 8898" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8898 -RemoteAddress LocalSubnet -Profile Private
New-NetFirewallRule -DisplayName "GORWELD Battle LAN 8899" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8899 -RemoteAddress LocalSubnet -Profile Private
```

`-Profile Private` only applies when Windows treats the Wi-Fi as a private
network. Check with `Get-NetConnectionProfile`; if it says `Public`, either
switch the network to Private in Windows settings or drop `-Profile Private`
from both rules (`-RemoteAddress LocalSubnet` still limits them to the home
network).

On the phone, open `http://<WINDOWS-LAN-IP>:8898/index.html?battleApi=http%3A%2F%2F<WINDOWS-LAN-IP>%3A8899`.
Both the `BATTLE_DEV_ORIGINS` value and the page origin must use the same
Windows LAN IP and port. The forwarding rules expose these development ports
to the local subnet only; use them on a trusted private network.

Remove the forwarding and firewall rules from elevated PowerShell when done:

```powershell
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=8898
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=8899
Remove-NetFirewallRule -DisplayName "GORWELD Battle LAN 8898"
Remove-NetFirewallRule -DisplayName "GORWELD Battle LAN 8899"
```

WSL's IP can change after a Windows/WSL reboot. Recheck it and update the
`connectaddress` in each portproxy rule before testing again.
