# 🎥 LiveKit Cloud Recording System

## ✅ What’s Implemented

The app now uses **LiveKit Cloud’s built-in room composite recording** (single mixed output). The recording flow is handled by server-side **egress** rather than client-side MediaRecorder and S3 multipart uploads.

## 🔧 How It Works

### Recording Flow
1. Host opens the **Settings** menu in a meeting.
2. Clicks **Start Recording** (server calls LiveKit Cloud Egress).
3. LiveKit Cloud records the **room composite** output.
4. Clicking **Stop Recording** ends the egress job.

### Recording Status
The UI uses LiveKit’s recording status to show when a room is being recorded:
- `useIsRecording()` drives the indicator and button state.

## 📦 Storage
Recordings are stored via **LiveKit Cloud Egress** to S3-compatible storage.
Set the S3 credentials in environment variables (see below).

## 🧾 API Endpoints

- `GET /api/recordings/livekit/start?roomName=...`
  - Starts a room composite recording.
- `GET /api/recordings/livekit/stop?roomName=...`
  - Stops all active recordings for the room.
- `GET /api/recordings/list`
  - Lists completed recordings from LiveKit egress results.

## 🔑 Required Environment Variables

```env
LIVEKIT_URL=https://<project>.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
JWT_SECRET=...
NEXT_PUBLIC_LK_RECORD_ENDPOINT=/api/recordings/livekit
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...
AWS_S3_BUCKET=...
```

Optional:
```env
LIVEKIT_RECORDING_LAYOUT=grid
```

## ✅ Notes

- Only **host/co-host** roles can start or stop recordings.
- Recording names are auto-generated via LiveKit’s `{room_name}-{time}` template.
