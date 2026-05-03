import { WebSocketServer, WebSocket } from 'ws';

const footboardClients = new Set();

let latestFootboardState = {
  s1: false,
  s2: false,
  s3: false,
  risk: 0,
  speed_kmh: 0,
  rpm: 0,
  pulses: 0,
  pulses_per_sec: 0,
  moving: false,
  online: false,
  updated_at: null,
};

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on', 'occupied', 'blocked'].includes(value.trim().toLowerCase());
  }
  return false;
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeFootboardState(body = {}) {
  const s1 = parseBoolean(body.s1);
  const s2 = parseBoolean(body.s2);
  const s3 = parseBoolean(body.s3);
  const risk = Number.isFinite(Number(body.risk)) ? Number(body.risk) : s3 ? 3 : s2 ? 2 : s1 ? 1 : 0;
  const speedKmh = Math.max(0, parseNumber(body.speed_kmh, 0));

  return {
    s1,
    s2,
    s3,
    risk,
    speed_kmh: speedKmh,
    rpm: Math.max(0, parseNumber(body.rpm, 0)),
    pulses: Math.max(0, parseNumber(body.pulses, 0)),
    pulses_per_sec: Math.max(0, parseNumber(body.pulses_per_sec, 0)),
    moving: parseBoolean(body.moving ?? speedKmh > 0.1),
    online: true,
    updated_at: new Date().toISOString(),
  };
}

function sendJson(ws, event, data) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ event, data }));
}

export function updateFootboardLiveState(body) {
  latestFootboardState = normalizeFootboardState(body);

  for (const ws of footboardClients) {
    sendJson(ws, 'footboard_live', latestFootboardState);
  }

  return latestFootboardState;
}

export function getFootboardLiveState() {
  return latestFootboardState;
}

export function attachFootboardLiveWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws/footboard-live' });

  wss.on('connection', (ws) => {
    footboardClients.add(ws);
    sendJson(ws, 'footboard_live', latestFootboardState);

    ws.on('close', () => {
      footboardClients.delete(ws);
    });

    ws.on('error', () => {
      footboardClients.delete(ws);
    });
  });

  return wss;
}
