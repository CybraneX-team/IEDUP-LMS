import { NextRequest, NextResponse } from 'next/server';
import { EgressClient } from 'livekit-server-sdk';
import jwt, { JwtPayload } from 'jsonwebtoken';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const JWT_SECRET = process.env.JWT_SECRET || '';

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

  try {
    const egressId = request.nextUrl.searchParams.get('egressId');
    const active = egressId
      ? [{ egressId }]
      : await egressClient.listEgress({ roomName, active: true });

    if (active.length === 0) {
      return errorResponse('No active recording found', 404);
    }

    const stopped = await Promise.all(
      active.map((item) => egressClient.stopEgress(item.egressId)),
    );

    return NextResponse.json({
      stopped: stopped.map((info) => ({
        egressId: info.egressId,
        status: info.status,
      })),
    });
  } catch (error) {
    console.error('Failed to stop LiveKit recording:', error);
    return errorResponse('Failed to stop recording', 500);
  }
}
