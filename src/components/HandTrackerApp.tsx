import { useEffect, useMemo, useRef, useState } from "react";
import { useHandTracker } from "@/hooks/useHandTracker";
import { HandRenderer3D } from "./HandRenderer3D";
import { Button } from "./ui/button";
import { Camera, CameraOff, Eye, EyeOff, Boxes, Activity, Hand } from "lucide-react";
import { detectGesture, HandshakeDetector, type Gesture } from "@/lib/gestures";

const STATUS_LABEL: Record<string, string> = {
  idle: "Camera off",
  loading: "Loading model…",
  ready: "Ready",
  tracking: "Hand detected",
  lost: "Tracking lost",
  error: "Error",
};

const STATUS_COLOR: Record<string, string> = {
  idle: "bg-muted-foreground",
  loading: "bg-primary animate-pulse",
  ready: "bg-primary",
  tracking: "bg-success animate-pulse-glow",
  lost: "bg-destructive",
  error: "bg-destructive",
};

export function HandTrackerApp() {
  const { videoRef, status, landmarks, error, fps, start, stop } = useHandTracker();
  const [showVideo, setShowVideo] = useState(true);
  const [mode, setMode] = useState<"3d" | "skeleton">("3d");
  const [gesture, setGesture] = useState<Gesture>("unknown");
  const [handshake, setHandshake] = useState(false);
  const [shakeCount, setShakeCount] = useState(0);
  const detectorRef = useRef(new HandshakeDetector());
  const handshakeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!landmarks) {
      setGesture("unknown");
      return;
    }
    setGesture(detectGesture(landmarks));
    const wristY = landmarks[0].y;
    const triggered = detectorRef.current.push(wristY, performance.now());
    if (triggered) {
      setHandshake(true);
      setShakeCount((c) => c + 1);
      if (navigator.vibrate) navigator.vibrate([60, 30, 60]);
      if (handshakeTimerRef.current) window.clearTimeout(handshakeTimerRef.current);
      handshakeTimerRef.current = window.setTimeout(() => setHandshake(false), 1400);
    }
  }, [landmarks]);

  const isOn = status !== "idle" && status !== "error";
  const statusText = useMemo(() => STATUS_LABEL[status] ?? status, [status]);
  const statusDot = STATUS_COLOR[status] ?? "bg-muted-foreground";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 glass">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary to-accent glow-primary">
              <Hand className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight gradient-text">
                Hand Mirror
              </h1>
              <p className="text-xs text-muted-foreground">
                Real-time AR hand tracking
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="w-3.5 h-3.5" />
            <span className="tabular-nums">{fps} fps</span>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Status bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 glass rounded-full px-4 py-2">
            <span className={`w-2.5 h-2.5 rounded-full ${statusDot}`} />
            <span className="text-sm font-medium">{statusText}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Gesture
            </span>
            <span className="glass rounded-full px-3 py-1.5 text-sm font-semibold capitalize min-w-[90px] text-center">
              {gesture}
            </span>
            <span className="glass rounded-full px-3 py-1.5 text-sm font-semibold">
              🤝 {shakeCount}
            </span>
          </div>
        </div>

        {/* Stage */}
        <div className="relative flex-1 min-h-[480px] rounded-3xl glass overflow-hidden shadow-[var(--shadow-elegant)]">
          {/* 3D canvas */}
          <HandRenderer3D landmarks={landmarks} handshake={handshake} mode={mode} />

          {/* Video preview (PIP) */}
          <div
            className={`absolute top-4 right-4 w-40 sm:w-56 aspect-video rounded-xl overflow-hidden border border-border/60 shadow-lg transition-opacity ${
              showVideo && isOn ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <video
              ref={videoRef}
              className="w-full h-full object-cover scale-x-[-1] bg-black"
              playsInline
              muted
            />
          </div>

          {/* Always-mounted hidden video when preview off */}
          {!showVideo && (
            <video
              ref={videoRef}
              className="hidden"
              playsInline
              muted
            />
          )}

          {/* Handshake overlay */}
          {handshake && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="px-6 py-3 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold text-lg shadow-2xl animate-shake-pulse">
                🤝 Handshake!
              </div>
            </div>
          )}

          {/* Empty state */}
          {status === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6 pointer-events-none">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20 border border-border/50">
                <Camera className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Start your camera</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Show your hand to the webcam — a 3D mirror will follow every move.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute bottom-4 left-4 right-4 glass rounded-xl p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {!isOn ? (
            <Button
              size="lg"
              onClick={start}
              className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 shadow-[var(--shadow-glow)] font-semibold"
            >
              <Camera className="w-4 h-4 mr-2" />
              Start camera
            </Button>
          ) : (
            <Button size="lg" variant="destructive" onClick={stop}>
              <CameraOff className="w-4 h-4 mr-2" />
              Stop camera
            </Button>
          )}

          <Button
            size="lg"
            variant="secondary"
            onClick={() => setShowVideo((v) => !v)}
            disabled={!isOn}
          >
            {showVideo ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
            {showVideo ? "Hide preview" : "Show preview"}
          </Button>

          <Button
            size="lg"
            variant="secondary"
            onClick={() => setMode((m) => (m === "3d" ? "skeleton" : "3d"))}
          >
            <Boxes className="w-4 h-4 mr-2" />
            {mode === "3d" ? "Skeleton view" : "3D hand view"}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground max-w-2xl mx-auto">
          Tip: shake your hand up and down to trigger a handshake. Gestures detected:
          open hand, fist, point, peace.
        </p>
      </main>
    </div>
  );
}
