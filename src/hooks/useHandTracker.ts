import { useCallback, useEffect, useRef, useState } from "react";
import {
  createHandLandmarker,
  LandmarkSmoother,
  type HandLandmarks,
} from "@/lib/handTracking";
import type { HandLandmarker } from "@mediapipe/tasks-vision";

export type TrackerStatus = "idle" | "loading" | "ready" | "tracking" | "lost" | "error";
export type Handedness = "Left" | "Right";
export type TrackedHand = { landmarks: HandLandmarks; handedness: Handedness };

export function useHandTracker() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  // one smoother per hand slot (max 2)
  const smoothersRef = useRef<LandmarkSmoother[]>([
    new LandmarkSmoother(),
    new LandmarkSmoother(),
  ]);
  const lostFramesRef = useRef(0);

  const [status, setStatus] = useState<TrackerStatus>("idle");
  const [hands, setHands] = useState<TrackedHand[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const fpsRef = useRef({ frames: 0, last: performance.now() });

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    smoothersRef.current.forEach((s) => s.reset());
    setHands([]);
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);
      setStatus("loading");
      if (!landmarkerRef.current) {
        landmarkerRef.current = await createHandLandmarker();
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await new Promise<void>((res) => {
        video.onloadedmetadata = () => {
          video.play().then(() => res());
        };
      });
      setStatus("ready");

      const loop = () => {
        const v = videoRef.current;
        const lm = landmarkerRef.current;
        if (!v || !lm) return;
        const t = performance.now();
        if (v.currentTime !== lastVideoTimeRef.current && v.readyState >= 2) {
          lastVideoTimeRef.current = v.currentTime;
          const result = lm.detectForVideo(v, t);
          if (result.landmarks && result.landmarks.length > 0) {
            const tracked: TrackedHand[] = result.landmarks
              .slice(0, 2)
              .map((points, i) => ({
                landmarks: smoothersRef.current[i].smooth(points, t),
                handedness:
                  (result.handednesses?.[i]?.[0]?.categoryName as Handedness) ?? "Right",
              }));
            // reset unused smoother
            if (tracked.length < 2) smoothersRef.current[1].reset();
            setHands(tracked);
            lostFramesRef.current = 0;
            setStatus("tracking");
          } else {
            lostFramesRef.current++;
            if (lostFramesRef.current > 10) {
              setHands([]);
              setStatus("lost");
              smoothersRef.current.forEach((s) => s.reset());
            }
          }
          fpsRef.current.frames++;
          if (t - fpsRef.current.last >= 1000) {
            setFps(fpsRef.current.frames);
            fpsRef.current.frames = 0;
            fpsRef.current.last = t;
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to start camera");
      setStatus("error");
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, status, hands, error, fps, start, stop };
}
