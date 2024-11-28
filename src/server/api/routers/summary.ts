import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { z } from "zod";
import AWS from 'aws-sdk';
import { env } from "@/env.mjs";
import { Prisma, Room } from "@prisma/client";
import { pipeline } from '@xenova/transformers';

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  region: env.AWS_REGION.replace(/['"`]/g, ''),
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

// Local summarizer initialization
let summarizer: any = null;

async function initializeSummarizer() {
  if (!summarizer) {
    console.log('Initializing summarizer...');
    summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6');
    console.log('Summarizer initialized successfully');
  }
  return summarizer;
}

// Function to generate summary from text
async function generateSummaryFromText(transcription: string) {
  const summarizer = await initializeSummarizer();
  
  const result = await summarizer(transcription, {
    max_length: 250,
    min_length: 50,
    length_penalty: 2.0,
    num_beams: 4,
    early_stopping: true,
    do_sample: false
  });

  return result;
}

export const summaryRouter = createTRPCRouter({
  generateSummary: protectedProcedure
    .input(
      z.object({
        roomName: z.string(),
        transcription: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      console.log('[DEBUG] Pipeline initialized, generating summary');
      console.log('Generating summary for transcript length:', input.transcription.length);

      // Generate summary using pipeline
      const summary = await generateSummaryFromText(input.transcription);
      console.log('[DEBUG] Summary generation completed:', summary);
      console.log('[DEBUG] Generated summary:', summary[0]?.summary_text);

      // Upload to S3
      const bucketName = generateBucketName(input.roomName);
      console.log('[DEBUG] Generated bucket name:', bucketName);

      console.log('[DEBUG] Checking if bucket exists:', bucketName);
      try {
        await s3.headBucket({ Bucket: bucketName }).promise();
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.log('[DEBUG] Bucket check error:', (error as AWS.AWSError).code);
          if ((error as AWS.AWSError).code === 'NotFound') {
            console.log('[DEBUG] Creating new bucket:', bucketName);
            await s3.createBucket({
              Bucket: bucketName,
              CreateBucketConfiguration: {
                LocationConstraint: env.AWS_REGION.replace(/['"`]/g, '')
              }
            }).promise();
            console.log('[DEBUG] Bucket created successfully:', bucketName);
          }
        }
      }

      const summaryUrl = await uploadToS3(bucketName, summary[0]?.summary_text || '', input.roomName);
      console.log('[DEBUG] Summary uploaded to S3, URL:', summaryUrl);

      return {
        summary: summary[0]?.summary_text || '',
        url: summaryUrl
      };
    }),

  getRoomSummary: protectedProcedure
    .input(z.object({
      roomName: z.string(),
    }))
    .query(async ({ input }) => {
      const bucketName = generateBucketName(input.roomName);
      try {
        const objects = await s3.listObjectsV2({
          Bucket: bucketName,
        }).promise();

        if (objects.Contents && objects.Contents.length > 0) {
          // Get the latest summary file
          const latestObject = objects.Contents.reduce((latest, current) => {
            return !latest || (current.LastModified && latest.LastModified && current.LastModified > latest.LastModified) 
              ? current 
              : latest;
          });

          if (latestObject.Key) {
            const url = s3.getSignedUrl('getObject', {
              Bucket: bucketName,
              Key: latestObject.Key,
              Expires: 604800 // URL expires in 7 days
            });

            return { url };
          }
        }
        return { url: null };
      } catch (error) {
        console.error('Error getting room summary:', error);
        return { url: null };
      }
    }),
    
  sendSummaryEmails: protectedProcedure
    .input(
      z.object({
        roomName: z.string(),
        summaryUrl: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get room participants
      console.log('[DEBUG] Fetching room participants');
      const participants = await ctx.prisma.participant.findMany({
        where: {
          RoomName: input.roomName,
        },
        include: {
          User: {
            select: {
              email: true,
            },
          },
        },
      });

      console.log('[DEBUG] Found participants:', participants);

      // Send email to each participant
      const emailPromises = participants
        .filter(p => p.User?.email)
        .map(async (participant) => {
          if (!participant.User?.email) return null;
          try {
            console.log('[DEBUG] Attempting to send email to:', participant.User.email);
            const result = await fetch('http://localhost:3000/api/send-email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                email: participant.User.email,
                roomName: input.roomName,
                summaryUrl: input.summaryUrl,
              }),
            });

            if (!result.ok) {
              const errorData = await result.json();
              console.error('[DEBUG] Failed to send email:', errorData);
              throw new Error(`Failed to send email: ${errorData.error || 'Unknown error'}`);
            }

            const data = await result.json();
            console.log('[DEBUG] Email sent successfully:', data);
            return { email: participant.User.email, success: true };
          } catch (error) {
            console.error('[DEBUG] Error sending email to', participant.User.email, error);
            return { email: participant.User.email, success: false, error };
          }
        });

      const emailResults = await Promise.allSettled(emailPromises);
      
      const emailSummary = emailResults.reduce((acc: { successful: string[], failed: string[] }, result) => {
        if (result.status === 'fulfilled' && result.value) {
          if (result.value.success) {
            acc.successful.push(result.value.email);
          } else {
            acc.failed.push(result.value.email);
          }
        }
        return acc;
      }, { successful: [], failed: [] });

      console.log('[DEBUG] Email notification summary:', emailSummary);

      return emailSummary;
    }),
});
