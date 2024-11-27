import { z } from "zod";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import type { AccessTokenOptions, VideoGrant } from "livekit-server-sdk";
import { TRPCError } from "@trpc/server";

const createToken = (userInfo: AccessTokenOptions, grant: VideoGrant) => {
  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit API key or secret is missing");
  }
  const at = new AccessToken(apiKey, apiSecret, userInfo);
  at.ttl = "5m";
  at.addGrant(grant);
  return at.toJwt();
};

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const apiHost = process.env.NEXT_PUBLIC_LIVEKIT_API_HOST as string;

// Ensure apiHost has proper protocol
const formattedApiHost = apiHost.startsWith('http') 
  ? apiHost 
  : `https://${apiHost}`;

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TokenResult } from "@/lib/types";

// Initialize LiveKit client only if we have all required env vars
const roomClient = apiHost && apiKey && apiSecret 
  ? new RoomServiceClient(formattedApiHost, apiKey, apiSecret)
  : null;

export const roomsRouter = createTRPCRouter({
  joinRoom: protectedProcedure
    .input(
      z.object({
        roomName: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const identity = ctx.session.user.id;
      const name = ctx.session.user.name;

      const grant: VideoGrant = {
        room: input.roomName,
        roomJoin: true,
        canPublish: true,
        canPublishData: true,
        canSubscribe: true,
      };
      const { roomName } = input;

      const token = createToken({ identity, name: name as string }, grant);
      const result: TokenResult = {
        identity,
        accessToken: token,
      };
      try {
        // check if user is already in room
        console.log("here");
        const participant = await ctx.prisma.participant.findUnique({
          where: {
            UserId_RoomName: {
              UserId: ctx.session.user.id,
              RoomName: roomName,
            },
          },
        });
        if (participant === null)
          await ctx.prisma.participant.create({
            data: {
              User: {
                connect: {
                  id: ctx.session.user.id,
                },
              },
              Room: {
                connect: {
                  name: roomName,
                },
              },
            },
          });
      } catch (error) {
        console.log(error);
      }

      return result;
    }),

  createRoom: protectedProcedure.mutation(async ({ ctx }) => {
    // Validate session
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "You must be logged in to create a room",
      });
    }

    // Validate LiveKit configuration
    if (!roomClient) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "LiveKit configuration is missing",
      });
    }

    try {
      // Create room in database
      const room = await ctx.prisma.room.create({
        data: {
          Owner: {
            connect: {
              id: ctx.session.user.id,
            },
          },
        },
      });

      // Create room in LiveKit
      await roomClient.createRoom({
        name: room.name,
        emptyTimeout: 10 * 60, // 10 minutes
        maxParticipants: 20,
      });

      // Create token for room access
      const grant: VideoGrant = {
        room: room.name,
        roomJoin: true,
        canPublish: true,
        canPublishData: true,
        canSubscribe: true,
      };

      const token = createToken(
        { 
          identity: ctx.session.user.id, 
          name: ctx.session.user.name || ctx.session.user.id 
        }, 
        grant
      );

      // Add creator as participant
      await ctx.prisma.participant.create({
        data: {
          UserId: ctx.session.user.id,
          RoomName: room.name,
        },
      });

      return {
        roomName: room.name,
        token,
      };
    } catch (error) {
      console.error("Failed to create room:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create room",
        cause: error,
      });
    }
  }),

  getRoomsByUser: protectedProcedure.query(async ({ ctx }) => {
    const rooms = await ctx.prisma.room.findMany({
      where: {
        OR: [
          {
            Owner: {
              id: ctx.session.user.id,
            },
          },
          {
            Participant: {
              some: {
                UserId: ctx.session.user.id,
              },
            },
          },
        ],
      },
    });

    return rooms;
  }),
});
