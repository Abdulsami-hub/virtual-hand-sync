import { createFileRoute } from "@tanstack/react-router";
import { HandTrackerApp } from "@/components/HandTrackerApp";

export const Route = createFileRoute("/")({
  component: HandTrackerApp,
  head: () => ({
    meta: [
      { title: "Hand Mirror — Real-time 3D Hand Tracking" },
      {
        name: "description",
        content:
          "Real-time AR hand tracking in your browser. A 3D hand mirrors your movements and reacts to handshakes — powered by MediaPipe and Three.js.",
      },
      { property: "og:title", content: "Hand Mirror — Real-time 3D Hand Tracking" },
      {
        property: "og:description",
        content:
          "A 3D virtual hand follows your movements through your webcam. Try the handshake gesture!",
      },
    ],
  }),
});
