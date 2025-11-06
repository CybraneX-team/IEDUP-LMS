import { NextRequest } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const s3 = new S3Client({ region: process.env.AWS_REGION! });
const BUCKET = process.env.AWS_S3_BUCKET!;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = decodeURIComponent(url.searchParams.get("key") || "").trim();

  const s3Obj = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );

  if (!s3Obj.Body) {
    return new Response("No body", { status: 404 });
  }

  const contentType = key.endsWith(".mp4") ? "video/mp4" : "video/webm";

  return new Response(s3Obj.Body as any, {
    headers: {
      "Content-Type": contentType,
      // ✅ This makes the browser show a real progress bar
      "Content-Length": s3Obj.ContentLength?.toString() ?? "",
      "Content-Disposition": `attachment; filename="${key}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
    },
  });
}
