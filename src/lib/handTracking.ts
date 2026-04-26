import { HandLandmarker, FilesetResolver, type HandLandmarkerResult } from "@mediapipe/tasks-vision";

export type Landmark = { x: number; y: number; z: number };
export type HandLandmarks = Landmark[];

export async function createHandLandmarker(): Promise<HandLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm"
  );
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export type DetectionResult = HandLandmarkerResult;

// One-Euro filter for smooth landmark interpolation
class OneEuro {
  private prev = 0;
  private prevTs = 0;
  private initialized = false;
  constructor(private minCutoff = 1.5, private beta = 0.02) {}
  private alpha(cutoff: number, dt: number) {
    const r = 2 * Math.PI * cutoff * dt;
    return r / (r + 1);
  }
  filter(value: number, ts: number) {
    if (!this.initialized) {
      this.initialized = true;
      this.prev = value;
      this.prevTs = ts;
      return value;
    }
    const dt = Math.max(1e-3, (ts - this.prevTs) / 1000);
    const dValue = (value - this.prev) / dt;
    const cutoff = this.minCutoff + this.beta * Math.abs(dValue);
    const a = this.alpha(cutoff, dt);
    const out = a * value + (1 - a) * this.prev;
    this.prev = out;
    this.prevTs = ts;
    return out;
  }
}

export class LandmarkSmoother {
  private filters: OneEuro[][] = [];
  smooth(landmarks: HandLandmarks, ts: number): HandLandmarks {
    if (this.filters.length !== landmarks.length) {
      this.filters = landmarks.map(() => [new OneEuro(), new OneEuro(), new OneEuro()]);
    }
    return landmarks.map((lm, i) => ({
      x: this.filters[i][0].filter(lm.x, ts),
      y: this.filters[i][1].filter(lm.y, ts),
      z: this.filters[i][2].filter(lm.z, ts),
    }));
  }
  reset() {
    this.filters = [];
  }
}
