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
  const { videoRef, status, hands, error, fps, start, stop } = useHandTracker();
  const [showVideo, setShowVideo] = useState(true);
  const [mode, setMode] = useState<"3d" | "skeleton">("3d");
  const [gestures, setGestures] = useState<Gesture[]>([]);
  const [handshake, setHandshake] = useState(false);
  const [shakeCount, setShakeCount] = useState(0);
  const detectorRef = useRef(new HandshakeDetector());
  const handshakeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (hands.length === 0) {
      setGestures([]);
      return;
    }
    setGestures(hands.map((h) => detectGesture(h.landmarks)));
    // Use first hand's wrist for handshake detection
    const wristY = hands[0].landmarks[0].y;
    const triggered = detectorRef.current.push(wristY, performance.now());
    if (triggered) {
      setHandshake(true);
      setShakeCount((c) => c + 1);
      if (navigator.vibrate) navigator.vibrate([60, 30, 60]);
      if (handshakeTimerRef.current) window.clearTimeout(handshakeTimerRef.current);
      handshakeTimerRef.current = window.setTimeout(() => setHandshake(false), 1400);
    }
  }, [hands]);

  const isOn = status !== "idle" && status !== "error";
  const statusText = useMemo(() => STATUS_LABEL[status] ?? status, [status]);
  const statusDot = STATUS_COLOR[status] ?? "bg-muted-foreground";

  return (
    <div className="min-h-screen relative">
      {/* Fullscreen camera background */}
      <video
        ref={videoRef}
        className={`fixed inset-0 w-full h-full object-cover scale-x-[-1] -z-10 transition-opacity duration-500 ${
          showVideo && isOn ? "opacity-100" : "opacity-0"
        }`}
        playsInline
        muted
      />
      {/* Dark overlay for readability */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-background/70 via-background/40 to-background/80" />

      {/* 3D hands overlay — fullscreen, on top of camera */}
      <div className="fixed inset-0 pointer-events-none">
        <HandRenderer3D hands={hands} handshake={handshake} mode={mode} />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="border-b border-border/30 glass">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
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

        <main className="flex-1 container mx-auto px-4 py-4 flex flex-col gap-4">
          {/* Status bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 glass rounded-full px-4 py-2">
              <span className={`w-2.5 h-2.5 rounded-full ${statusDot}`} />
              <span className="text-sm font-medium">{statusText}</span>
              {hands.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  · {hands.length} hand{hands.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {gestures.map((g, i) => (
                <span
                  key={i}
                  className="glass rounded-full px-3 py-1.5 text-xs font-semibold capitalize"
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full mr-2 ${
                      i === 0 ? "bg-primary" : "bg-accent"
                    }`}
                  />
                  {hands[i]?.handedness ?? "Hand"}: {g}
                </span>
              ))}
              <span className="glass rounded-full px-3 py-1.5 text-sm font-semibold">
                🤝 {shakeCount}
              </span>
            </div>
          </div>

          {/* Spacer to let the 3D hands shine through */}
          <div className="flex-1" />

          {/* Empty state when idle */}
          {status === "idle" && (
            <div className="flex flex-col items-center justify-center gap-4 text-center py-12 glass rounded-3xl pointer-events-auto">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20 border border-border/50">
                <Camera className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Start your camera</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Show both hands to the webcam — two 3D mirrors will follow every move.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="glass rounded-xl p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Handshake overlay */}
          {handshake && (
            <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-20">
              <div className="px-6 py-3 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold text-lg shadow-2xl animate-shake-pulse">
                🤝 Handshake!
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-center gap-3 pb-4">
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
              {showVideo ? "Hide camera" : "Show camera"}
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
        </main>
      </div>
    </div>
  );
}
