# SummitJambo + LiveKit conference backend

This project turns the SummitJambo conference UI into a real WebRTC conference application using LiveKit.

## Features

- Multi-user audio/video conferences
- Microphone and camera controls
- Native browser screen sharing
- Participant list API
- Room creation
- Short-lived participant JWTs generated only on the backend
- Server-side MP4 room recording through LiveKit Egress
- S3-compatible recording storage
- Local browser recording remains available as a fallback in the UI
- Basic host/admin protection for recording and moderation endpoints

LiveKit's browser SDK connects participants to rooms, while its Node.js server SDK manages rooms/tokens and Egress recording. Screen sharing is published as a LiveKit video track. See the official documentation linked in the project notes below.

## 1. Create a LiveKit project

Use LiveKit Cloud or a self-hosted LiveKit deployment. Copy the WebSocket URL, API key and API secret into `.env`.

Never put the LiveKit API secret in `public/index.html` or any browser code.

## 2. Configure recording storage

For server-side MP4 recordings, configure an S3-compatible bucket:

- AWS S3, Cloudflare R2, MinIO, etc.
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_BUCKET_NAME`
- optionally `AWS_ENDPOINT`

The recording endpoint starts a LiveKit room-composite Egress and writes the MP4 to the configured bucket.

## 3. Install and run

```bash
npm install
copy .env.example .env
# edit .env with your LiveKit and storage credentials
npm start
```

On Linux/macOS, use `cp .env.example .env` instead of `copy`.

Open:

`http://localhost:3000`

## 4. Frontend configuration

The included `public/index.html` is configured to call:

- `POST /api/livekit/room`
- `POST /api/livekit/token`
- `POST /api/livekit/recording`

The token endpoint returns the actual LiveKit WebSocket URL, so the browser does not need a project secret.

## 5. Recording authorization

Set `CONFERENCE_ADMIN_KEY` in `.env`. The current UI does not expose this secret, so the record button will return 403 if the key is enabled.

For a real public deployment, replace this demo mechanism with authenticated host accounts/sessions. Do not put the admin key in the HTML.

## 6. Production checklist

- Put the backend behind HTTPS.
- Use authenticated users and host roles.
- Replace the demo admin-key mechanism with session/JWT authorization.
- Add rate limiting and abuse protection.
- Store conference metadata in a database.
- Use signed/download-controlled recording URLs instead of exposing a public bucket.
- Configure LiveKit webhooks to persist room and recording lifecycle events.
- Configure your S3/R2 bucket lifecycle and retention policy.
- Add moderation controls such as mute, remove participant, lock room and waiting room.
