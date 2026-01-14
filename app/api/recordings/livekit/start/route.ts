import { NextRequest, NextResponse } from 'next/server';
import { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } from 'livekit-server-sdk';
import jwt, { JwtPayload } from 'jsonwebtoken';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const JWT_SECRET = process.env.JWT_SECRET || '';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_SESSION_TOKEN = process.env.AWS_SESSION_TOKEN;
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

export async function GET(request: NextRequest) {
  if (!API_KEY || !API_SECRET || !LIVEKIT_URL) {
    return errorResponse('LiveKit server is not configured', 500);
  }

  const roomName = request.nextUrl.searchParams.get('roomName');
  if (!roomName) {
    return errorResponse('Missing roomName', 400);
  }

  const role = getRoleFromRequest(request);
  if (!role) {
    return errorResponse('Unauthorized', 401);
  }
  if (!HOST_ROLES.has(role)) {
    return errorResponse('Forbidden', 403);
  }

  const egressClient = new EgressClient(
    normalizeLiveKitHost(LIVEKIT_URL),
    API_KEY,
    API_SECRET,
  );

  const activeEgress = await egressClient.listEgress({ roomName, active: true });
  if (activeEgress.length > 0) {
    return errorResponse('Recording already in progress', 409);
  }

  const s3Configured =
    AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_REGION && AWS_S3_BUCKET;
  if (!s3Configured) {
    return errorResponse(
      'Recording storage is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, and AWS_S3_BUCKET.',
      500,
    );
  }
  const s3Output = new S3Upload({
    accessKey: AWS_ACCESS_KEY_ID,
    secret: AWS_SECRET_ACCESS_KEY,
    sessionToken: AWS_SESSION_TOKEN ?? '',
    region: AWS_REGION,
    bucket: AWS_S3_BUCKET,
  });
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: 'recordings/{room_name}-{time}.mp4',
    output: {
      case: 's3',
      value: s3Output,
    },
  });
  const layout = process.env.LIVEKIT_RECORDING_LAYOUT;

  try {
    const info = await egressClient.startRoomCompositeEgress(
      roomName,
      output,
      layout ? { layout } : undefined,
    );
    return NextResponse.json({
      egressId: info.egressId,
      status: info.status,
      roomName: info.roomName,
    });
  } catch (error) {
    console.error('Failed to start LiveKit recording:', error);
    return errorResponse('Failed to start recording', 500);
  }
}
