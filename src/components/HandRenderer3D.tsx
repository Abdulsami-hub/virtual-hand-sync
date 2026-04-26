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

export function HandRenderer3D({ hands, handshake, mode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    rigs: HandRig[];
    raf?: number;
    hands: TrackedHand[];
    handshake: boolean;
    mode: "3d" | "skeleton";
    shakeT: number;
  }>({ rigs: [], hands: [], handshake: false, mode: "3d", shakeT: 0 });

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

    // Two rigs with distinct palettes (cyan / magenta)
    const rigA = buildHandRig({ joint: 0x6ee7ff, tip: 0x00d4ff, bone: 0x3aa9c4, palm: 0x6ee7ff });
    const rigB = buildHandRig({ joint: 0xff6ed8, tip: 0xff3ec0, bone: 0xc44aa0, palm: 0xff6ed8 });
    scene.add(rigA.group, rigB.group);

    stateRef.current = {
      renderer,
      scene,
      camera,
      rigs: [rigA, rigB],
      hands: [],
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

      for (let h = 0; h < s.rigs.length; h++) {
        const rig = s.rigs[h];
        const tracked = s.hands[h];
        if (!tracked) {
          rig.group.visible = false;
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
      }

      // Group pulse on handshake
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
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
}
