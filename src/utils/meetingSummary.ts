import { env } from "@/env.mjs";

const BUCKET_NAME = 'meeting-summaries-bucket';

async function createBucketIfNotExists(): Promise<void> {
  try {
    await fetch('/api/s3-operations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'createBucket',
        bucketName: BUCKET_NAME,
      }),
    });
  } catch (error: unknown) {
    console.error('Error creating bucket:', error);
    throw error;
  }
}

export async function generateMeetingSummary(transcripts: string[]): Promise<string> {
  try {
    if (!Array.isArray(transcripts)) {
      throw new Error('Transcripts must be an array');
    }

    if (transcripts.length === 0) {
      throw new Error('No transcripts provided');
    }

    console.log('Sending request with transcript count:', transcripts.length);
    
    const response = await fetch('/api/generate-summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transcripts }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to generate summary');
    }

    const data = await response.json();
    
    if (!data.summary) {
      throw new Error('No summary received from API');
    }

    return data.summary;
  } catch (error: unknown) {
    console.error('Error generating summary:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate summary: ${error.message}`);
    }
    throw new Error('Failed to generate summary');
  }
}

export async function uploadToS3(summary: string, roomName: string): Promise<string> {
  try {
    if (!summary || !roomName) {
      throw new Error('Summary and room name are required');
    }

    const response = await fetch('/api/s3-operations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'uploadSummary',
        summary,
        roomName,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to upload to S3');
    }

    const data = await response.json();
    
    if (!data.url) {
      throw new Error('No URL received from S3 upload');
    }

    return data.url;
  } catch (error: unknown) {
    console.error('Error uploading to S3:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to upload to S3: ${error.message}`);
    }
    throw new Error('Failed to upload to S3');
  }
}
