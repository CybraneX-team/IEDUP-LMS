import { NextRequest, NextResponse } from 'next/server';
import { EgressClient, EgressStatus } from 'livekit-server-sdk';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import jwt, { JwtPayload } from 'jsonwebtoken';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const JWT_SECRET = process.env.JWT_SECRET || '';
const AWS_REGION = process.env.AWS_REGION;
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET;

const HOST_ROLES = new Set(['host', 'co-host']);

const errorResponse = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

const normalizeLiveKitHost = (url: string) => {
  if (url.startsWith('wss://')) return `https://${url.slice('wss://'.length)}`;
  if (url.startsWith('ws://')) return `http://${url.slice('ws://'.length)}`;
  return url;
};

const parseLegacyFileName = (key: string) => {
  // {userId}_{roomName}_{timestamp}_{recordingId}[_{quality}][__recordingName].(webm|mp4)
  const match = key.match(
    /^(.+?)_(.+?)_(\d+)_(.+?)(?:_(low|medium|high))?(?:__(.+?))?\.(webm|mp4)$/i,
  );
  if (!match) return null;
  const [, userId, roomName, timestamp, recordingId, quality, recordingName, format] = match;
  return {
    userId,
    roomName,
    timestamp: Number(timestamp),
    recordingId,
    quality: quality || undefined,
    recordingName: recordingName || undefined,
    format: (format || 'mp4').toLowerCase(),
  };
};

const estimateDurationSeconds = (sizeBytes?: number) => {
  if (!sizeBytes || sizeBytes <= 0) return 0;
  return Math.round((sizeBytes / (500 * 1024)) * 30);
};

const getRoleFromRequest = (request: NextRequest) => {
  const token = request.cookies.get('accessToken')?.value;
  if (!token || !JWT_SECRET) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
    const metadata = typeof payload?.metadata === 'object' ? payload.metadata : {};
    return typeof metadata.role === 'string' ? metadata.role : null;
  } catch {
    return null;
  }
};

const toMillis = (value: bigint) => {
  const abs = value < 0n ? -value : value;
  if (abs > 1_000_000_000_000_000n) {
    return Number(value / 1_000_000n);
  }
  if (abs > 1_000_000_000_000n) {
    return Number(value / 1_000n);
  }
  return Number(value);
};

const toSeconds = (value: bigint) => {
  if (value <= 0n) return 0;
  const ms = toMillis(value);
  return Math.max(0, Math.round(ms / 1000));
};

const getFileExtension = (filename: string) => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'mp4';
};

export async function GET(request: NextRequest) {
  if (!API_KEY || !API_SECRET || !LIVEKIT_URL) {
    return errorResponse('LiveKit server is not configured', 500);
  }

  const role = getRoleFromRequest(request);
  if (!role) {
    return errorResponse('Unauthorized', 401);
  }
  if (!HOST_ROLES.has(role)) {
    return errorResponse('Forbidden', 403);
  }

  const roomName = request.nextUrl.searchParams.get('roomName') || undefined;
  const egressClient = new EgressClient(
    normalizeLiveKitHost(LIVEKIT_URL),
    API_KEY,
    API_SECRET,
  );
  const s3Client =
    AWS_REGION && AWS_S3_BUCKET ? new S3Client({ region: AWS_REGION }) : null;

  try {
    const egresses = await egressClient.listEgress(
      roomName ? { roomName } : {},
    );

    const livekitRecordings = egresses
      .flatMap((egress) => {
        const fileResults = (egress.fileResults?.length ?? 0) > 0
          ? egress.fileResults
          : egress.result?.case === 'file'
            ? [egress.result.value]
            : [];

        if (fileResults.length === 0) {
          return [];
        }

        return fileResults.map((file, index) => {
          const startedAtMs = toMillis(file.startedAt);
          const endedAtMs = file.endedAt > 0n ? toMillis(file.endedAt) : 0;
          const durationSeconds =
            endedAtMs > startedAtMs
              ? Math.round((endedAtMs - startedAtMs) / 1000)
              : toSeconds(file.duration);
          const sizeBytes = Number(file.size);
          const filename = file.filename || `recording-${egress.egressId}-${index}.mp4`;
          const format = getFileExtension(filename);
          const name = filename.replace(/\.[^/.]+$/, '');
          const contentType = format === 'mp4' ? 'video/mp4' : `video/${format}`;
          const key = filename;

          return {
            id: `${egress.egressId}-${index}`,
            roomName: egress.roomName,
            name,
            startedAtMs,
            durationSeconds,
            sizeBytes,
            url: file.location,
            filename,
            key,
            format,
            contentType,
            status: egress.status,
          };
        });
      })
      .filter((recording) => recording.status === EgressStatus.EGRESS_COMPLETE)
      .sort((a, b) => b.startedAtMs - a.startedAtMs);

    const livekitKeys = new Set(livekitRecordings.map((recording) => recording.key));

    let legacyRecordings: typeof livekitRecordings = [];
    if (s3Client && AWS_S3_BUCKET) {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({ Bucket: AWS_S3_BUCKET, MaxKeys: 1000 }),
      );
      const objects = listResponse.Contents ?? [];
      legacyRecordings = objects
        .filter((obj) => obj.Key && !livekitKeys.has(obj.Key))
        .map((obj) => {
          const key = obj.Key!;
          const parsed = parseLegacyFileName(key);
          if (!parsed) {
            return null;
          }
          const startedAtMs = parsed.timestamp;
          const sizeBytes = obj.Size ?? 0;
          const durationSeconds = estimateDurationSeconds(sizeBytes);
          const format = parsed.format;
          const name = parsed.recordingName || parsed.roomName;
          const contentType = format === 'mp4' ? 'video/mp4' : `video/${format}`;

          return {
            id: `legacy-${parsed.recordingId}`,
            roomName: parsed.roomName,
            name,
            startedAtMs,
            durationSeconds,
            sizeBytes,
            url: AWS_REGION
              ? `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`
              : '',
            filename: key,
            key,
            format,
            contentType,
            status: EgressStatus.EGRESS_COMPLETE,
          };
        })
        .filter((recording): recording is NonNullable<typeof recording> => Boolean(recording))
        .sort((a, b) => b.startedAtMs - a.startedAtMs);
    }

    const recordings = [...livekitRecordings, ...legacyRecordings].sort(
      (a, b) => b.startedAtMs - a.startedAtMs,
    );

    const totalSize = recordings.reduce((sum, rec) => sum + (rec.sizeBytes || 0), 0);
    const totalDuration = recordings.reduce(
      (sum, rec) => sum + (rec.durationSeconds || 0),
      0,
    );

    return NextResponse.json({
      recordings,
      summary: {
        total: recordings.length,
        totalSizeBytes: totalSize,
        totalDurationSeconds: totalDuration,
      },
    });
  } catch (error) {
    console.error('Failed to list LiveKit recordings:', error);
    return errorResponse('Failed to fetch recordings', 500);
  }
}
