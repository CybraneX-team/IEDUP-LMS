import { NextRequest } from 'next/server';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const BUCKET = process.env.AWS_S3_BUCKET!;
const REGION = process.env.AWS_REGION!;
const s3 = new S3Client({ region: REGION });

export async function GET(req: NextRequest) {
  const url = new URL(req.url!);
  const key = url.searchParams.get('key');
  if (!key) return new Response('Missing key', { status: 400 });

  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  const contentLength = head.ContentLength!;
  const contentType = head.ContentType || 'video/mp4';

  const range = req.headers.get('range');

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : contentLength - 1;

    const s3Obj = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Range: `bytes=${start}-${end}`,
      })
    );

    return new Response(s3Obj.Body as ReadableStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${contentLength}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  }

  const s3Obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));

  return new Response(s3Obj.Body as ReadableStream, {
    status: 200,
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(contentLength),
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}
