import { NextRequest } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({ region: process.env.AWS_REGION! });
const BUCKET = process.env.AWS_S3_BUCKET!;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = decodeURIComponent(url.searchParams.get("key") || "").trim();

  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 });
  
  return Response.redirect(signedUrl, 302);
}
