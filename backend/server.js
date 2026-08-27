import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptionsPreset,
  RoomServiceClient,
  S3Upload,
} from 'livekit-server-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = Number(process.env.PORT || 3000);
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_HTTP_URL = LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
const API_KEY = process.env.LIVEKIT_API_KEY || '';
const API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const ADMIN_KEY = process.env.CONFERENCE_ADMIN_KEY || '';
const MAX_ROOM_PARTICIPANTS = Number(process.env.MAX_ROOM_PARTICIPANTS || 100);
const TOKEN_TTL = process.env.TOKEN_TTL || '2h';

if (!LIVEKIT_URL || !API_KEY || !API_SECRET) {
  console.warn('LiveKit credentials are not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.');
}

const rooms = new RoomServiceClient(LIVEKIT_HTTP_URL, API_KEY, API_SECRET);
const egress = new EgressClient(LIVEKIT_HTTP_URL, API_KEY, API_SECRET);

function assertLiveKitConfigured() {
  if (!LIVEKIT_URL || !API_KEY || !API_SECRET) {
    const err = new Error('LiveKit is not configured on the server.');
    err.status = 503;
    throw err;
  }
}

function cleanRoomName(value) {
  const name = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  if (!name) throw Object.assign(new Error('roomName is required'), { status: 400 });
  return name;
}

function cleanDisplayName(value) {
  const name = String(value || 'Guest').trim().replace(/[<>]/g, '').slice(0, 80);
  return name || 'Guest';
}

function adminOnly(req) {
  // Demo protection. Do not expose this secret in frontend JavaScript.
  // In production, replace with a real authenticated host/session check.
  if (!ADMIN_KEY) return;
  const supplied = req.get('x-conference-admin-key');
  if (supplied !== ADMIN_KEY) {
    const err = new Error('Host authorization required.');
    err.status = 403;
    throw err;
  }
}

function recordingOutput(roomName) {
  const bucket = process.env.AWS_BUCKET_NAME;
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || '';
  if (!bucket || !accessKey || !secret) {
    const err = new Error('Recording storage is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_BUCKET_NAME.');
    err.status = 503;
    throw err;
  }

  const safeRoom = cleanRoomName(roomName);
  const prefix = `summitjambo/${safeRoom}/${Date.now()}-${crypto.randomUUID()}`;
  const s3 = new S3Upload({
    accessKey,
    secret,
    bucket,
    region,
    ...(process.env.AWS_ENDPOINT ? { endpoint: process.env.AWS_ENDPOINT } : {}),
    forcePathStyle: String(process.env.AWS_FORCE_PATH_STYLE).toLowerCase() === 'true',
  });

  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: `${prefix}.mp4`,
    output: { case: 's3', value: s3 },
  });
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'SummitJambo LiveKit backend',
    livekitConfigured: Boolean(LIVEKIT_URL && API_KEY && API_SECRET),
    recordingConfigured: Boolean(process.env.AWS_BUCKET_NAME && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
  });
});


const connectionCodes = new Map();
function makeConnectionCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[crypto.randomInt(0, alphabet.length)];
  return code.slice(0,4) + '-' + code.slice(4);
}
function getConnection(code) {
  const item = connectionCodes.get(String(code || '').toUpperCase());
  if (!item || item.expiresAt < Date.now()) { if (item) connectionCodes.delete(String(code || '').toUpperCase()); return null; }
  return item;
}

app.post('/api/connect/create', async (req, res, next) => {
  try {
    assertLiveKitConfigured();
    const roomName = cleanRoomName(req.body.roomName || `sj-${crypto.randomUUID().slice(0,8)}`);
    const displayName = cleanDisplayName(req.body.displayName || 'Host');
    const room = await rooms.createRoom({ name: roomName, maxParticipants: Math.max(2, Math.min(Number(req.body.maxParticipants || 25), MAX_ROOM_PARTICIPANTS)), emptyTimeout: 10 * 60, departureTimeout: 20 });
    let code; do { code = makeConnectionCode(); } while (connectionCodes.has(code));
    connectionCodes.set(code, { roomName: room.name, createdBy: displayName, createdAt: Date.now(), expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    res.json({ ok:true, code, roomName: room.name, expiresAt: connectionCodes.get(code).expiresAt });
  } catch (err) { next(err); }
});

app.post('/api/connect/resolve', async (req, res, next) => {
  try {
    assertLiveKitConfigured();
    const code = String(req.body.code || '').trim().toUpperCase();
    const item = getConnection(code);
    if (!item) return res.status(404).json({ error: 'Connection code is invalid or expired.' });
    res.json({ ok:true, code, roomName:item.roomName, createdBy:item.createdBy, expiresAt:item.expiresAt });
  } catch (err) { next(err); }
});

app.post('/api/livekit/room', async (req, res, next) => {
  try {
    assertLiveKitConfigured();
    const roomName = cleanRoomName(req.body.roomName);
    const requested = Number(req.body.maxParticipants || 25);
    const maxParticipants = Math.max(2, Math.min(requested, MAX_ROOM_PARTICIPANTS));

    const room = await rooms.createRoom({
      name: roomName,
      maxParticipants,
      emptyTimeout: 10 * 60,
      departureTimeout: 20,
    });

    res.json({
      roomName: room.name,
      sid: room.sid,
      maxParticipants: room.maxParticipants,
    });
  } catch (err) { next(err); }
});

app.post('/api/livekit/token', async (req, res, next) => {
  try {
    assertLiveKitConfigured();
    const roomName = cleanRoomName(req.body.roomName);
    const displayName = cleanDisplayName(req.body.displayName || req.body.identity);
    const identity = `sj_${crypto.randomUUID()}`;

    // Identity is deliberately opaque; displayName is stored separately in the token.
    const at = new AccessToken(API_KEY, API_SECRET, {
      identity,
      name: displayName,
      ttl: TOKEN_TTL,
    });
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: ['camera', 'microphone', 'screen_share', 'screen_share_audio'],
    });

    const token = await at.toJwt();
    res.json({ token, wsUrl: LIVEKIT_URL, identity, displayName, roomName });
  } catch (err) { next(err); }
});

app.post('/api/livekit/recording', async (req, res, next) => {
  try {
    assertLiveKitConfigured();
    adminOnly(req);
    const roomName = cleanRoomName(req.body.roomName);
    const action = req.body.action;

    if (action === 'start') {
      // Prevent duplicate recordings for the same room.
      const active = await egress.listEgress({ roomName });
      const existing = active.find(x => ['EGRESS_STARTING', 'EGRESS_ACTIVE'].includes(x.status));
      if (existing) return res.json({ ok: true, egressId: existing.egressId, status: existing.status, alreadyRunning: true });

      const output = recordingOutput(roomName);
      const info = await egress.startRoomCompositeEgress(roomName, output, {
        layout: 'grid',
        encodingOptions: EncodingOptionsPreset.H264_1080P_30,
        audioOnly: false,
        videoOnly: false,
      });

      return res.json({ ok: true, action: 'start', egressId: info.egressId, status: info.status });
    }

    if (action === 'stop') {
      const active = await egress.listEgress({ roomName });
      const running = active.filter(x => ['EGRESS_STARTING', 'EGRESS_ACTIVE'].includes(x.status));
      await Promise.all(running.map(x => egress.stopEgress(x.egressId)));
      return res.json({ ok: true, action: 'stop', stopped: running.map(x => x.egressId) });
    }

    if (action === 'status') {
      const items = await egress.listEgress({ roomName });
      return res.json({ ok: true, recordings: items });
    }

    const err = new Error('action must be start, stop or status');
    err.status = 400;
    throw err;
  } catch (err) { next(err); }
});

// Basic room moderation endpoints for a future host control panel.
app.get('/api/livekit/participants/:roomName', async (req, res, next) => {
  try {
    assertLiveKitConfigured();
    adminOnly(req);
    const roomName = cleanRoomName(req.params.roomName);
    const participants = await rooms.listParticipants(roomName);
    res.json({ roomName, participants });
  } catch (err) { next(err); }
});

app.post('/api/livekit/rooms/:roomName/end', async (req, res, next) => {
  try {
    assertLiveKitConfigured();
    adminOnly(req);
    const roomName = cleanRoomName(req.params.roomName);
    await rooms.deleteRoom(roomName);
    res.json({ ok: true, roomName });
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SummitJambo running at http://localhost:${PORT}`);
});
