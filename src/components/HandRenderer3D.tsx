import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { TrackedHand } from "@/hooks/useHandTracker";
import { HAND_CONNECTIONS } from "@/lib/gestures";

interface Props {
  hands: TrackedHand[];
  handshake: boolean;
  mode: "3d" | "skeleton";
}

function lmToVec3(lm: { x: number; y: number; z: number }, scale = 4) {
  return new THREE.Vector3(
    -(lm.x - 0.5) * scale,
    -(lm.y - 0.5) * scale * 0.75,
    -lm.z * scale
  );
}

type HandRig = {
  group: THREE.Group;
  joints: THREE.Mesh[];
  bones: THREE.Mesh[];
  palm: THREE.Mesh;
  jointMat: THREE.MeshPhysicalMaterial;
  tipMat: THREE.MeshPhysicalMaterial;
};

function buildHandRig(palette: { joint: number; tip: number; bone: number; palm: number }): HandRig {
  const group = new THREE.Group();
  const jointMat = new THREE.MeshPhysicalMaterial({
    color: palette.joint,
    emissive: palette.joint,
    emissiveIntensity: 0.4,
    roughness: 0.25,
    metalness: 0.3,
    clearcoat: 0.6,
  });
  const tipMat = new THREE.MeshPhysicalMaterial({
    color: palette.tip,
    emissive: palette.tip,
    emissiveIntensity: 0.5,
    roughness: 0.2,
    metalness: 0.4,
    clearcoat: 0.8,
  });
  const boneMat = new THREE.MeshPhysicalMaterial({
    color: palette.bone,
    emissive: palette.bone,
    emissiveIntensity: 0.25,
    roughness: 0.4,
    metalness: 0.6,
  });
  const tipIndices = new Set([4, 8, 12, 16, 20]);
  const joints: THREE.Mesh[] = [];
  for (let i = 0; i < 21; i++) {
    const isTip = tipIndices.has(i);
    const isWrist = i === 0;
    const r = isWrist ? 0.16 : isTip ? 0.11 : 0.085;
    const geo = new THREE.SphereGeometry(r, 24, 24);
    const m = new THREE.Mesh(geo, isTip ? tipMat : jointMat);
    group.add(m);
    joints.push(m);
  }
  const bones: THREE.Mesh[] = HAND_CONNECTIONS.map(() => {
    const geo = new THREE.CylinderGeometry(0.045, 0.045, 1, 16);
    geo.translate(0, 0.5, 0);
    const m = new THREE.Mesh(geo, boneMat);
    group.add(m);
    return m;
  });
  const palmGeo = new THREE.CircleGeometry(0.5, 32);
  const palmMat = new THREE.MeshBasicMaterial({
    color: palette.palm,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
  });
  const palm = new THREE.Mesh(palmGeo, palmMat);
  group.add(palm);
  group.visible = false;
  return { group, joints, bones, palm, jointMat, tipMat };
}

// =====================================================================
// Particle system: fire / spark / star particles emitted from fingertips
// =====================================================================
const MAX_PARTICLES = 1200;
const TIP_INDICES = [4, 8, 12, 16, 20];

function createSparkTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0.0, "rgba(255,255,255,1)");
  grd.addColorStop(0.2, "rgba(255,230,150,0.9)");
  grd.addColorStop(0.5, "rgba(255,120,60,0.5)");
  grd.addColorStop(1.0, "rgba(255,40,0,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);
  // star cross
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(size / 2, 10); ctx.lineTo(size / 2, size - 10);
  ctx.moveTo(10, size / 2); ctx.lineTo(size - 10, size / 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type ParticleSystem = {
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  cursor: number;
  count: number;
};

function createParticleSystem(texture: THREE.Texture): ParticleSystem {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const velocities = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);
  const life = new Float32Array(MAX_PARTICLES);
  const maxLife = new Float32Array(MAX_PARTICLES);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: texture },
    },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float size;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      varying vec3 vColor;
      void main() {
        vec4 t = texture2D(uTex, gl_PointCoord);
        if (t.a < 0.02) discard;
        gl_FragColor = vec4(vColor * t.rgb, t.a);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, positions, velocities, colors, sizes, life, maxLife, cursor: 0, count: 0 };
}

function emitParticle(
  ps: ParticleSystem,
  origin: THREE.Vector3,
  vel: THREE.Vector3,
  baseColor: THREE.Color,
  intensity: number
) {
  const i = ps.cursor;
  ps.cursor = (ps.cursor + 1) % MAX_PARTICLES;
  ps.count = Math.min(ps.count + 1, MAX_PARTICLES);

  ps.positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.06;
  ps.positions[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.06;
  ps.positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.06;

  const spread = 0.6 + intensity * 1.2;
  ps.velocities[i * 3] = vel.x * 0.4 + (Math.random() - 0.5) * spread;
  ps.velocities[i * 3 + 1] = vel.y * 0.4 + 0.6 + Math.random() * 1.2; // upward fire
  ps.velocities[i * 3 + 2] = vel.z * 0.4 + (Math.random() - 0.5) * spread;

  // Fire-like color: shift from white-yellow → baseColor → deep red
  const hot = new THREE.Color(0xffffff).lerp(baseColor, 0.3 + Math.random() * 0.3);
  ps.colors[i * 3] = hot.r;
  ps.colors[i * 3 + 1] = hot.g;
  ps.colors[i * 3 + 2] = hot.b;

  ps.sizes[i] = 0.18 + Math.random() * 0.25 + intensity * 0.15;
  const life = 0.6 + Math.random() * 0.8;
  ps.life[i] = life;
  ps.maxLife[i] = life;
}

function updateParticles(ps: ParticleSystem, dt: number) {
  const drag = Math.pow(0.92, dt * 60);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (ps.life[i] <= 0) {
      ps.sizes[i] = 0;
      continue;
    }
    ps.life[i] -= dt;
    const t = Math.max(ps.life[i] / ps.maxLife[i], 0);
    // physics
    ps.velocities[i * 3] *= drag;
    ps.velocities[i * 3 + 1] = ps.velocities[i * 3 + 1] * drag + 0.8 * dt; // buoyancy
    ps.velocities[i * 3 + 2] *= drag;
    ps.positions[i * 3] += ps.velocities[i * 3] * dt;
    ps.positions[i * 3 + 1] += ps.velocities[i * 3 + 1] * dt;
    ps.positions[i * 3 + 2] += ps.velocities[i * 3 + 2] * dt;

    // color cools down: yellow → red → dark
    const r = Math.min(1, 0.2 + t * 1.6);
    const g = Math.max(0, t * t * 1.2);
    const b = Math.max(0, (t - 0.7) * 2.0);
    // blend with stored base color tint
    ps.colors[i * 3] = (ps.colors[i * 3] * 0.5 + r * 0.5);
    ps.colors[i * 3 + 1] = (ps.colors[i * 3 + 1] * 0.5 + g * 0.5);
    ps.colors[i * 3 + 2] = (ps.colors[i * 3 + 2] * 0.5 + b * 0.5);

    ps.sizes[i] *= 0.985;
  }
  const geo = ps.points.geometry;
  (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  (geo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
}

export function HandRenderer3D({ hands, handshake, mode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    rigs: HandRig[];
    particles?: ParticleSystem;
    prevTipPositions: (THREE.Vector3 | null)[][];
    raf?: number;
    hands: TrackedHand[];
    handshake: boolean;
    mode: "3d" | "skeleton";
    shakeT: number;
    lastTime: number;
  }>({
    rigs: [],
    prevTipPositions: [[], []],
    hands: [],
    handshake: false,
    mode: "3d",
    shakeT: 0,
    lastTime: performance.now(),
  });

  useEffect(() => {
    stateRef.current.hands = hands;
  }, [hands]);
  useEffect(() => {
    stateRef.current.handshake = handshake;
  }, [handshake]);
  useEffect(() => {
    stateRef.current.mode = mode;
  }, [mode]);

  useEffect(() => {
    const container = containerRef.current!;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0x6ee7ff, 1.2);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff6ed8, 0.8);
    rim.position.set(-3, -2, 2);
    scene.add(rim);

    const rigA = buildHandRig({ joint: 0x6ee7ff, tip: 0x00d4ff, bone: 0x3aa9c4, palm: 0x6ee7ff });
    const rigB = buildHandRig({ joint: 0xff6ed8, tip: 0xff3ec0, bone: 0xc44aa0, palm: 0xff6ed8 });
    scene.add(rigA.group, rigB.group);

    const sparkTex = createSparkTexture();
    const particles = createParticleSystem(sparkTex);
    scene.add(particles.points);

    stateRef.current = {
      renderer,
      scene,
      camera,
      rigs: [rigA, rigB],
      particles,
      prevTipPositions: [
        TIP_INDICES.map(() => null),
        TIP_INDICES.map(() => null),
      ],
      hands: [],
      handshake: false,
      mode: "3d",
      shakeT: 0,
      lastTime: performance.now(),
    };

    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();

    const handBaseColors = [new THREE.Color(0x00d4ff), new THREE.Color(0xff3ec0)];

    const animate = () => {
      const s = stateRef.current;
      const now = performance.now();
      const dt = Math.min((now - s.lastTime) / 1000, 0.05);
      s.lastTime = now;

      for (let h = 0; h < s.rigs.length; h++) {
        const rig = s.rigs[h];
        const tracked = s.hands[h];
        if (!tracked) {
          rig.group.visible = false;
          // clear prev positions so re-appearance doesn't burst
          for (let t = 0; t < TIP_INDICES.length; t++) s.prevTipPositions[h][t] = null;
          continue;
        }
        rig.group.visible = true;

        const positions = tracked.landmarks.map((p) => lmToVec3(p));
        for (let i = 0; i < positions.length; i++) {
          rig.joints[i].position.copy(positions[i]);
        }
        for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
          const [a, b] = HAND_CONNECTIONS[i];
          tmpA.copy(positions[a]);
          tmpB.copy(positions[b]);
          const dir = tmpB.clone().sub(tmpA);
          const len = dir.length();
          const bone = rig.bones[i];
          bone.position.copy(tmpA);
          bone.scale.set(1, len, 1);
          q.setFromUnitVectors(up, dir.normalize());
          bone.quaternion.copy(q);
        }
        const w = positions[0];
        const m = positions[9];
        rig.palm.position.copy(w.clone().add(m).multiplyScalar(0.5));
        rig.palm.lookAt(s.camera!.position);
        rig.palm.visible = s.mode === "3d";

        rig.bones.forEach((b) => {
          (b.material as THREE.MeshPhysicalMaterial).emissiveIntensity =
            s.mode === "skeleton" ? 0.9 : 0.3;
        });

        if (s.handshake) {
          rig.jointMat.emissiveIntensity = 1.2;
          rig.tipMat.emissiveIntensity = 1.4;
        } else {
          rig.jointMat.emissiveIntensity = 0.45;
          rig.tipMat.emissiveIntensity = 0.55;
        }

        // === Emit fire/spark particles from fingertips ===
        const baseColor = handBaseColors[h];
        for (let ti = 0; ti < TIP_INDICES.length; ti++) {
          const tipIdx = TIP_INDICES[ti];
          const cur = positions[tipIdx];
          const prev = s.prevTipPositions[h][ti];
          let speed = 0;
          const vel = new THREE.Vector3();
          if (prev) {
            vel.subVectors(cur, prev).divideScalar(Math.max(dt, 0.001));
            speed = vel.length();
          }
          // Always emit a small ember; emit more with motion
          const intensity = Math.min(speed / 6, 1.5);
          const baseEmit = 1; // ambient flame
          const motionEmit = Math.floor(intensity * 8);
          const total = baseEmit + motionEmit + (s.handshake ? 4 : 0);
          for (let k = 0; k < total; k++) {
            emitParticle(s.particles!, cur, vel, baseColor, intensity);
          }
          s.prevTipPositions[h][ti] = cur.clone();
        }

        // Palm emits a soft glow burst on handshake
        if (s.handshake) {
          const palmPos = rig.palm.position;
          for (let k = 0; k < 6; k++) {
            emitParticle(s.particles!, palmPos, new THREE.Vector3(), baseColor, 1.2);
          }
        }
      }

      // Update particles
      if (s.particles) updateParticles(s.particles, dt);

      if (s.handshake) {
        s.shakeT += 0.25;
        const pulse = 1 + Math.sin(s.shakeT * 3) * 0.05;
        s.rigs.forEach((r) => r.group.scale.setScalar(pulse));
      } else {
        s.rigs.forEach((r) => r.group.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15));
      }

      s.renderer!.render(s.scene!, s.camera!);
      s.raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (stateRef.current.raf) cancelAnimationFrame(stateRef.current.raf);
      sparkTex.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
}
