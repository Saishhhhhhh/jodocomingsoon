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

  // Elegant initial 3/4 beauty angle to showcase tailored curves and depth
  const BASE_ROT_Y = -0.14;
  const BASE_ROT_X = 0.04;

  // Turntable drag state
  const dragRotation = useRef<{ vx: number; vy: number; currentY: number; currentX: number }>({
    vx: 0,
    vy: 0,
    currentY: BASE_ROT_Y,
    currentX: BASE_ROT_X,
  });
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPointerDown = useRef<boolean>(false);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;

    partsRef.current = [];

    // 1. Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2('#F4EBDD', 0.026);

    // Responsive Camera Setup
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 50);

    const updateCameraDistance = () => {
      const currentAspect = canvas.clientWidth / canvas.clientHeight;
      camera.aspect = currentAspect;
      if (currentAspect < 1) {
        // Mobile portrait: framed so full 2.42m sofa and floating parts fit comfortably with margins
        camera.position.set(0, 0.32, 4.6 / currentAspect);
        camera.lookAt(0, -0.10, 0);
      } else {
        // Desktop landscape: centered framing with generous clearance below COMING SOON
        camera.position.set(0, 0.38, 5.8);
        camera.lookAt(0, -0.10, 0);
      }
      camera.updateProjectionMatrix();
    };

    updateCameraDistance();
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    rendererRef.current = renderer;

    // 2. Warm Architectural Studio Lighting
    const ambientLight = new THREE.AmbientLight('#FAF2E6', 1.25);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight('#FFF5E8', 2.6);
    keyLight.position.set(-4.0, 6.0, 4.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#E0EDF8', 1.05);
    fillLight.position.set(4.5, 3.0, -1.8);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight('#FFE8D6', 1.5);
    rimLight.position.set(0, 4.5, -4.5);
    scene.add(rimLight);

    // 3. Ground Studio Floor Contact Shadow
    const floorGeo = new THREE.PlaneGeometry(18, 18);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 512;
    shadowCanvas.height = 512;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(256, 256, 30, 256, 256, 240);
      grad.addColorStop(0, 'rgba(40, 32, 26, 0.48)');
      grad.addColorStop(0.35, 'rgba(40, 32, 26, 0.28)');
      grad.addColorStop(0.70, 'rgba(40, 32, 26, 0.08)');
      grad.addColorStop(1, 'rgba(40, 32, 26, 0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 512, 512);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(floorGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.68;
    shadowPlane.scale.set(1.5, 0.85, 1);
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
    shadowPlaneRef.current = shadowPlane;

    // 4. Main Sofa Root Group
    const sofaGroup = new THREE.Group();
    scene.add(sofaGroup);
    sofaGroupRef.current = sofaGroup;

    sofaGroup.position.set(0, -0.08, 0);
    sofaGroup.rotation.y = BASE_ROT_Y;
    sofaGroup.rotation.x = BASE_ROT_X;

    // 5. Materials
    const brassMat = getBrassMaterial();
    const darkWoodMat = getWoodMaterial('teak');

    // Signature JODO Terracotta woven bouclé upholstery texture
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

    // High-end Terracotta Velvet with rich sheen & softness
    const velvetMat = new THREE.MeshPhysicalMaterial({
      map: fabricTex,
      color: new THREE.Color('#C65F45'),
      roughness: 0.62,
      metalness: 0.03,
      sheen: 0.95,
      sheenColor: new THREE.Color('#E5836B'),
      sheenRoughness: 0.38,
    });

    const velvetAccentMat = new THREE.MeshPhysicalMaterial({
      map: fabricTex,
      color: new THREE.Color('#BA523B'),
      roughness: 0.58,
      metalness: 0.03,
      sheen: 1.0,
      sheenColor: new THREE.Color('#EC8D75'),
      sheenRoughness: 0.35,
    });

    // Helper: Sculpted Organic Cloud Cushion with smooth welded vertices
    const createCloudCushion = (
      w: number,
      h: number,
      d: number,
      loft = 0.06,
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

        // Organic crowning on top and bottom
        if (Math.abs(ny) > 0.55) {
          const sign = Math.sign(ny);
          pos.setY(i, y + sign * loft * (1 - nx * nx) * (1 - nz * nz * 0.9));
        }

        // Waterfall forward curve on front (+z)
        if (nz > 0.45) {
          const frontFactor = (nz - 0.45) / 0.55;
          pos.setZ(i, z + loft * 0.75 * (1 - nx * nx) * Math.cos(ny * Math.PI * 0.5));
          if (ny > 0) {
            pos.setY(i, y - loft * 0.28 * frontFactor * (1 - nx * nx));
          }
        }

        // Soft bulge on outer side faces
        if (Math.abs(nx) > 0.60) {
          const sign = Math.sign(nx);
          pos.setX(i, x + sign * (loft * 0.4) * (1 - ny * ny) * (1 - nz * nz));
        }
      }

      geo.computeVertexNormals();
      return geo;
    };

    // Helper: Sculpted Curved Track Armrest with smooth welded vertices
    const createSculptedArmrest = (w: number, h: number, d: number, isLeft = true) => {
      let geo: THREE.BufferGeometry = new THREE.BoxGeometry(w, h, d, 24, 24, 28);
      geo = mergeVertices(geo, 0.001);
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

        if (ny > 0.45) {
          const outerSign = isLeft ? -1 : 1;
          const outerDist = Math.max(0, nx * outerSign);
          pos.setY(i, y - outerDist * 0.045 * (1 - nz * nz * 0.5));
          pos.setY(i, pos.getY(i) + 0.035 * (1 - nx * nx) * (1 - nz * nz));
        }

        if (nz > 0.55) {
          pos.setZ(i, z + 0.04 * (1 - nx * nx) * (1 - ny * ny));
        }

        const sideSign = isLeft ? -1 : 1;
        if (nx * sideSign > 0.55) {
          pos.setX(i, x + sideSign * 0.035 * (1 - ny * ny) * (1 - nz * nz));
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

    // ================= ELEGANT DESIGNER SOFA COMPONENTS =================
    // Total Dimensions: Width 2.42m, Depth 0.98m, Height 0.74m
    // Generous, low-slung, ultra-luxurious Italian deep-lounge proportions

    // 1. SLEEK FLOATING PLINTH BASE WITH BRUSHED BRASS REVEAL
    const plinthW = 2.38;
    const plinthD = 0.94;
    const plinthH = 0.055;
    const plinthGeo = createRoundedBox(plinthW, plinthH, plinthD, 0.025, 8);
    const plinthMesh = new THREE.Mesh(plinthGeo, darkWoodMat);
    plinthMesh.castShadow = true;
    plinthMesh.receiveShadow = true;
    sofaGroup.add(plinthMesh);
    parts.push({
      mesh: plinthMesh,
      name: 'Timber Plinth Chassis',
      startPos: new THREE.Vector3(0, -0.78, -0.10),
      endPos: new THREE.Vector3(0, -0.42, 0),
      startRot: new THREE.Euler(0.15, 0.08, -0.04),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.0,
      endProgress: 0.28,
      noiseOffset: 0.2,
    });

    // Architectural Brushed Brass Reveal Trim
    const brassTrimGeo = createRoundedBox(plinthW + 0.015, 0.014, plinthD + 0.015, 0.02, 6);
    const brassTrim = new THREE.Mesh(brassTrimGeo, brassMat);
    brassTrim.castShadow = true;
    sofaGroup.add(brassTrim);
    parts.push({
      mesh: brassTrim,
      name: 'Brushed Brass Reveal Trim',
      startPos: new THREE.Vector3(0, -0.72, -0.05),
      endPos: new THREE.Vector3(0, -0.39, 0),
      startRot: new THREE.Euler(0.12, 0.05, -0.03),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.04,
      endProgress: 0.30,
      noiseOffset: 0.4,
    });

    // 4 Architectural Brass Stiletto Feet
    const legLength = 0.22;
    const legData = [
      {
        name: 'Front Left Leg',
        x: -1.02,
        z: 0.38,
        sPos: new THREE.Vector3(-1.38, -0.96, 0.60),
        sRot: new THREE.Euler(0.35, 0.25, 0.3),
        startP: 0.02,
        endP: 0.26,
      },
      {
        name: 'Front Right Leg',
        x: 1.02,
        z: 0.38,
        sPos: new THREE.Vector3(1.38, -0.96, 0.60),
        sRot: new THREE.Euler(-0.35, -0.25, -0.3),
        startP: 0.04,
        endP: 0.28,
      },
      {
        name: 'Rear Left Leg',
        x: -1.02,
        z: -0.38,
        sPos: new THREE.Vector3(-1.30, -0.82, -0.60),
        sRot: new THREE.Euler(-0.3, 0.35, 0.3),
        startP: 0.06,
        endP: 0.30,
      },
      {
        name: 'Rear Right Leg',
        x: 1.02,
        z: -0.38,
        sPos: new THREE.Vector3(1.30, -0.82, -0.60),
        sRot: new THREE.Euler(0.3, -0.35, -0.3),
        startP: 0.08,
        endP: 0.32,
      },
    ];

    legData.forEach((ld) => {
      const legGroup = new THREE.Group();

      const legGeo = new THREE.CylinderGeometry(0.026, 0.016, legLength, 20);
      const legMesh = new THREE.Mesh(legGeo, brassMat);
      legMesh.castShadow = true;
      legGroup.add(legMesh);

      sofaGroup.add(legGroup);

      const endRotZ = -Math.sign(ld.x) * 0.08;
      const endRotX = Math.sign(ld.z) * 0.06;

      parts.push({
        mesh: legGroup,
        name: ld.name,
        startPos: ld.sPos,
        endPos: new THREE.Vector3(ld.x, -0.52, ld.z),
        startRot: ld.sRot,
        endRot: new THREE.Euler(endRotX, 0, endRotZ),
        startProgress: ld.startP,
        endProgress: ld.endP,
        noiseOffset: ld.x * 2,
      });
    });

    // 2. CONTINUOUS UPHOLSTERED DECK PLATFORM
    const deckGeo = createRoundedBox(2.36, 0.12, 0.92, 0.04, 8);
    const deckMesh = new THREE.Mesh(deckGeo, velvetMat);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    sofaGroup.add(deckMesh);
    parts.push({
      mesh: deckMesh,
      name: 'Upholstered Deck Platform',
      startPos: new THREE.Vector3(0, -0.50, 0.18),
      endPos: new THREE.Vector3(0, -0.315, 0.01),
      startRot: new THREE.Euler(-0.10, 0, 0),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.16,
      endProgress: 0.40,
      noiseOffset: 0.6,
    });

    // 3. SCULPTED LOW-PROFILE TRACK ARMS (Left & Right)
    const armW = 0.24;
    const armH = 0.40;
    const armD = 0.94;

    const armMeshL = new THREE.Mesh(createSculptedArmrest(armW, armH, armD, true), velvetMat);
    armMeshL.castShadow = true;
    armMeshL.receiveShadow = true;
    sofaGroup.add(armMeshL);
    parts.push({
      mesh: armMeshL,
      name: 'Left Sculpted Track Arm',
      startPos: new THREE.Vector3(-1.75, 0.12, 0.15),
      endPos: new THREE.Vector3(-1.06, -0.05, 0.01),
      startRot: new THREE.Euler(0.2, 0.3, -0.18),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.28,
      endProgress: 0.54,
      noiseOffset: 1.0,
    });

    const armMeshR = new THREE.Mesh(createSculptedArmrest(armW, armH, armD, false), velvetMat);
    armMeshR.castShadow = true;
    armMeshR.receiveShadow = true;
    sofaGroup.add(armMeshR);
    parts.push({
      mesh: armMeshR,
      name: 'Right Sculpted Track Arm',
      startPos: new THREE.Vector3(1.75, 0.12, 0.15),
      endPos: new THREE.Vector3(1.06, -0.05, 0.01),
      startRot: new THREE.Euler(0.2, -0.3, 0.18),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.30,
      endProgress: 0.56,
      noiseOffset: 1.4,
    });

    // 4. CURVED UPHOLSTERED REAR BACKREST CHASSIS
    const backChassisGeo = createRoundedBox(2.36, 0.52, 0.18, 0.06, 8);
    const backChassisMesh = new THREE.Mesh(backChassisGeo, velvetMat);
    backChassisMesh.castShadow = true;
    backChassisMesh.receiveShadow = true;
    sofaGroup.add(backChassisMesh);
    parts.push({
      mesh: backChassisMesh,
      name: 'Rear Structural Backrest',
      startPos: new THREE.Vector3(0, 0.48, -0.70),
      endPos: new THREE.Vector3(0, 0.04, -0.38),
      startRot: new THREE.Euler(-0.22, 0, 0),
      endRot: new THREE.Euler(-0.08, 0, 0),
      startProgress: 0.36,
      endProgress: 0.62,
      noiseOffset: 1.8,
    });

    // 5. DUAL ULTRA-DEEP CLOUD SEAT CUSHIONS (Wide, plush 2-seater deep lounge)
    const seatW = 0.93;
    const seatH = 0.18;
    const seatD = 0.74;

    const seatMeshL = new THREE.Mesh(createCloudCushion(seatW, seatH, seatD, 0.055, 32, 18, 32), velvetMat);
    seatMeshL.castShadow = true;
    seatMeshL.receiveShadow = true;
    sofaGroup.add(seatMeshL);
    parts.push({
      mesh: seatMeshL,
      name: 'Left Deep Cloud Seat Cushion',
      startPos: new THREE.Vector3(-0.72, 0.52, 0.45),
      endPos: new THREE.Vector3(-0.475, -0.16, 0.09),
      startRot: new THREE.Euler(0.25, -0.15, 0),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.46,
      endProgress: 0.70,
      noiseOffset: 2.2,
    });

    const seatMeshR = new THREE.Mesh(createCloudCushion(seatW, seatH, seatD, 0.055, 32, 18, 32), velvetMat);
    seatMeshR.castShadow = true;
    seatMeshR.receiveShadow = true;
    sofaGroup.add(seatMeshR);
    parts.push({
      mesh: seatMeshR,
      name: 'Right Deep Cloud Seat Cushion',
      startPos: new THREE.Vector3(0.72, 0.52, 0.45),
      endPos: new THREE.Vector3(0.475, -0.16, 0.09),
      startRot: new THREE.Euler(0.25, 0.15, 0),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.50,
      endProgress: 0.74,
      noiseOffset: 2.6,
    });

    // 6. DUAL TALL PLUSH CLOUD BACKREST PILLOWS
    const backW = 0.93;
    const backH = 0.46;
    const backD = 0.22;

    const backPillowL = new THREE.Mesh(createCloudCushion(backW, backH, backD, 0.065, 32, 22, 20), velvetMat);
    backPillowL.castShadow = true;
    backPillowL.receiveShadow = true;
    sofaGroup.add(backPillowL);
    parts.push({
      mesh: backPillowL,
      name: 'Left Plush Cloud Back Pillow',
      startPos: new THREE.Vector3(-0.68, 0.82, -0.35),
      endPos: new THREE.Vector3(-0.475, 0.14, -0.24),
      startRot: new THREE.Euler(-0.35, -0.15, 0),
      endRot: new THREE.Euler(-0.18, 0.025, 0),
      startProgress: 0.58,
      endProgress: 0.80,
      noiseOffset: 3.0,
    });

    const backPillowR = new THREE.Mesh(createCloudCushion(backW, backH, backD, 0.065, 32, 22, 20), velvetMat);
    backPillowR.castShadow = true;
    backPillowR.receiveShadow = true;
    sofaGroup.add(backPillowR);
    parts.push({
      mesh: backPillowR,
      name: 'Right Plush Cloud Back Pillow',
      startPos: new THREE.Vector3(0.68, 0.82, -0.35),
      endPos: new THREE.Vector3(0.475, 0.14, -0.24),
      startRot: new THREE.Euler(-0.35, 0.15, 0),
      endRot: new THREE.Euler(-0.18, -0.025, 0),
      startProgress: 0.62,
      endProgress: 0.84,
      noiseOffset: 3.4,
    });

    // 7. TWO DESIGNER ACCENT LUMBAR / THROW PILLOWS
    const throwGeo = createCloudCushion(0.38, 0.38, 0.15, 0.06, 22, 22, 18);

    const throwL = new THREE.Mesh(throwGeo, velvetAccentMat);
    throwL.castShadow = true;
    sofaGroup.add(throwL);
    parts.push({
      mesh: throwL,
      name: 'Left Accent Throw Pillow',
      startPos: new THREE.Vector3(-1.32, 0.42, 0.70),
      endPos: new THREE.Vector3(-0.82, -0.05, 0.08),
      startRot: new THREE.Euler(0.35, 0.8, -0.25),
      endRot: new THREE.Euler(0.12, 0.55, -0.22),
      startProgress: 0.68,
      endProgress: 0.88,
      noiseOffset: 4.2,
    });

    const throwR = new THREE.Mesh(throwGeo, velvetAccentMat);
    throwR.castShadow = true;
    sofaGroup.add(throwR);
    parts.push({
      mesh: throwR,
      name: 'Right Accent Throw Pillow',
      startPos: new THREE.Vector3(1.32, 0.42, 0.70),
      endPos: new THREE.Vector3(0.82, -0.05, 0.08),
      startRot: new THREE.Euler(0.35, -0.8, 0.25),
      endRot: new THREE.Euler(0.12, -0.55, 0.22),
      startProgress: 0.70,
      endProgress: 0.90,
      noiseOffset: 4.6,
    });

    // 8. PRECISION BRASS CONNECTION DOWELS ("Built in Minutes")
    const pinPositions = [
      { name: 'Arm Pin Left Front', pos: new THREE.Vector3(-0.95, -0.15, 0.25) },
      { name: 'Arm Pin Left Rear', pos: new THREE.Vector3(-0.95, -0.15, -0.25) },
      { name: 'Arm Pin Right Front', pos: new THREE.Vector3(0.95, -0.15, 0.25) },
      { name: 'Arm Pin Right Rear', pos: new THREE.Vector3(0.95, -0.15, -0.25) },
    ];

    pinPositions.forEach((pp, i) => {
      const pinMesh = createBrassPin();
      sofaGroup.add(pinMesh);
      const sX = pp.pos.x * 1.35;
      const sY = pp.pos.y + 0.42;
      const sZ = pp.pos.z * 1.25;

      parts.push({
        mesh: pinMesh,
        name: pp.name,
        startPos: new THREE.Vector3(sX, sY, sZ),
        endPos: pp.pos.clone(),
        startRot: new THREE.Euler(0.6, 0.4, 0.2),
        endRot: new THREE.Euler(0, 0, 0),
        startProgress: 0.22 + i * 0.03,
        endProgress: 0.44 + i * 0.03,
        noiseOffset: 5.0 + i * 0.3,
      });
    });

    partsRef.current = parts;

    // Apply initial floating exploded layout at start
    parts.forEach((part) => {
      part.mesh.position.copy(part.startPos);
      part.mesh.rotation.copy(part.startRot);
    });

    // 6. Lenis Smooth Scroll Setup
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
      touchMultiplier: 2,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    const rafId = requestAnimationFrame(raf);

    // 7. GSAP ScrollTrigger Animation (0.0 -> 1.0 Assembly Progression)
    const st = ScrollTrigger.create({
      trigger: container,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: (self) => {
        const p = self.progress;
        setProgress(p);

        // Interpolate every sofa component
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
            THREE.MathUtils.lerp(0.18, 0.65, Math.min(1, p * 1.2));
        }

        // Tactile sound feedback on joinery milestones
        if (p > 0.22 && !soundTriggersRef.current.chassis) {
          soundEngine.playWoodTap(0.75, 0.20);
          soundTriggersRef.current.chassis = true;
        }
        if (p > 0.35 && !soundTriggersRef.current.legs) {
          soundEngine.playBrassLock(0.14);
          soundTriggersRef.current.legs = true;
        }
        if (p > 0.45 && !soundTriggersRef.current.deck) {
          soundEngine.playWoodTap(0.9, 0.18);
          soundTriggersRef.current.deck = true;
        }
        if (p > 0.60 && !soundTriggersRef.current.arms) {
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
      isPointerDown.current = true;
      setIsDragging(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      dragRotation.current.vx = 0;
      dragRotation.current.vy = 0;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isPointerDown.current) return;
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      dragRotation.current.vx = dx * 0.0065;
      dragRotation.current.vy = dy * 0.0040;

      dragRotation.current.currentY += dragRotation.current.vx;
      dragRotation.current.currentX = Math.max(
        -0.25,
        Math.min(0.40, dragRotation.current.currentX + dragRotation.current.vy)
      );
    };

    const handlePointerUp = (e: PointerEvent) => {
      isPointerDown.current = false;
      setIsDragging(false);
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (err) {}
    };

    // Attach pointer events directly to canvas for rock-solid 360° dragging
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    // 9. Render & Animation Loop
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      if (sofaGroupRef.current) {
        if (!isFullyAssembled) {
          // Gentle zero-gravity breathing when in air (p < 0.85)
          const breath = Math.sin(elapsedTime * 1.4) * 0.015;
          const slowTilt = Math.cos(elapsedTime * 0.9) * 0.01;
          
          if (!isPointerDown.current) {
            dragRotation.current.currentY = BASE_ROT_Y + slowTilt;
            dragRotation.current.currentX = BASE_ROT_X + breath;
          } else {
            dragRotation.current.vx *= 0.92;
            dragRotation.current.vy *= 0.92;
            dragRotation.current.currentY += dragRotation.current.vx;
            dragRotation.current.currentX += dragRotation.current.vy;
          }

          sofaGroupRef.current.rotation.y = dragRotation.current.currentY;
          sofaGroupRef.current.rotation.x = dragRotation.current.currentX;

          // Gentle ambient float for suspended pieces
          const p = progress;
          if (p < 0.85) {
            partsRef.current.forEach((part) => {
              const floatOffset = Math.sin(elapsedTime * 1.6 + part.noiseOffset) * 0.012 * (1 - p);
              part.mesh.position.y += floatOffset * 0.06;
            });
          }
        } else {
          // Assembled turntable drag with smooth inertia coasting
          if (!isPointerDown.current) {
            dragRotation.current.vx *= 0.93;
            dragRotation.current.vy *= 0.93;
            dragRotation.current.currentY += dragRotation.current.vx;
            dragRotation.current.currentX += dragRotation.current.vy;
          }
          sofaGroupRef.current.rotation.y = dragRotation.current.currentY;
          sofaGroupRef.current.rotation.x = dragRotation.current.currentX;
        }
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
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Top Header / Branding & COMING SOON Banner */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            zIndex: 40,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 'clamp(14px, 2.5vh, 24px)',
            pointerEvents: 'none',
          }}
        >
          {/* Top Bar: Official JODO Logo & Navigation */}
          <div
            style={{
              width: '92%',
              maxWidth: '1380px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'clamp(10px, 1.6vh, 20px)',
              pointerEvents: 'auto',
            }}
          >
            {/* Official Brand Logo */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <img
                src="/jodo-logo.png"
                alt="JODO - The Joy of Together"
                style={{
                  height: 'clamp(36px, 4.4vh, 48px)',
                  width: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button
                type="button"
                onClick={() => soundEngine.toggle()}
                style={{
                  background: 'rgba(255, 255, 255, 0.75)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(142, 134, 126, 0.22)',
                  borderRadius: '24px',
                  padding: '6px 14px',
                  fontSize: '11px',
                  fontFamily: "'Space Grotesk', monospace",
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#24211E',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#C65F45',
                  }}
                />
                Audio
              </button>

              <button
                type="button"
                style={{
                  background: '#24211E',
                  color: '#F4EBDD',
                  border: 'none',
                  borderRadius: '24px',
                  padding: '7px 18px',
                  fontSize: '11px',
                  fontFamily: "'Space Grotesk', monospace",
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Storefront
              </button>
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
              textAlign: 'center',
              userSelect: 'none',
              transform: 'scaleY(0.92)',
              textShadow: '0 4px 24px rgba(198, 95, 69, 0.12)',
            }}
          >
            COMING SOON
          </h1>
        </div>

        {/* 3D WebGL Canvas with 360° Drag Turntable */}
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
        />

        {/* Bottom Interactive Area */}
        <div
          style={{
            position: 'absolute',
            bottom: 'clamp(14px, 2.5vh, 26px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'auto',
            width: '92%',
            maxWidth: '860px',
            textAlign: 'center',
            padding: '0 16px',
          }}
        >
          {/* Scroll Cue before user scrolls */}
          {!isFullyAssembled && progress < 0.15 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                pointerEvents: 'none',
                opacity: Math.max(0, 1 - progress / 0.12),
                transition: 'opacity 0.25s ease-out',
                marginBottom: '4px',
              }}
            >
              <span
                style={{
                  fontFamily: "'Space Grotesk', monospace",
                  fontSize: 'clamp(10px, 0.9vw, 11px)',
                  letterSpacing: '0.26em',
                  textTransform: 'uppercase',
                  color: '#8E867E',
                  fontWeight: 500,
                  marginBottom: '4px',
                }}
              >
                SCROLL TO ASSEMBLE SOFA
              </span>
              <div
                style={{
                  width: '1.5px',
                  height: '14px',
                  background: 'linear-gradient(to bottom, #C65F45, transparent)',
                  borderRadius: '2px',
                }}
              />
            </div>
          )}

          {/* Interactive Turntable Drag Indicator */}
          {isFullyAssembled && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(12px)',
                borderRadius: '20px',
                border: '1px solid rgba(198, 95, 69, 0.25)',
                marginBottom: '2px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#C65F45"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span
                style={{
                  fontFamily: "'Space Grotesk', monospace",
                  fontSize: '10px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: '#24211E',
                  fontWeight: 600,
                }}
              >
                Drag to Rotate 360°
              </span>
            </div>
          )}

          {/* Main Creative Headline */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <h2
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: 'clamp(1.75rem, 4.4vw, 3.5rem)',
                fontWeight: 800,
                letterSpacing: '-0.025em',
                lineHeight: 1.1,
                color: '#24211E',
                margin: 0,
                display: 'inline-flex',
                alignItems: 'baseline',
                justifyContent: 'center',
                flexWrap: 'wrap',
                gap: '0.25em',
              }}
            >
              <span>The Joy of</span>
              <span
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontStyle: 'italic',
                  fontWeight: 600,
                  color: '#C65F45',
                  position: 'relative',
                  display: 'inline-block',
                  padding: '0 2px',
                }}
              >
                Together
                <span
                  style={{
                    fontFamily: "'Syne', sans-serif",
                    fontStyle: 'normal',
                    fontWeight: 800,
                    color: '#C65F45',
                    marginLeft: '1px',
                  }}
                >
                  .
                </span>
                {/* Organic joinery terracotta swoosh underline */}
                <svg
                  viewBox="0 0 160 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    position: 'absolute',
                    bottom: '-4px',
                    left: '2px',
                    width: 'calc(100% - 4px)',
                    height: '9px',
                    overflow: 'visible',
                    pointerEvents: 'none',
                  }}
                >
                  <path
                    d="M 2 9 C 45 2.5, 115 2.5, 158 7"
                    stroke="#C65F45"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    opacity="0.9"
                  />
                </svg>
              </span>
            </h2>
          </div>
        </div>
      </div>
    </div>
  );
};
