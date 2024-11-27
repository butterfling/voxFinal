import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { z } from "zod";
import AWS from 'aws-sdk';
import { env } from "@/env.mjs";
import { Prisma, Room } from "@prisma/client";

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  region: env.AWS_REGION.replace(/['"]/g, ''),
  endpoint: 'https://s3.eu-north-1.amazonaws.com',
  signatureVersion: 'v4'
});

const generateBucketName = (roomName: string): string => {
  const sanitizedName = roomName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `voxbridge-meeting-${sanitizedName}`;
};

const uploadToS3 = async (bucketName: string, summary: string, roomName: string) => {
  const key = `summary-${Date.now()}.txt`;
  await s3.putObject({
    Bucket: bucketName,
    Key: key,
    Body: summary,
    ContentType: 'text/plain',
  }).promise();

  return s3.getSignedUrl('getObject', {
    Bucket: bucketName,
    Key: key,
    Expires: 604800 // URL expires in 7 days
  });
};

export const summaryRouter = createTRPCRouter({
  getRoomSummary: protectedProcedure
    .input(
      z.object({
        roomName: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Get transcripts from the database
      const transcripts = await ctx.prisma.transcript.findMany({
        where: {
          Room: {
            name: input.roomName,
          },
        },
        include: {
          User: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      if (transcripts.length === 0) {
        throw new Error("No transcripts found for this room");
      }

      // Format transcripts for BERT summarization
      const conversationText = transcripts
        .map((t) => `${t.User?.name || 'Unknown User'}: ${t.transcription}`)
        .join("\n");

      // Generate summary using BERT API endpoint
      const response = await fetch(`${env.NEXTAUTH_URL}/api/generate-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcripts: conversationText,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }

      const { summary } = await response.json();

      // Upload to S3
      const bucketName = generateBucketName(input.roomName);
      try {
        // Ensure bucket exists
        try {
          await s3.headBucket({ Bucket: bucketName }).promise();
        } catch (error: any) {
          if (error.code === 'NotFound' || error.code === 'NoSuchBucket') {
            await s3.createBucket({
              Bucket: bucketName,
              CreateBucketConfiguration: {
                LocationConstraint: env.AWS_REGION.replace(/['"]/g, '')
              }
            }).promise();
          }
        }

        const s3Url = await uploadToS3(bucketName, summary, input.roomName);

        // Store the summary URL in the database
        const updateData = {
          summaryUrl: s3Url,
          summary: summary
        } as Prisma.RoomUpdateInput;

        await ctx.prisma.room.update({
          where: { name: input.roomName },
          data: updateData,
        });

        return {
          summary,
          summaryUrl: s3Url,
        };
      } catch (error) {
        console.error('Error uploading to S3:', error);
        throw new Error('Failed to store summary in S3');
      }
    }),
});
