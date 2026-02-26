# OCPP 1.6J Charge Point Simulator

A WebSocket-based OCPP 1.6 JSON charge point simulator for testing the Recharge backend (or any OCPP 1.6 CSMS). Mimics real charger behaviour with configurable profiles, session state machine, and HTTP control API.

## Quick start

```bash
cd ocpp-simulator
cp .env.example .env
# Edit .env: set CSMS_WS_URL and CHARGE_POINT_ID
npm install
cd client && npm install && cd ..
npm start
```

`npm start` runs the backend (port 3000) and React dashboard (port 5173) and opens the browser. The dashboard uses Socket.io for real-time updates.

**Production:** `npm run build` then `npm run start:prod` — the backend serves the built React app at `/`.

## Configuration

Copy `.env.example` to `.env` and set:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CSMS_WS_URL` | Yes | - | Base WebSocket URL (e.g. `wss://localhost:8081/ocpp`) |
| `CHARGE_POINT_ID` | Yes | - | Charge point ID (e.g. `CP001`) |
| `AUTO_CONNECT` | No | `true` | Connect on startup; `false` = connect via HTTP API |
| `NUMBER_OF_CONNECTORS` | No | `2` | Number of connectors |
| `CHARGING_SPEED_KW` | No | `7.4` | Overridden by profile when set |
| `MAX_SESSION_DURATION_SEC` | No | `3600` | Max session length; `0` = no limit |
| `CHARGER_PROFILE` | No | - | Profile id: `slow_ac_7kw`, `fast_ac_22kw`, `rapid_dc_50kw`, `ultrarapid_dc_150kw` |
| `TRIGGER_HTTP_PORT` | No | `3000` | Control API port; `0` = disabled |
| `LOG_LEVEL` | No | `info` | `debug` \| `info` \| `warn` \| `error` |

See `.env.example` for full documentation.

## Charger profiles

Profiles are defined in `profiles.json`:

| Profile | Power | Connector | Meter interval |
|---------|-------|-----------|----------------|
| `slow_ac_7kw` | 7.4 kW | Type2 | 60 s |
| `fast_ac_22kw` | 22 kW | Type2 | 30 s |
| `rapid_dc_50kw` | 50 kW | CCS | 10 s |
| `ultrarapid_dc_150kw` | 150 kW | CCS | 5 s |

Each profile sets measurands (e.g. energy-only for slow AC, power/current/voltage for DC) and quirks (power taper, temperature reporting).

## HTTP control API

The control API runs on `TRIGGER_HTTP_PORT` (default 3000).

| Method | Path | Body | Description |
|--------|------|------|--------------|
| GET | `/` | - | HTML status page with controls |
| GET | `/status` | - | JSON simulator state |
| GET | `/profiles` | - | List charger profiles |
| POST | `/connect` | `{}` | Connect to CSMS |
| POST | `/disconnect` | `{}` | Disconnect |
| POST | `/plug-in` | `{ connectorId?: 1 }` | Simulate vehicle plugging in |
| POST | `/plug-out` | `{ connectorId?: 1 }` | Simulate unplugging |
| POST | `/start-session` | `{ connectorId?: 1, idTag?: "RFID" }` | Start charging (RFID flow) |
| POST | `/stop-session` | `{ connectorId?: 1 }` or `{ transactionId, reason? }` | Stop session |
| POST | `/fault` | `{ connectorId?: 1 }` | Put connector in faulted state |
| POST | `/available` | `{ connectorId? }` | Clear fault, return to available |
| POST | `/set-profile/:profileName` | `{}` | Change charger profile |

## Running with Docker Compose

The simulator can run alongside the Recharge backend using Docker Compose with the `simulator` profile (disabled by default so it doesn’t run in production):

```bash
# From recharge-backend directory
docker-compose --profile simulator up -d
```

This brings up the simulator service in addition to the main stack. The simulator connects to the API at `ws://api:${API_PORT}/ocpp`. Ensure your backend exposes OCPP 1.6 at `/ocpp`.

Optional overrides in `recharge-backend/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `SIMULATOR_CHARGE_POINT_ID` | `CP001` | Charge point ID |
| `SIMULATOR_HTTP_PORT` | `3000` | Control API port (host) |
| `SIMULATOR_CHARGER_PROFILE` | `slow_ac_7kw` | Profile id |
| `SIMULATOR_AUTO_CONNECT` | `true` | Auto-connect on startup |

To run everything except the simulator:

```bash
docker-compose up -d
```

## Logging

- **LOG_LEVEL**: `debug`, `info`, `warn`, `error`
- All OCPP messages (sent and received) are logged with timestamps at `info` level:
  - `→` = message sent to CSMS
  - `←` = message received from CSMS

## CLI (interactive)

When stdin is a TTY, the simulator accepts commands:

- `start <connector> [idTag]` – Start session
- `stop <connector>` – Stop session
- `status` – Show connector state
- `help` – List commands
