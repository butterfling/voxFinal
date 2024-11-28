import { DebugMode } from "@/lib/Debug";
import { api } from "@/utils/api";
import speakOut from "@/utils/speakOut";
import {
  LiveKitRoom,
  LocalUserChoices,
  VideoConference,
  formatChatMessageLinks,
} from "@livekit/components-react";
import { setCORS } from "google-translate-api-browser";
import { generateMeetingSummary, uploadToS3 } from "@/utils/meetingSummary";

const translate = setCORS("https://cors-proxy.fringe.zone/");

import {
  LogLevel,
  Room,
  RoomEvent,
  RoomOptions,
  VideoPresets,
} from "livekit-client";
import { useRouter } from "next/router";
import Pusher from "pusher-js";
import { useEffect, useMemo, useRef, useState } from "react";
import Loader from "../loader";
import FullScreenLoader from "../fullScreenLoader";
type ActiveRoomProps = {
  userChoices: LocalUserChoices;
  roomName: string;
  region?: string;
  onLeave?: () => void;
  userId: string;
  selectedLanguage: string;
};

const ActiveRoom = ({
  roomName,
  userChoices,
  onLeave,
  userId,
  selectedLanguage,
}: ActiveRoomProps) => {
  const { data, error, isLoading } = api.rooms.joinRoom.useQuery({ roomName });
  const sendEmailsMutation = api.summary.sendSummaryEmails.useMutation();

  const router = useRouter();

  const { region, hq } = router.query;

  const roomOptions = useMemo((): RoomOptions => {
    return {
      videoCaptureDefaults: {
        deviceId: userChoices.videoDeviceId ?? undefined,
        resolution: hq === "true" ? VideoPresets.h1080 : VideoPresets.h720,
        facingMode: 'user',
      },
      publishDefaults: {
        videoSimulcastLayers:
          hq === "true"
            ? [VideoPresets.h720, VideoPresets.h540]
            : [VideoPresets.h540, VideoPresets.h360],
        videoCodec: 'vp8',
        dtx: true,
        red: true,
        forceStereo: false,
      },
      audioCaptureDefaults: {
        deviceId: userChoices.audioDeviceId ?? undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      adaptiveStream: {
        pixelDensity: "screen",
        pauseVideoInBackground: true,
      },
      dynacast: true,
      disconnectOnPageLeave: true,
    };
  }, [userChoices, hq]);

  const [transcription, setTranscription] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const [transcriptionQueue, setTranscriptionQueue] = useState<
    {
      sender: string;
      message: string;
      senderId: string;
      isFinal: boolean;
    }[]
  >([]);

  const [caption, setCaption] = useState({
    sender: "",
    message: "",
  });

  const pusherMutation = api.pusher.sendTranscript.useMutation();
  const [myTranscripts, setMyTranscripts] = useState<string[]>([]);
  const [allTranscripts, setAllTranscripts] = useState<string[]>([]);
  const [summaryUrl, setSummaryUrl] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    console.log("Running transcription");
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (!MediaRecorder.isTypeSupported("audio/webm"))
        return alert("Browser not supported");
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      const webSocketUrl =
        selectedLanguage == "en-US"
          ? "wss://api.deepgram.com/v1/listen?model=nova"
          : `wss://api.deepgram.com/v1/listen?language=${selectedLanguage}`;

      const socket = new WebSocket(webSocketUrl, [
        "token",
        process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY!,
      ]);

      socket.onopen = () => {
        console.log({ event: "onopen" });
        mediaRecorder.addEventListener("dataavailable", async (event) => {
          if (event.data.size > 0 && socket.readyState === 1) {
            socket.send(event.data);
          }
        });
        mediaRecorder.start(1000);
      };

      socket.onmessage = async (message) => {
        const received = message && JSON.parse(message?.data);
        const transcript = received.channel?.alternatives[0].transcript;

        if (transcript !== "" && transcript !== undefined) {
          if (myTranscripts.includes(transcript)) return;
          await pusherMutation.mutate({
            message: transcript,
            roomName: roomName,
            isFinal: true,
          });
          setMyTranscripts((prev) => [...prev, transcript]);
          setAllTranscripts((prev) => [...prev, transcript]);
          if (
            !(
              transcript.toLowerCase() === "is" ||
              transcription.toLowerCase() === "so"
            )
          ) {
            setTranscription(transcript);
            setCaption({
              sender: "You",
              message: transcript,
            });
          }
        }
      };

      socket.onclose = () => {
        console.log({ event: "onclose" });
      };

      socket.onerror = (error) => {
        console.log({ event: "onerror", error });
      };

      socketRef.current = socket;
    });
  }, [selectedLanguage]);

  useEffect(() => {
    async function translateText() {
      console.info("transcriptionQueue", transcriptionQueue);
      if (transcriptionQueue.length > 0) {
        const res = await translate(transcriptionQueue[0]?.message as string, {
          // @ts-ignore
          to: selectedLanguage.split("-")[0],
        });
        setCaption({
          message: res.text,
          sender: transcriptionQueue[0]?.sender as string,
        });
        const isEmpty = transcriptionQueue.length === 0;
        speakOut(res.text as string, isEmpty);
        setTranscriptionQueue((prev) => prev.slice(1));
      }
    }
    translateText();

    // Hide the caption after 5 seconds
    const timer = setTimeout(() => {
      setCaption({
        message: "",
        sender: "",
      });
    }, 5000);

    return () => {
      clearTimeout(timer);
    };
  }, [transcriptionQueue]);

  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY as string, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER as string,
    });
    const channel = pusher.subscribe(roomName);
    channel.bind(
      "transcribe-event",
      function (data: {
        sender: string;
        message: string;
        senderId: string;
        isFinal: boolean;
      }) {
        if (data.isFinal) {
          if (data.message.includes("Meeting summary is ready! Access it here:")) {
            const url = data.message.split("here: ")[1];
            setSummaryUrl(url ?? null);  
            setShowSummary(true);
          } else if (userId !== data.senderId) {
            setTranscriptionQueue((prev) => {
              return [...prev, data];
            });
          }
        }
      }
    );

    return () => {
      pusher.unsubscribe(roomName);
    };
  }, []);

  const handleDisconnect = async () => {
    try {
      // Generate summary
      const summary = await generateMeetingSummary(allTranscripts);
      
      // Upload to S3
      const s3Url = await uploadToS3(summary, roomName);
      setSummaryUrl(s3Url);
      setShowSummary(true);
      
      // Send notification with the S3 URL
      await pusherMutation.mutate({
        message: `Meeting summary is ready! Access it here: ${s3Url}`,
        roomName: roomName,
        isFinal: true,
      });

      // Send emails to participants
      await sendEmailsMutation.mutateAsync({
        roomName: roomName,
        summaryUrl: s3Url,
      });
      
      // Call original onLeave if it exists
      onLeave?.();
    } catch (error) {
      console.error('Error handling meeting end:', error);
      onLeave?.();
    }
  };

  if (isLoading) return <FullScreenLoader />;
  if (error) router.push("/");

  return (
    <>
      {error && (
        <div className="flex h-full w-full items-center justify-center bg-red-500 text-white">
          {error.message}
        </div>
      )}
      {showSummary && summaryUrl && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-green-500 p-4 text-white shadow-lg">
          <p className="mb-2">Meeting summary is ready!</p>
          <a 
            href={summaryUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-block rounded bg-white px-4 py-2 text-green-500 hover:bg-green-50"
          >
            View Summary
          </a>
          <button 
            onClick={() => setShowSummary(false)} 
            className="ml-2 text-white hover:text-green-100"
          >
            ✕
          </button>
        </div>
      )}
      {!error && data && (
        <LiveKitRoom
          token={data.accessToken}
          serverUrl={`wss://${process.env.NEXT_PUBLIC_LIVEKIT_API_HOST}`}
          options={roomOptions}
          video={userChoices.videoEnabled}
          audio={userChoices.audioEnabled}
          onDisconnected={handleDisconnect}
          onError={(err) => {
            console.error('LiveKit room error:', err);
            // Optionally show error to user or handle reconnection
          }}
          connect={true}
        >
          <div className="relative h-full w-full">
            {showSummary && summaryUrl && (
              <div className="absolute top-4 right-4 z-50 bg-white bg-opacity-90 p-4 rounded-lg shadow-lg">
                <p className="text-black mb-2">Meeting summary is ready!</p>
                <a href={summaryUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                  View Summary
                </a>
                <button 
                  onClick={() => setShowSummary(false)}
                  className="ml-4 text-gray-600 hover:text-gray-800"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="closed-captions-wrapper z-50">
              <div className="closed-captions-container">
                {caption?.message ? (
                  <>
                    <div className="closed-captions-username">
                      {caption.sender}
                    </div>
                    <span>:&nbsp;</span>
                  </>
                ) : null}
                <div className="closed-captions-text">{caption.message}</div>
              </div>
            </div>
            <VideoConference chatMessageFormatter={formatChatMessageLinks} />
            <DebugMode logLevel={LogLevel.info} />
          </div>
        </LiveKitRoom>
      )}
    </>
  );
};

export default ActiveRoom;
