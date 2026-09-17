# Real Hand Sync

Build a professional web-based application that uses the device camera to detect and track a user’s hand in real time and render a synchronized animated hand inside the browser.

Core Requirements:

Hand Tracking:

Use MediaPipe Hands (or equivalent real-time hand tracking library)

Detect one hand with full 21 landmark points

Track movement smoothly with high accuracy and low latency

Camera Integration:

Access webcam using browser APIs (getUserMedia)

Display optional video preview or allow it to be hidden

Hand Animation (Main Feature):

Create a 3D hand model rendered using Three.js

Map MediaPipe hand landmark points to the 3D hand rig (bones/joints)

The 3D hand must move in real time exactly as the user moves their hand

Ensure smooth interpolation (no jitter)

Handshake Interaction:

Detect a “handshake motion” (vertical repetitive movement)

When detected:

Trigger a handshake animation (enhanced motion or visual feedback)

Optionally add vibration effect (if supported) or visual glow

UI/UX:

Clean, modern interface

Centered hand animation canvas

Start/Stop camera button

Status indicator (e.g., “Hand Detected”, “Tracking Lost”)

Responsive design (desktop + mobile)

Performance:

Optimize for real-time performance (minimum lag)

Use requestAnimationFrame for rendering loop

Efficient landmark-to-bone mapping

Tech Stack:

Frontend: React (preferred)

3D Rendering: Three.js

Hand Tracking: MediaPipe Hands

Optional: TensorFlow.js for gesture improvements

Code Quality:

Modular and well-structured components

Separate logic for tracking, rendering, and gesture detection

Clean and readable code with comments

Bonus Features (if possible):

Toggle between 2D skeleton view and 3D hand

Gesture recognition (open hand, fist, wave)

Multi-user handshake via WebSocket (optional advanced feature)

Deliverables:

Fully working web app

Clear folder structure

Instructions to run locally

No mockups—real functional implementation

Goal:
The final result should feel like a professional real-time AR-style hand tracking system where the virtual hand mirrors the user’s hand and reacts to handshake motion.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://virtual-hand-sync.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ea38d852-1876-42ba-ab86-f99179a842eb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
