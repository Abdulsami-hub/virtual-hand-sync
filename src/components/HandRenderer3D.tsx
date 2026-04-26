import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { HandLandmarks } from "@/lib/handTracking";
import { HAND_CONNECTIONS } from "@/lib/gestures";

interface Props {
  landmarks: HandLandmarks | null;
  handshake: boolean;
  mode: "3d" | "skeleton";
}

// Convert MediaPipe normalized coords to Three world coords (mirror X for selfie)
function lmToVec3(lm: { x: number; y: number; z: number }, scale = 4) {
  return new THREE.Vector3(
    -(lm.x - 0.5) * scale,
    -(lm.y - 0.5) * scale * 0.75,
    -lm.z * scale
  );
}

export function HandRenderer3D({ landmarks, handshake, mode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    joints: THREE.Mesh[];
    bones: THREE.Mesh[];
    palm?: THREE.Mesh;
    group?: THREE.Group;
    raf?: number;
    landmarks: HandLandmarks | null;
    handshake: boolean;
    mode: "3d" | "skeleton";
    shakeT: number;
  }>({ joints: [], bones: [], landmarks: null, handshake: false, mode: "3d", shakeT: 0 });

  // keep ref synced with prop changes (no re-init)
  useEffect(() => {
    stateRef.current.landmarks = landmarks;
  }, [landmarks]);
  useEffect(() => {
    stateRef.current.handshake = handshake;
  }, [handshake]);
  useEffect(() => {
    stateRef.current.mode = mode;
    // toggle materials
    const s = stateRef.current;
    s.joints.forEach((m) => (m.visible = true));
    if (s.palm) s.palm.visible = mode === "3d";
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

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0x6ee7ff, 1.2);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff6ed8, 0.8);
    rim.position.set(-3, -2, 2);
    scene.add(rim);

    const group = new THREE.Group();
    scene.add(group);

    // Joints (21 spheres)
    const jointMat = new THREE.MeshPhysicalMaterial({
      color: 0x6ee7ff,
      emissive: 0x1a8aa3,
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.3,
      clearcoat: 0.6,
    });
    const tipMat = new THREE.MeshPhysicalMaterial({
      color: 0xff6ed8,
      emissive: 0x6a2a55,
      emissiveIntensity: 0.5,
      roughness: 0.2,
      metalness: 0.4,
      clearcoat: 0.8,
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

    // Bones (cylinders aligned between connected joints)
    const boneMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      emissive: 0x2a6f80,
      emissiveIntensity: 0.3,
      roughness: 0.4,
      metalness: 0.6,
    });
    const bones: THREE.Mesh[] = HAND_CONNECTIONS.map(() => {
      const geo = new THREE.CylinderGeometry(0.045, 0.045, 1, 16);
      geo.translate(0, 0.5, 0); // pivot at base
      const m = new THREE.Mesh(geo, boneMat);
      group.add(m);
      return m;
    });

    // Palm plane (subtle)
    const palmGeo = new THREE.CircleGeometry(0.5, 32);
    const palmMat = new THREE.MeshBasicMaterial({
      color: 0x6ee7ff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    const palm = new THREE.Mesh(palmGeo, palmMat);
    group.add(palm);

    // Idle hand pose so something shows before tracking
    const idlePose: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({
      x: 0.5 + Math.cos(i * 0.3) * 0.15,
      y: 0.5 + Math.sin(i * 0.3) * 0.15,
      z: 0,
    }));

    stateRef.current = {
      renderer,
      scene,
      camera,
      joints,
      bones,
      palm,
      group,
      landmarks: null,
      handshake: false,
      mode: "3d",
      shakeT: 0,
    };

    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();

    const animate = () => {
      const s = stateRef.current;
      const lm = s.landmarks ?? idlePose;

      // Base pose
      const positions = lm.map((p) => lmToVec3(p));
      // Position joints
      for (let i = 0; i < positions.length; i++) {
        s.joints[i].position.copy(positions[i]);
      }
      // Position bones
      for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
        const [a, b] = HAND_CONNECTIONS[i];
        tmpA.copy(positions[a]);
        tmpB.copy(positions[b]);
        const dir = tmpB.clone().sub(tmpA);
        const len = dir.length();
        const bone = s.bones[i];
        bone.position.copy(tmpA);
        bone.scale.set(1, len, 1);
        q.setFromUnitVectors(up, dir.normalize());
        bone.quaternion.copy(q);
        bone.visible = s.mode === "3d" || s.mode === "skeleton";
      }
      // Palm follows wrist->middle MCP
      if (s.palm) {
        const w = positions[0];
        const m = positions[9];
        s.palm.position.copy(w.clone().add(m).multiplyScalar(0.5));
        s.palm.lookAt(s.camera!.position);
        s.palm.visible = s.mode === "3d";
      }

      // Mode toggling for joints/bones color emphasis
      s.bones.forEach((b) => {
        (b.material as THREE.MeshPhysicalMaterial).emissiveIntensity =
          s.mode === "skeleton" ? 0.9 : 0.3;
      });

      // Handshake feedback
      if (s.handshake) {
        s.shakeT += 0.25;
        const pulse = 1 + Math.sin(s.shakeT * 3) * 0.06;
        s.group!.scale.setScalar(pulse);
        (jointMat as THREE.MeshPhysicalMaterial).emissiveIntensity = 1.2;
        (tipMat as THREE.MeshPhysicalMaterial).emissiveIntensity = 1.4;
      } else {
        s.group!.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
        (jointMat as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.4;
        (tipMat as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.5;
      }

      // Subtle idle rotation when no hand
      if (!s.landmarks) {
        s.group!.rotation.y += 0.005;
      } else {
        s.group!.rotation.y *= 0.92;
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
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
}
