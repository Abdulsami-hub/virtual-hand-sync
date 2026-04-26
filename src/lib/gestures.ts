import type { HandLandmarks } from "./handTracking";

// MediaPipe hand landmark indices
export const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_TIP: 20,
};

// Hand connections (bones) for skeleton view
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],            // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],            // index
  [5, 9], [9, 10], [10, 11], [11, 12],       // middle
  [9, 13], [13, 14], [14, 15], [15, 16],     // ring
  [13, 17], [17, 18], [18, 19], [19, 20],    // pinky
  [0, 17],                                    // palm
];

function dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function isFingerExtended(lm: HandLandmarks, mcp: number, tip: number) {
  const palm = dist(lm[LM.WRIST], lm[mcp]);
  const finger = dist(lm[LM.WRIST], lm[tip]);
  return finger > palm * 1.5;
}

export type Gesture = "open" | "fist" | "point" | "peace" | "wave" | "unknown";

export function detectGesture(lm: HandLandmarks): Gesture {
  if (lm.length < 21) return "unknown";
  const idx = isFingerExtended(lm, LM.INDEX_MCP, LM.INDEX_TIP);
  const mid = isFingerExtended(lm, LM.MIDDLE_MCP, LM.MIDDLE_TIP);
  const ring = isFingerExtended(lm, LM.RING_MCP, LM.RING_TIP);
  const pinky = isFingerExtended(lm, LM.PINKY_MCP, LM.PINKY_TIP);
  const ext = [idx, mid, ring, pinky].filter(Boolean).length;
  if (ext === 4) return "open";
  if (ext === 0) return "fist";
  if (idx && !mid && !ring && !pinky) return "point";
  if (idx && mid && !ring && !pinky) return "peace";
  return "unknown";
}

// Handshake detector: vertical oscillation of wrist within a short window
export class HandshakeDetector {
  private samples: { y: number; t: number }[] = [];
  private lastTrigger = 0;
  push(wristY: number, t: number): boolean {
    this.samples.push({ y: wristY, t });
    // keep last 1.2s
    while (this.samples.length && t - this.samples[0].t > 1200) this.samples.shift();
    if (this.samples.length < 8) return false;

    // count direction changes with significant amplitude
    let changes = 0;
    let lastDir = 0;
    let minY = 1, maxY = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const dy = this.samples[i].y - this.samples[i - 1].y;
      const dir = dy > 0.003 ? 1 : dy < -0.003 ? -1 : 0;
      if (dir !== 0 && dir !== lastDir && lastDir !== 0) changes++;
      if (dir !== 0) lastDir = dir;
      minY = Math.min(minY, this.samples[i].y);
      maxY = Math.max(maxY, this.samples[i].y);
    }
    const amplitude = maxY - minY;
    const isShake = changes >= 4 && amplitude > 0.06;
    if (isShake && t - this.lastTrigger > 800) {
      this.lastTrigger = t;
      return true;
    }
    return false;
  }
  reset() {
    this.samples = [];
    this.lastTrigger = 0;
  }
}
