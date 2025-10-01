import { NextRequest } from 'next/server';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const BUCKET = process.env.AWS_S3_BUCKET!;
const REGION = process.env.AWS_REGION!;
const s3 = new S3Client({ region: REGION });

export async function GET(req: NextRequest) {
  const url = new URL(req.url!);
  const key = url.searchParams.get('key');
  if (!key) {
    return new Response('Missing key', { status: 400 });
  }

  try {
    // Get object metadata first
    const headResponse = await s3.send(new HeadObjectCommand({ 
      Bucket: BUCKET, 
      Key: key 
    }));
    
    const contentLength = headResponse.ContentLength!;
    const contentType = headResponse.ContentType || (key.endsWith('.mp4') ? 'video/mp4' : 'video/webm');
    
    // Parse Range header
    const range = req.headers.get('range');
    
    if (range) {
      // Handle range request
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;
      const chunksize = (end - start) + 1;
      
      // Get partial content from S3
      const s3Obj = await s3.send(new GetObjectCommand({ 
        Bucket: BUCKET, 
        Key: key,
        Range: `bytes=${start}-${end}`
      }));
      
      if (!s3Obj.Body) throw new Error('No body in S3 response');
      
      // Convert stream to buffer
      const s3Stream = s3Obj.Body as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      for await (const chunk of s3Stream) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      
      return new Response(buffer, {
        status: 206, // Partial Content
        headers: {
          'Content-Range': `bytes ${start}-${end}/${contentLength}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000'
        },
      });
    } else {
      // Handle full file request
      const s3Obj = await s3.send(new GetObjectCommand({ 
        Bucket: BUCKET, 
        Key: key 
      }));
      
      if (!s3Obj.Body) throw new Error('No body in S3 response');
      
      const s3Stream = s3Obj.Body as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      for await (const chunk of s3Stream) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      
      return new Response(buffer, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': contentLength.toString(),
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000'
        },
      });
    }
  } catch (err: any) {
    if (err.name === 'NoSuchKey') {
      return new Response('Not found', { status: 404 });
    }
    console.error('Stream error:', err);
    return new Response(`Internal server error: ${err.message}`, { status: 500 });
  }
}