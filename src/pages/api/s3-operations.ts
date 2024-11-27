import { type NextApiRequest, type NextApiResponse } from "next";
import AWS from 'aws-sdk';
import { env } from "@/env.mjs";

// Configure AWS
const s3 = new AWS.S3({
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  region: env.AWS_REGION.replace(/['"]/g, ''), // Remove any quotes
  endpoint: 'https://s3.eu-north-1.amazonaws.com',
  signatureVersion: 'v4'
});

function generateBucketName(roomName: string): string {
  // Convert to lowercase and replace invalid characters with hyphens
  const sanitizedName = roomName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  // Add a prefix to ensure uniqueness and compliance with S3 naming rules
  const bucketName = `voxbridge-meeting-${sanitizedName}`;
  console.log(`[DEBUG] Generated bucket name: ${bucketName}`);
  return bucketName;
}

async function ensureBucketExists(bucketName: string) {
  console.log(`[DEBUG] Checking if bucket exists: ${bucketName}`);
  try {
    await s3.headBucket({ Bucket: bucketName }).promise();
    console.log(`[DEBUG] Bucket already exists: ${bucketName}`);
  } catch (error: any) {
    console.log(`[DEBUG] Bucket check error:`, error.code);
    if (error.code === 'NotFound' || error.code === 'NoSuchBucket') {
      try {
        console.log(`[DEBUG] Creating new bucket: ${bucketName}`);
        await s3.createBucket({
          Bucket: bucketName
        }).promise();
        
        console.log(`[DEBUG] Bucket created successfully: ${bucketName}`);
      } catch (error) {
        console.log(`[DEBUG] Failed to create bucket:`, error);
        throw error;
      }
    } else {
      console.error(`[DEBUG] Unexpected bucket error:`, error);
      throw error;
    }
  }
}

async function uploadToS3(bucketName: string, summary: string, roomName: string): Promise<string> {
  const key = `${roomName}-summary.txt`;
  
  try {
    await s3.putObject({
      Bucket: bucketName,
      Key: key,
      Body: summary,
      ContentType: 'text/plain'
    }).promise();

    // Generate a pre-signed URL that expires in 7 days
    const url = s3.getSignedUrl('getObject', {
      Bucket: bucketName,
      Key: key,
      Expires: 7 * 24 * 60 * 60 // 7 days in seconds
    });

    console.log(`[DEBUG] File uploaded successfully, generated signed URL`);
    return url;
  } catch (error) {
    console.log(`[DEBUG] Failed to upload file:`, error);
    throw error;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  try {
    const { action, summary, roomName } = req.body;
    if (action === 'uploadSummary') {
      if (!summary || !roomName) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const bucketName = generateBucketName(roomName);

      // Ensure bucket exists before upload
      await ensureBucketExists(bucketName);

      const url = await uploadToS3(bucketName, summary, roomName);
      console.log(`[DEBUG] Successfully uploaded summary. URL: ${url}`);
      return res.status(200).json({ url });
    }
    return res.status(400).json({ message: 'Invalid action' });
  } catch (error) {
    console.error('S3 operation error:', error);
    return res.status(500).json({ message: 'S3 operation failed', error: String(error) });
  }
}
