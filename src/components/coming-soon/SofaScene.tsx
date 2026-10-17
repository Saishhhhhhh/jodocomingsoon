'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { soundEngine } from '@/audio/woodSound';
import { getWoodMaterial, getBrassMaterial } from '@/textures/woodTexture';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface ComponentPart {
  mesh: THREE.Object3D;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startRot: THREE.Euler;
  endRot: THREE.Euler;
  startProgress: number;
  endProgress: number;
  noiseOffset: number;
  name: string;
}

export const SofaScene: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isFullyAssembled, setIsFullyAssembled] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const soundTriggersRef = useRef<{ [key: string]: boolean }>({
    chassis: false,
    legs: false,
    deck: false,
    arms: false,
    backrest: false,
    cushions: false,
    pillows: false,
    complete: false,
  });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const partsRef = useRef<ComponentPart[]>([]);
  const sofaGroupRef = useRef<THREE.Group | null>(null);
  const shadowPlaneRef = useRef<THREE.Mesh | null>(null);

  // Initial 3/4 beauty angle
  const BASE_ROT_Y = -0.22;
  const BASE_ROT_X = 0.06;

  // Turntable 360° drag state (held in refs to avoid stale closure issues)
  const rotYRef = useRef<number>(BASE_ROT_Y);
  const rotXRef = useRef<number>(BASE_ROT_X);
  const velYRef = useRef<number>(0);
  const velXRef = useRef<number>(0);
  const isPointerDownRef = useRef<boolean>(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;

    partsRef.current = [];

    // 1. Scene Setup with 100% Seamless Color Matching
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color('#F4EBDD');

    // Responsive Camera Setup
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 50);

    const updateCameraDistance = () => {
      const currentAspect = canvas.clientWidth / canvas.clientHeight;
      camera.aspect = currentAspect;
      if (currentAspect < 1) {
        // Mobile portrait: comfortable framing
        camera.position.set(0, 0.28, 4.4 / currentAspect);
        camera.lookAt(0, -0.06, 0);
      } else {
        // Desktop landscape: elegant centered studio framing
        camera.position.set(0, 0.28, 5.2);
        camera.lookAt(0, -0.06, 0);
      }
      camera.updateProjectionMatrix();
    };

    updateCameraDistance();
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(new THREE.Color('#F4EBDD'), 1);
    rendererRef.current = renderer;

    // 2. Warm Architectural Studio Lighting
    const ambientLight = new THREE.AmbientLight('#FAF2E6', 1.35);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight('#FFF6EC', 2.8);
    keyLight.position.set(-4.0, 5.5, 4.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#E0EDF8', 1.15);
    fillLight.position.set(4.5, 2.5, -1.8);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight('#FFE8D6', 1.4);
    rimLight.position.set(0, 4.0, -4.5);
    scene.add(rimLight);

    // 3. Ground Studio Floor Contact Shadow (Radial gradient with 0-alpha border)
    const floorGeo = new THREE.PlaneGeometry(10, 10);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 512;
    shadowCanvas.height = 512;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(256, 256, 10, 256, 256, 210);
      grad.addColorStop(0, 'rgba(50, 32, 22, 0.42)');
      grad.addColorStop(0.30, 'rgba(50, 32, 22, 0.22)');
      grad.addColorStop(0.65, 'rgba(50, 32, 22, 0.05)');
      grad.addColorStop(1, 'rgba(50, 32, 22, 0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 512, 512);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.70,
      depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(floorGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.54;
    shadowPlane.scale.set(1.4, 0.85, 1);
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
    shadowPlaneRef.current = shadowPlane;

    // 4. Main Sofa Root Group
    const sofaGroup = new THREE.Group();
    scene.add(sofaGroup);
    sofaGroupRef.current = sofaGroup;

    sofaGroup.position.set(0, -0.06, 0);
    sofaGroup.rotation.y = rotYRef.current;
    sofaGroup.rotation.x = rotXRef.current;

    // 5. Materials
    const brassMat = getBrassMaterial();
    const darkWoodMat = getWoodMaterial('teak');

    // Signature JODO Terracotta woven velvet upholstery texture
    const fabricCanvas = document.createElement('canvas');
    fabricCanvas.width = 512;
    fabricCanvas.height = 512;
    const fCtx = fabricCanvas.getContext('2d');
    if (fCtx) {
      fCtx.fillStyle = '#C65F45'; // Signature JODO Terracotta
      fCtx.fillRect(0, 0, 512, 512);

      const idata = fCtx.getImageData(0, 0, 512, 512);
      const data = idata.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 16;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise * 0.9));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise * 0.8));
      }
      fCtx.putImageData(idata, 0, 0);

      // Fine bouclé weave micro-threads
      fCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      fCtx.lineWidth = 1;
      for (let x = 0; x < 512; x += 4) {
        fCtx.beginPath();
        fCtx.moveTo(x, 0);
        fCtx.lineTo(x, 512);
        fCtx.stroke();
      }
      for (let y = 0; y < 512; y += 4) {
        fCtx.beginPath();
        fCtx.moveTo(0, y);
        fCtx.lineTo(512, y);
        fCtx.stroke();
      }
    }
    const fabricTex = new THREE.CanvasTexture(fabricCanvas);
    fabricTex.wrapS = THREE.RepeatWrapping;
    fabricTex.wrapT = THREE.RepeatWrapping;
    fabricTex.repeat.set(4, 4);

    // High-end Terracotta Velvet with Rich Sheen & Softness
    const velvetMat = new THREE.MeshPhysicalMaterial({
      map: fabricTex,
      color: new THREE.Color('#C65F45'),
      roughness: 0.60,
      metalness: 0.03,
      sheen: 0.95,
      sheenColor: new THREE.Color('#E5836B'),
      sheenRoughness: 0.38,
    });

    // Helper: Sculpted Organic Cloud Cushion with smooth welded vertices
    const createCloudCushion = (
      w: number,
      h: number,
      d: number,
      loft = 0.045,
      segX = 32,
      segY = 18,
      segZ = 32
    ) => {
      let geo: THREE.BufferGeometry = new THREE.BoxGeometry(w, h, d, segX, segY, segZ);
      geo = mergeVertices(geo, 0.001); // Weld vertices for 100% silky smooth normals!
      const pos = geo.attributes.position;
      const hw = w / 2;
      const hh = h / 2;
      const hd = d / 2;

      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);

        const nx = Math.max(-1, Math.min(1, x / hw));
        const ny = Math.max(-1, Math.min(1, y / hh));
        const nz = Math.max(-1, Math.min(1, z / hd));

        // Soft organic crown on top (+y)
        if (ny > 0) {
          const topFactor = ny;
          pos.setY(i, y + loft * topFactor * (1 - nx * nx * 0.8) * (1 - nz * nz * 0.8));
        }

        // Waterfall forward roll on front edge (+z)
        if (nz > 0.3) {
          const frontFactor = (nz - 0.3) / 0.7;
          pos.setZ(i, z + loft * 0.5 * frontFactor * (1 - nx * nx * 0.6));
          if (ny > 0) {
            pos.setY(i, y - loft * 0.22 * frontFactor * (1 - nx * nx * 0.6));
          }
        }

        // Soft bulge on outer side faces
        if (Math.abs(nx) > 0.5) {
          const sideFactor = (Math.abs(nx) - 0.5) / 0.5;
          const sign = Math.sign(nx);
          pos.setX(i, x + sign * (loft * 0.25) * sideFactor * (1 - ny * ny) * (1 - nz * nz));
        }
      }

      geo.computeVertexNormals();
      return geo;
    };

    // Helper: Rounded Box with smooth beveled corners
    const createRoundedBox = (w: number, h: number, d: number, r = 0.04, s = 8) => {
      const shape = new THREE.Shape();
      const hw = w / 2 - r;
      const hh = h / 2 - r;

      shape.moveTo(-hw, -hh - r);
      shape.lineTo(hw, -hh - r);
      shape.absarc(hw, -hh, r, -Math.PI / 2, 0, false);
      shape.lineTo(hw + r, hh);
      shape.absarc(hw, hh, r, 0, Math.PI / 2, false);
      shape.lineTo(-hw, hh + r);
      shape.absarc(-hw, hh, r, Math.PI / 2, Math.PI, false);
      shape.lineTo(-hw - r, -hh);
      shape.absarc(-hw, -hh, r, Math.PI, Math.PI * 1.5, false);

      const extGeo = new THREE.ExtrudeGeometry(shape, {
        depth: d - r * 2,
        bevelEnabled: true,
        bevelSegments: s,
        steps: 1,
        bevelSize: r,
        bevelThickness: r,
      });
      extGeo.center();
      return extGeo;
    };

    // Helper: Precision Brass Alignment Pin
    const createBrassPin = () => {
      const pinGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.12, 16);
      const mesh = new THREE.Mesh(pinGeo, brassMat);
      mesh.castShadow = true;
      return mesh;
    };

    const parts: ComponentPart[] = [];

    // ================= ELEGANT ITALIAN DESIGNER SOFA COMPONENTS =================
    // Total Dimensions: Width 2.44m, Depth 0.94m, Height 0.72m
    // Generous, low-slung, ultra-luxurious Italian deep-lounge proportions

    // 1. SLEEK FLOATING PLINTH BASE WITH BRUSHED BRASS REVEAL
    const plinthW = 2.44;
    const plinthD = 0.94;
    const plinthH = 0.048;
    const plinthGeo = createRoundedBox(plinthW, plinthH, plinthD, 0.024, 8);
    const plinthMesh = new THREE.Mesh(plinthGeo, darkWoodMat);
    plinthMesh.castShadow = true;
    plinthMesh.receiveShadow = true;
    sofaGroup.add(plinthMesh);
    parts.push({
      mesh: plinthMesh,
      name: 'Timber Plinth Chassis',
      startPos: new THREE.Vector3(0, -0.65, -0.10),
      endPos: new THREE.Vector3(0, -0.36, 0),
      startRot: new THREE.Euler(0.12, 0.05, -0.03),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.0,
      endProgress: 0.28,
      noiseOffset: 0.2,
    });

    // Architectural Brushed Brass Reveal Inset Trim
    const brassTrimGeo = createRoundedBox(plinthW + 0.012, 0.012, plinthD + 0.012, 0.016, 6);
    const brassTrim = new THREE.Mesh(brassTrimGeo, brassMat);
    brassTrim.castShadow = true;
    sofaGroup.add(brassTrim);
    parts.push({
      mesh: brassTrim,
      name: 'Brushed Brass Reveal Trim',
      startPos: new THREE.Vector3(0, -0.58, -0.05),
      endPos: new THREE.Vector3(0, -0.33, 0),
      startRot: new THREE.Euler(0.08, 0.04, -0.02),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.04,
      endProgress: 0.30,
      noiseOffset: 0.4,
    });

    // 4 Architectural Brass Stiletto Feet (Tapered, 11cm floating ground clearance)
    const legLength = 0.16;
    const legData = [
      {
        name: 'Front Left Leg',
        x: -1.04,
        z: 0.36,
        rotZ: 0.06,
        rotX: 0.05,
        sPos: new THREE.Vector3(-1.35, -0.75, 0.55),
        sRot: new THREE.Euler(0.3, 0.2, 0.25),
        startP: 0.02,
        endP: 0.26,
      },
      {
        name: 'Front Right Leg',
        x: 1.04,
        z: 0.36,
        rotZ: -0.06,
        rotX: 0.05,
        sPos: new THREE.Vector3(1.35, -0.75, 0.55),
        sRot: new THREE.Euler(-0.3, -0.2, -0.25),
        startP: 0.04,
        endP: 0.28,
      },
      {
        name: 'Rear Left Leg',
        x: -1.04,
        z: -0.36,
        rotZ: 0.06,
        rotX: -0.05,
        sPos: new THREE.Vector3(-1.30, -0.70, -0.55),
        sRot: new THREE.Euler(-0.25, 0.3, 0.25),
        startP: 0.06,
        endP: 0.30,
      },
      {
        name: 'Rear Right Leg',
        x: 1.04,
        z: -0.36,
        rotZ: -0.06,
        rotX: -0.05,
        sPos: new THREE.Vector3(1.30, -0.70, -0.55),
        sRot: new THREE.Euler(0.25, -0.3, -0.25),
        startP: 0.08,
        endP: 0.32,
      },
    ];

    legData.forEach((ld) => {
      const legGroup = new THREE.Group();
      const legGeo = new THREE.CylinderGeometry(0.024, 0.014, legLength, 20);
      const legMesh = new THREE.Mesh(legGeo, brassMat);
      legMesh.castShadow = true;
      legGroup.add(legMesh);
      sofaGroup.add(legGroup);

      parts.push({
        mesh: legGroup,
        name: ld.name,
        startPos: ld.sPos,
        endPos: new THREE.Vector3(ld.x, -0.46, ld.z),
        startRot: ld.sRot,
        endRot: new THREE.Euler(ld.rotX, 0, ld.rotZ),
        startProgress: ld.startP,
        endProgress: ld.endP,
        noiseOffset: ld.x * 2,
      });
    });

    // 2. CONTINUOUS UPHOLSTERED DECK PLATFORM
    const deckGeo = createRoundedBox(2.42, 0.11, 0.92, 0.04, 8);
    const deckMesh = new THREE.Mesh(deckGeo, velvetMat);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    sofaGroup.add(deckMesh);
    parts.push({
      mesh: deckMesh,
      name: 'Upholstered Deck Platform',
      startPos: new THREE.Vector3(0, -0.32, 0.25),
      endPos: new THREE.Vector3(0, -0.27, 0.01),
      startRot: new THREE.Euler(-0.08, 0, 0),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.16,
      endProgress: 0.40,
      noiseOffset: 0.6,
    });

    // 3. LUXURIOUS SCULPTED TRACK ARMS (Generous, soft, rounded Italian silhouette)
    const armW = 0.25;
    const armH = 0.38;
    const armD = 0.94;
    const armGeo = createRoundedBox(armW, armH, armD, 0.055, 10);

    const armMeshL = new THREE.Mesh(armGeo, velvetMat);
    armMeshL.castShadow = true;
    armMeshL.receiveShadow = true;
    sofaGroup.add(armMeshL);
    parts.push({
      mesh: armMeshL,
      name: 'Left Sculpted Track Arm',
      startPos: new THREE.Vector3(-1.65, 0.06, 0.12),
      endPos: new THREE.Vector3(-1.085, -0.04, 0.01),
      startRot: new THREE.Euler(0.15, 0.22, -0.12),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.28,
      endProgress: 0.54,
      noiseOffset: 1.0,
    });

    const armMeshR = new THREE.Mesh(armGeo, velvetMat);
    armMeshR.castShadow = true;
    armMeshR.receiveShadow = true;
    sofaGroup.add(armMeshR);
    parts.push({
      mesh: armMeshR,
      name: 'Right Sculpted Track Arm',
      startPos: new THREE.Vector3(1.65, 0.06, 0.12),
      endPos: new THREE.Vector3(1.085, -0.04, 0.01),
      startRot: new THREE.Euler(0.15, -0.22, 0.12),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.30,
      endProgress: 0.56,
      noiseOffset: 1.4,
    });

    // 4. CURVED UPHOLSTERED REAR BACKREST CHASSIS
    const backChassisGeo = createRoundedBox(1.94, 0.48, 0.18, 0.055, 8);
    const backChassisMesh = new THREE.Mesh(backChassisGeo, velvetMat);
    backChassisMesh.castShadow = true;
    backChassisMesh.receiveShadow = true;
    sofaGroup.add(backChassisMesh);
    parts.push({
      mesh: backChassisMesh,
      name: 'Rear Structural Backrest',
      startPos: new THREE.Vector3(0, 0.34, -0.65),
      endPos: new THREE.Vector3(0, 0.05, -0.38),
      startRot: new THREE.Euler(-0.18, 0, 0),
      endRot: new THREE.Euler(-0.08, 0, 0),
      startProgress: 0.36,
      endProgress: 0.62,
      noiseOffset: 1.8,
    });

    // 5. DUAL ULTRA-DEEP CLOUD SEAT CUSHIONS (Wide, plush 2-seater deep lounge)
    const seatW = 0.95;
    const seatH = 0.18;
    const seatD = 0.76;

    const seatMeshL = new THREE.Mesh(createCloudCushion(seatW, seatH, seatD, 0.045, 32, 18, 32), velvetMat);
    seatMeshL.castShadow = true;
    seatMeshL.receiveShadow = true;
    sofaGroup.add(seatMeshL);
    parts.push({
      mesh: seatMeshL,
      name: 'Left Deep Cloud Seat Cushion',
      startPos: new THREE.Vector3(-0.68, 0.22, 0.38),
      endPos: new THREE.Vector3(-0.485, -0.13, 0.09),
      startRot: new THREE.Euler(0.18, -0.10, 0),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.46,
      endProgress: 0.70,
      noiseOffset: 2.2,
    });

    const seatMeshR = new THREE.Mesh(createCloudCushion(seatW, seatH, seatD, 0.045, 32, 18, 32), velvetMat);
    seatMeshR.castShadow = true;
    seatMeshR.receiveShadow = true;
    sofaGroup.add(seatMeshR);
    parts.push({
      mesh: seatMeshR,
      name: 'Right Deep Cloud Seat Cushion',
      startPos: new THREE.Vector3(0.68, 0.22, 0.38),
      endPos: new THREE.Vector3(0.485, -0.13, 0.09),
      startRot: new THREE.Euler(0.18, 0.10, 0),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.50,
      endProgress: 0.74,
      noiseOffset: 2.6,
    });

    // 6. DUAL TALL PLUSH CLOUD BACKREST PILLOWS (Comfortable lounge recline)
    const backW = 0.95;
    const backH = 0.45;
    const backD = 0.22;

    const backPillowL = new THREE.Mesh(createCloudCushion(backW, backH, backD, 0.055, 32, 22, 20), velvetMat);
    backPillowL.castShadow = true;
    backPillowL.receiveShadow = true;
    sofaGroup.add(backPillowL);
    parts.push({
      mesh: backPillowL,
      name: 'Left Plush Cloud Back Pillow',
      startPos: new THREE.Vector3(-0.64, 0.38, -0.18),
      endPos: new THREE.Vector3(-0.485, 0.15, -0.24),
      startRot: new THREE.Euler(-0.25, -0.10, 0),
      endRot: new THREE.Euler(-0.16, 0.015, 0),
      startProgress: 0.58,
      endProgress: 0.80,
      noiseOffset: 3.0,
    });

    const backPillowR = new THREE.Mesh(createCloudCushion(backW, backH, backD, 0.055, 32, 22, 20), velvetMat);
    backPillowR.castShadow = true;
    backPillowR.receiveShadow = true;
    sofaGroup.add(backPillowR);
    parts.push({
      mesh: backPillowR,
      name: 'Right Plush Cloud Back Pillow',
      startPos: new THREE.Vector3(0.64, 0.38, -0.18),
      endPos: new THREE.Vector3(0.485, 0.15, -0.24),
      startRot: new THREE.Euler(-0.25, 0.10, 0),
      endRot: new THREE.Euler(-0.16, -0.015, 0),
      startProgress: 0.62,
      endProgress: 0.84,
      noiseOffset: 3.4,
    });

    // 7. PRECISION BRASS CONNECTION DOWELS ("Built in Minutes")
    const pinPositions = [
      { name: 'Arm Pin Left Front', pos: new THREE.Vector3(-0.95, -0.15, 0.25) },
      { name: 'Arm Pin Right Front', pos: new THREE.Vector3(0.95, -0.15, 0.25) },
      { name: 'Back Pin Left', pos: new THREE.Vector3(-0.75, -0.08, -0.32) },
      { name: 'Back Pin Right', pos: new THREE.Vector3(0.75, -0.08, -0.32) },
    ];

    pinPositions.forEach((pp, idx) => {
      const pin = createBrassPin();
      sofaGroup.add(pin);
      parts.push({
        mesh: pin,
        name: pp.name,
        startPos: new THREE.Vector3(pp.pos.x * 1.3, pp.pos.y + 0.35, pp.pos.z),
        endPos: pp.pos,
        startRot: new THREE.Euler(0.4, 0.4, 0.2),
        endRot: new THREE.Euler(0, 0, 0),
        startProgress: 0.68 + idx * 0.04,
        endProgress: 0.86 + idx * 0.03,
        noiseOffset: 5.0 + idx,
      });
    });

    // Initialize all meshes to their Zero-G floating start positions immediately
    parts.forEach((part) => {
      part.mesh.position.copy(part.startPos);
      part.mesh.rotation.copy(part.startRot);
    });

    partsRef.current = parts;

    // 6. Smooth Scroll Setup with Lenis
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
    });

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    // 7. Scroll-Driven Architectural Assembly Animation
    const st = ScrollTrigger.create({
      trigger: container,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.2,
      onUpdate: (self) => {
        const p = self.progress;
        setProgress(p);

        // Animate each component toward its docked position
        partsRef.current.forEach((part) => {
          const localT = Math.max(
            0,
            Math.min(1, (p - part.startProgress) / (part.endProgress - part.startProgress))
          );
          // Smooth cubic easeInOut
          const easeT =
            localT < 0.5 ? 4 * localT * localT * localT : 1 - Math.pow(-2 * localT + 2, 3) / 2;

          part.mesh.position.lerpVectors(part.startPos, part.endPos, easeT);

          part.mesh.rotation.x = THREE.MathUtils.lerp(part.startRot.x, part.endRot.x, easeT);
          part.mesh.rotation.y = THREE.MathUtils.lerp(part.startRot.y, part.endRot.y, easeT);
          part.mesh.rotation.z = THREE.MathUtils.lerp(part.startRot.z, part.endRot.z, easeT);
        });

        // Contact shadow strengthens realistically as sofa assembles
        if (shadowPlaneRef.current) {
          (shadowPlaneRef.current.material as THREE.MeshBasicMaterial).opacity =
            THREE.MathUtils.lerp(0.20, 0.70, Math.min(1, p * 1.2));
        }

        // Tactile sound feedback on joinery milestones
        if (p > 0.22 && !soundTriggersRef.current.chassis) {
          soundEngine.playWoodTap(0.75, 0.20);
          soundTriggersRef.current.chassis = true;
        }
        if (p > 0.32 && !soundTriggersRef.current.legs) {
          soundEngine.playBrassLock(0.14);
          soundTriggersRef.current.legs = true;
        }
        if (p > 0.42 && !soundTriggersRef.current.deck) {
          soundEngine.playWoodTap(0.9, 0.18);
          soundTriggersRef.current.deck = true;
        }
        if (p > 0.56 && !soundTriggersRef.current.arms) {
          soundEngine.playWoodTap(0.8, 0.22);
          soundTriggersRef.current.arms = true;
        }
        if (p > 0.72 && !soundTriggersRef.current.cushions) {
          soundEngine.playWoodTap(1.1, 0.16);
          soundTriggersRef.current.cushions = true;
        }
        if (p > 0.85 && !soundTriggersRef.current.complete) {
          soundEngine.playAssemblyComplete();
          soundTriggersRef.current.complete = true;
          setIsFullyAssembled(true);
        } else if (p < 0.80) {
          soundTriggersRef.current.complete = false;
          setIsFullyAssembled(false);
        }
      },
    });

    // 8. Flawless 360° Turntable Drag Interaction
    const handlePointerDown = (e: PointerEvent) => {
      isPointerDownRef.current = true;
      setIsDragging(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      velYRef.current = 0;
      velXRef.current = 0;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isPointerDownRef.current) return;
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      velYRef.current = dx * 0.0065;
      velXRef.current = dy * 0.0040;

      rotYRef.current += velYRef.current;
      rotXRef.current = Math.max(-0.25, Math.min(0.38, rotXRef.current + velXRef.current));
    };

    const handlePointerUp = (e: PointerEvent) => {
      isPointerDownRef.current = false;
      setIsDragging(false);
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (err) {}
    };

    // Attach pointer events to canvas & window for 100% reliable 360° dragging
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    // 9. Render & Animation Loop
    let animId: number;

    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (sofaGroupRef.current) {
        if (!isPointerDownRef.current) {
          velYRef.current *= 0.93;
          velXRef.current *= 0.93;
          rotYRef.current += velYRef.current;
          rotXRef.current = Math.max(-0.25, Math.min(0.38, rotXRef.current + velXRef.current));

          // Subtle elegant auto-turntable drift when idle
          if (Math.abs(velYRef.current) < 0.0001) {
            rotYRef.current += 0.0012;
          }
        }

        sofaGroupRef.current.rotation.y = rotYRef.current;
        sofaGroupRef.current.rotation.x = rotXRef.current;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 10. Resize Handler
    const handleResize = () => {
      if (!canvas || !renderer) return;
      updateCameraDistance();
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      st.kill();
      lenis.destroy();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '420vh', // Generous scroll track for smooth assembly
        backgroundColor: '#F4EBDD',
      }}
    >
      {/* Sticky 100vh Viewport */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          width: '100%',
          height: '100vh',
          overflow: 'hidden',
          backgroundColor: '#F4EBDD',
        }}
      >
        {/* 3D WebGL Canvas with 360° Drag Turntable */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none',
            zIndex: 10,
          }}
        />

        {/* Top Header / Branding & COMING SOON Banner */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 'clamp(18px, 3vh, 32px)',
            pointerEvents: 'none',
          }}
        >
          {/* Top Bar: Official JODO Logo */}
          <div
            style={{
              width: '92%',
              maxWidth: '1380px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              marginBottom: 'clamp(24px, 4vh, 48px)',
              pointerEvents: 'auto',
            }}
          >
            {/* Official Brand Logo with Terracotta TM */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <img
                src="/jodo-logo.png"
                alt="JODO - The Joy of Together"
                style={{
                  height: 'clamp(50px, 6.5vh, 70px)',
                  width: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                  filter: 'drop-shadow(0 2px 8px rgba(36, 33, 30, 0.04))',
                }}
              />
            </div>
          </div>

          {/* Majestic Hero Headline: COMING SOON */}
          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 'clamp(2.4rem, 6.4vw, 5.8rem)',
              fontWeight: 900,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#C65F45',
              lineHeight: 0.95,
              margin: 0,
              marginTop: 'clamp(12px, 2vh, 24px)',
              textAlign: 'center',
              userSelect: 'none',
              transform: 'scaleY(0.92)',
              textShadow: '0 4px 24px rgba(198, 95, 69, 0.12)',
            }}
          >
            COMING SOON
          </h1>
        </div>

        {/* Bottom Interactive Area */}
        <div
          style={{
            position: 'absolute',
            bottom: 'clamp(14px, 2.5vh, 26px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '92%',
            maxWidth: '1200px',
            pointerEvents: 'none',
          }}
        >
          {/* Milestone State Indicator */}
          <div
            style={{
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {isFullyAssembled ? (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.85)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(198, 95, 69, 0.35)',
                  borderRadius: '24px',
                  padding: '6px 16px',
                  fontSize: '11px',
                  fontFamily: "'Space Grotesk', monospace",
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: '#24211E',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 20px rgba(198, 95, 69, 0.12)',
                }}
              >
                <span
                  style={{
                    color: '#C65F45',
                    fontSize: '13px',
                    display: 'inline-block',
                  }}
                >
                  ↻
                </span>
                Drag to Rotate 360°
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    fontFamily: "'Space Grotesk', monospace",
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: '#8E867E',
                  }}
                >
                  Scroll to Assemble Sofa
                </div>
                <div
                  style={{
                    width: '1px',
                    height: '14px',
                    background: 'linear-gradient(to bottom, #C65F45, transparent)',
                  }}
                />
              </div>
            )}
          </div>

          {/* Majestic Architectural Brand Sign-off */}
          <div
            style={{
              textAlign: 'center',
              marginTop: '4px',
            }}
          >
            <span
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: 'clamp(1.4rem, 3.4vw, 2.8rem)',
                fontWeight: 800,
                color: '#24211E',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              The Joy of{' '}
            </span>
            <span
              style={{
                fontFamily: "'Instrument Serif', serif",
                fontSize: 'clamp(1.6rem, 3.9vw, 3.2rem)',
                fontStyle: 'italic',
                color: '#C65F45',
                letterSpacing: '0.01em',
                lineHeight: 1,
                position: 'relative',
              }}
            >
              Together.
              <svg
                viewBox="0 0 100 12"
                style={{
                  position: 'absolute',
                  bottom: '-4px',
                  left: 0,
                  width: '100%',
                  height: '6px',
                  overflow: 'visible',
                }}
              >
                <path
                  d="M 2 8 Q 50 14 98 4"
                  fill="none"
                  stroke="#C65F45"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
