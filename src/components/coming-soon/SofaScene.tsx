'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
    legs: false,
    feet: false,
    body: false,
    pillows: false,
    complete: false,
  });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const partsRef = useRef<ComponentPart[]>([]);
  const sofaGroupRef = useRef<THREE.Group | null>(null);
  const shadowPlaneRef = useRef<THREE.Mesh | null>(null);

  // Heroic front 3/4 perspective angles
  const BASE_ROT_Y = 0.32;
  const BASE_ROT_X = 0.08;

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
    scene.fog = new THREE.FogExp2('#F4EBDD', 0.025);

    // Responsive Camera Setup
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 50);

    const updateCameraDistance = () => {
      const currentAspect = canvas.clientWidth / canvas.clientHeight;
      camera.aspect = currentAspect;
      if (currentAspect < 1) {
        // Mobile portrait: framed so floating parts fit comfortably with margins
        camera.position.set(0, 0.38, (7.4 / currentAspect) * 0.64);
        camera.lookAt(0, -0.15, 0);
      } else {
        // Desktop landscape: centered view framing all parts in air and assembled
        camera.position.set(0, 0.40, 5.8);
        camera.lookAt(0, -0.15, 0);
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
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    rendererRef.current = renderer;

    // 2. Studio Lighting (Warm Key, Cool Fill, Back Rim)
    const ambientLight = new THREE.AmbientLight('#FAF3E8', 1.15);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight('#FFF5E8', 2.6);
    keyLight.position.set(5.0, 7.0, 4.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#E0EDF8', 0.95);
    fillLight.position.set(-5.0, 4.0, 3.0);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight('#FFD6BA', 1.5);
    rimLight.position.set(0, 5.0, -4.5);
    scene.add(rimLight);

    // 3. Ground Studio Floor Contact Shadow
    const floorGeo = new THREE.PlaneGeometry(30, 20);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 1024;
    shadowCanvas.height = 512;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(512, 256, 40, 512, 256, 480);
      grad.addColorStop(0, 'rgba(36, 33, 30, 0.44)');
      grad.addColorStop(0.35, 'rgba(36, 33, 30, 0.20)');
      grad.addColorStop(0.68, 'rgba(36, 33, 30, 0.05)');
      grad.addColorStop(1, 'rgba(36, 33, 30, 0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 1024, 512);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(floorGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.25;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
    shadowPlaneRef.current = shadowPlane;

    // 4. Main Sofa Root Group
    const sofaGroup = new THREE.Group();
    scene.add(sofaGroup);
    sofaGroupRef.current = sofaGroup;

    // Position sofa in optical center with generous headline clearance
    sofaGroup.position.set(0, -0.26, 0);
    sofaGroup.rotation.y = BASE_ROT_Y;
    sofaGroup.rotation.x = BASE_ROT_X;
    // Scale 1.40 gives a majestic 3.1-meter wide designer sofa presence
    sofaGroup.scale.setScalar(1.40);

    // Inner Model Group centered at geometric center
    const sofaModelGroup = new THREE.Group();
    sofaGroup.add(sofaModelGroup);

    // 5. Materials
    const woodMat = getWoodMaterial('teak');
    const brassMat = getBrassMaterial();

    // Signature JODO Terracotta woven upholstery texture
    const fabricCanvas = document.createElement('canvas');
    fabricCanvas.width = 512;
    fabricCanvas.height = 512;
    const fCtx = fabricCanvas.getContext('2d');
    if (fCtx) {
      fCtx.fillStyle = '#C65F45'; // Signature JODO Terracotta
      fCtx.fillRect(0, 0, 512, 512);
      for (let x = 0; x < 512; x += 4) {
        for (let y = 0; y < 512; y += 4) {
          const isWeft = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
          fCtx.fillStyle = isWeft ? '#BA553D' : '#D26B52';
          fCtx.fillRect(x, y, 3.5, 3.5);
        }
      }
    }
    const fabricTex = new THREE.CanvasTexture(fabricCanvas);
    fabricTex.wrapS = THREE.RepeatWrapping;
    fabricTex.wrapT = THREE.RepeatWrapping;
    fabricTex.repeat.set(6, 6);

    const terracottaCushionMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#C65F45'),
      map: fabricTex,
      roughness: 0.72,
      metalness: 0.04,
      sheen: 0.95,
      sheenColor: new THREE.Color('#E27D65'),
      sheenRoughness: 0.45,
    });

    const pillowMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#CE6A52'),
      map: fabricTex,
      roughness: 0.65,
      metalness: 0.04,
      sheen: 1.0,
      sheenColor: new THREE.Color('#F0937A'),
      sheenRoughness: 0.40,
    });

    // Helper: Create a plush rounded upholstered cushion with rounded bevels and optional center tufting
    const createPlushCushion = (
      w: number,
      d: number,
      h: number,
      r: number,
      mat: THREE.Material,
      hasTufting = true
    ): THREE.Group => {
      const group = new THREE.Group();

      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 + r, -d / 2);
      shape.lineTo(w / 2 - r, -d / 2);
      shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
      shape.lineTo(w / 2, d / 2 - r);
      shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
      shape.lineTo(-w / 2 + r, d / 2);
      shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
      shape.lineTo(-w / 2, -d / 2 + r);
      shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);

      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: h,
        bevelEnabled: true,
        bevelSegments: 5,
        steps: 1,
        bevelSize: 0.042,
        bevelThickness: 0.042,
      });
      geo.center();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      // Subtle tufting buttons for high-end tailoring
      if (hasTufting) {
        const buttonGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.01, 16);
        const buttonMat = new THREE.MeshStandardMaterial({
          color: '#A23F28',
          roughness: 0.5,
        });
        [-w * 0.22, w * 0.22].forEach((bx) => {
          const btnTop = new THREE.Mesh(buttonGeo, buttonMat);
          btnTop.position.set(bx, 0, h / 2 + 0.04);
          btnTop.rotation.x = Math.PI / 2;
          group.add(btnTop);
        });
      }

      return group;
    };

    // Helper: Turned tapered leg with gleaming brushed brass ferrule
    const createLegWithBrass = (length: number, topR: number, botR: number): THREE.Group => {
      const group = new THREE.Group();
      const ferruleH = 0.052;
      const woodH = length - ferruleH;
      const midR = botR + (topR - botR) * (ferruleH / length);

      const woodGeo = new THREE.CylinderGeometry(topR, midR, woodH, 24);
      woodGeo.translate(0, ferruleH / 2, 0);
      const woodMesh = new THREE.Mesh(woodGeo, woodMat);
      woodMesh.castShadow = true;
      woodMesh.receiveShadow = true;
      group.add(woodMesh);

      const brassGeo = new THREE.CylinderGeometry(midR * 1.02, botR, ferruleH, 24);
      brassGeo.translate(0, -woodH / 2, 0);
      const brassMesh = new THREE.Mesh(brassGeo, brassMat);
      brassMesh.castShadow = true;
      group.add(brassMesh);

      return group;
    };

    // Helper: Brass joinery pin
    const createBrassPin = (): THREE.Mesh => {
      const geo = new THREE.CylinderGeometry(0.013, 0.013, 0.08, 16);
      const mesh = new THREE.Mesh(geo, brassMat);
      mesh.castShadow = true;
      return mesh;
    };

    const parts: ComponentPart[] = [];

    // ─────────────────────────────────────────────────────────────
    // PART 1: CHASSIS & SPLAYED LEGS (Ground Platform)
    // ─────────────────────────────────────────────────────────────
    const chassisGroup = new THREE.Group();
    sofaModelGroup.add(chassisGroup);

    // Front & rear rails
    const frontRailGeo = new THREE.BoxGeometry(2.26, 0.058, 0.055);
    const frontRail = new THREE.Mesh(frontRailGeo, woodMat);
    frontRail.position.set(0, -0.04, 0.36);
    frontRail.castShadow = true;
    frontRail.receiveShadow = true;
    chassisGroup.add(frontRail);

    const rearRailGeo = new THREE.BoxGeometry(2.26, 0.058, 0.055);
    const rearRail = new THREE.Mesh(rearRailGeo, woodMat);
    rearRail.position.set(0, -0.04, -0.36);
    rearRail.castShadow = true;
    rearRail.receiveShadow = true;
    chassisGroup.add(rearRail);

    // Left, center, and right stretchers
    const crossRailGeo = new THREE.BoxGeometry(0.055, 0.058, 0.67);
    [-1.10, 0, 1.10].forEach((x) => {
      const cross = new THREE.Mesh(crossRailGeo, woodMat);
      cross.position.set(x, -0.04, 0);
      cross.castShadow = true;
      cross.receiveShadow = true;
      chassisGroup.add(cross);
    });

    // 10 solid wood seat deck slats
    const slatGeo = new THREE.BoxGeometry(0.052, 0.018, 0.67);
    for (let i = 0; i < 10; i++) {
      const sx = -0.92 + i * 0.205;
      const slat = new THREE.Mesh(slatGeo, woodMat);
      slat.position.set(sx, -0.01, 0);
      slat.castShadow = true;
      slat.receiveShadow = true;
      chassisGroup.add(slat);
    }

    // 4 Splayed Turned Legs with Solid Brass Ferrules
    const legLength = 0.28;
    const legTopR = 0.038;
    const legBotR = 0.024;

    const flLeg = createLegWithBrass(legLength, legTopR, legBotR);
    flLeg.position.set(-1.02, -0.19, 0.30);
    flLeg.rotation.set(0.06, 0, 0.08);
    chassisGroup.add(flLeg);

    const frLeg = createLegWithBrass(legLength, legTopR, legBotR);
    frLeg.position.set(1.02, -0.19, 0.30);
    frLeg.rotation.set(0.06, 0, -0.08);
    chassisGroup.add(frLeg);

    const rlLeg = createLegWithBrass(legLength, legTopR, legBotR);
    rlLeg.position.set(-1.02, -0.19, -0.30);
    rlLeg.rotation.set(-0.08, 0, 0.08);
    chassisGroup.add(rlLeg);

    const rrLeg = createLegWithBrass(legLength, legTopR, legBotR);
    rrLeg.position.set(1.02, -0.19, -0.30);
    rrLeg.rotation.set(-0.08, 0, -0.08);
    chassisGroup.add(rrLeg);

    // 2 Center support legs for authentic furniture engineering
    const clLeg = createLegWithBrass(legLength, 0.032, 0.022);
    clLeg.position.set(0, -0.19, 0.30);
    clLeg.rotation.set(0.04, 0, 0);
    chassisGroup.add(clLeg);

    const crLeg = createLegWithBrass(legLength, 0.032, 0.022);
    crLeg.position.set(0, -0.19, -0.30);
    crLeg.rotation.set(-0.04, 0, 0);
    chassisGroup.add(crLeg);

    parts.push({
      mesh: chassisGroup,
      name: 'Solid Teak Chassis & Turned Legs',
      startPos: new THREE.Vector3(0, -0.22, 0.0),
      endPos: new THREE.Vector3(0, 0, 0),
      startRot: new THREE.Euler(0.04, -0.02, 0.01),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.0,
      endProgress: 0.28,
      noiseOffset: 0.2,
    });

    // ─────────────────────────────────────────────────────────────
    // PART 2: LEFT SCULPTURAL BENTWOOD ARMREST
    // ─────────────────────────────────────────────────────────────
    const leftArmGroup = new THREE.Group();
    sofaModelGroup.add(leftArmGroup);

    // Front post
    const leftFrontPostGeo = new THREE.CylinderGeometry(0.036, 0.034, 0.48, 24);
    const leftFrontPost = new THREE.Mesh(leftFrontPostGeo, woodMat);
    leftFrontPost.position.set(-1.12, 0.20, 0.36);
    leftFrontPost.castShadow = true;
    leftArmGroup.add(leftFrontPost);

    // Rear post
    const leftRearPostGeo = new THREE.CylinderGeometry(0.038, 0.036, 0.58, 24);
    const leftRearPost = new THREE.Mesh(leftRearPostGeo, woodMat);
    leftRearPost.position.set(-1.12, 0.25, -0.36);
    leftRearPost.castShadow = true;
    leftArmGroup.add(leftRearPost);

    // Silky curved arm rail with bullnose rounded contour
    const armShape = new THREE.Shape();
    armShape.moveTo(-0.032, -0.38);
    armShape.lineTo(0.032, -0.38);
    armShape.lineTo(0.032, 0.38);
    armShape.quadraticCurveTo(0.032, 0.42, 0, 0.42);
    armShape.quadraticCurveTo(-0.032, 0.42, -0.032, 0.38);
    armShape.lineTo(-0.032, -0.38);

    const armExtrudeSettings = {
      depth: 0.045,
      bevelEnabled: true,
      bevelSegments: 4,
      bevelSize: 0.016,
      bevelThickness: 0.016,
    };
    const armGeo = new THREE.ExtrudeGeometry(armShape, armExtrudeSettings);
    armGeo.center();
    const leftArmRail = new THREE.Mesh(armGeo, woodMat);
    leftArmRail.rotation.x = Math.PI / 2;
    leftArmRail.position.set(-1.12, 0.45, 0.01);
    leftArmRail.castShadow = true;
    leftArmGroup.add(leftArmRail);

    parts.push({
      mesh: leftArmGroup,
      name: 'Left Sculptural Bentwood Armrest',
      startPos: new THREE.Vector3(-0.45, 0.22, 0.06),
      endPos: new THREE.Vector3(0, 0, 0),
      startRot: new THREE.Euler(0.06, 0.12, -0.10),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.16,
      endProgress: 0.44,
      noiseOffset: 0.5,
    });

    // ─────────────────────────────────────────────────────────────
    // PART 3: RIGHT SCULPTURAL BENTWOOD ARMREST
    // ─────────────────────────────────────────────────────────────
    const rightArmGroup = new THREE.Group();
    sofaModelGroup.add(rightArmGroup);

    const rightFrontPost = new THREE.Mesh(leftFrontPostGeo, woodMat);
    rightFrontPost.position.set(1.12, 0.20, 0.36);
    rightFrontPost.castShadow = true;
    rightArmGroup.add(rightFrontPost);

    const rightRearPost = new THREE.Mesh(leftRearPostGeo, woodMat);
    rightRearPost.position.set(1.12, 0.25, -0.36);
    rightRearPost.castShadow = true;
    rightArmGroup.add(rightRearPost);

    const rightArmRail = new THREE.Mesh(armGeo, woodMat);
    rightArmRail.rotation.x = Math.PI / 2;
    rightArmRail.position.set(1.12, 0.45, 0.01);
    rightArmRail.castShadow = true;
    rightArmGroup.add(rightArmRail);

    parts.push({
      mesh: rightArmGroup,
      name: 'Right Sculptural Bentwood Armrest',
      startPos: new THREE.Vector3(0.45, 0.22, 0.06),
      endPos: new THREE.Vector3(0, 0, 0),
      startRot: new THREE.Euler(0.06, -0.12, 0.10),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.18,
      endProgress: 0.46,
      noiseOffset: 0.8,
    });

    // ─────────────────────────────────────────────────────────────
    // PART 4: ARCHITECTURAL BACKREST FRAME & SPINDLES
    // ─────────────────────────────────────────────────────────────
    const backrestGroup = new THREE.Group();
    sofaModelGroup.add(backrestGroup);

    // Sweeping top crest rail with gentle curve and rounded ends
    const crestRailGeo = new THREE.BoxGeometry(2.26, 0.055, 0.042);
    const crestRail = new THREE.Mesh(crestRailGeo, woodMat);
    crestRail.position.set(0, 0.54, -0.38);
    crestRail.castShadow = true;
    backrestGroup.add(crestRail);

    // 16 slender turned vertical wood spindles
    const spindleGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.54, 16);
    for (let i = 0; i < 16; i++) {
      const sx = -1.02 + i * 0.136;
      const spindle = new THREE.Mesh(spindleGeo, woodMat);
      spindle.position.set(sx, 0.25, -0.37);
      spindle.castShadow = true;
      backrestGroup.add(spindle);
    }

    // Apply ergonomic 10-degree recline
    backrestGroup.rotation.x = 0.17;
    backrestGroup.position.set(0, 0.04, 0.04);

    parts.push({
      mesh: backrestGroup,
      name: 'Bentwood Crest Rail & Slatted Spindles',
      startPos: new THREE.Vector3(0, 0.48, -0.32),
      endPos: new THREE.Vector3(0, 0.04, 0.04),
      startRot: new THREE.Euler(0.35, 0, 0),
      endRot: new THREE.Euler(0.17, 0, 0),
      startProgress: 0.32,
      endProgress: 0.58,
      noiseOffset: 1.2,
    });

    // ─────────────────────────────────────────────────────────────
    // PART 5: SOLID BRASS JOINERY PINS (Floating craft fasteners)
    // ─────────────────────────────────────────────────────────────
    const brassPinsGroup = new THREE.Group();
    sofaModelGroup.add(brassPinsGroup);

    // Front arm joinery pins
    const flPin = createBrassPin();
    flPin.rotation.z = Math.PI / 2;
    flPin.position.set(-1.18, 0.42, 0.36);
    brassPinsGroup.add(flPin);

    const frPin = createBrassPin();
    frPin.rotation.z = Math.PI / 2;
    frPin.position.set(1.18, 0.42, 0.36);
    brassPinsGroup.add(frPin);

    // Rear arm joinery pins
    const rlPin = createBrassPin();
    rlPin.rotation.z = Math.PI / 2;
    rlPin.position.set(-1.18, 0.45, -0.36);
    brassPinsGroup.add(rlPin);

    const rrPin = createBrassPin();
    rrPin.rotation.z = Math.PI / 2;
    rrPin.position.set(1.18, 0.45, -0.36);
    brassPinsGroup.add(rrPin);

    parts.push({
      mesh: brassPinsGroup,
      name: 'Architectural Brushed Brass Joinery Pins',
      startPos: new THREE.Vector3(0, 0.18, 0.16),
      endPos: new THREE.Vector3(0, 0, 0),
      startRot: new THREE.Euler(0.1, 0, 0.05),
      endRot: new THREE.Euler(0, 0, 0),
      startProgress: 0.22,
      endProgress: 0.48,
      noiseOffset: 1.5,
    });

    // ─────────────────────────────────────────────────────────────
    // PARTS 6, 7, 8: THREE PLUSH TERRACOTTA SEAT CUSHIONS
    // ─────────────────────────────────────────────────────────────
    const cushionW = 0.70;
    const cushionD = 0.68;
    const cushionH = 0.13;
    const cushionR = 0.07;

    // Left Seat Cushion
    const leftSeatGroup = createPlushCushion(cushionW, cushionD, cushionH, cushionR, terracottaCushionMat);
    leftSeatGroup.rotation.x = Math.PI / 2;
    leftSeatGroup.position.set(-0.73, 0.08, 0.02);
    sofaModelGroup.add(leftSeatGroup);

    parts.push({
      mesh: leftSeatGroup,
      name: 'Left Terracotta Seat Cushion',
      startPos: new THREE.Vector3(-0.75, 0.48, 0.18),
      endPos: new THREE.Vector3(-0.73, 0.08, 0.02),
      startRot: new THREE.Euler(Math.PI / 2 - 0.14, 0.06, -0.04),
      endRot: new THREE.Euler(Math.PI / 2, 0, 0),
      startProgress: 0.44,
      endProgress: 0.70,
      noiseOffset: 1.8,
    });

    // Center Seat Cushion
    const centerSeatGroup = createPlushCushion(cushionW, cushionD, cushionH, cushionR, terracottaCushionMat);
    centerSeatGroup.rotation.x = Math.PI / 2;
    centerSeatGroup.position.set(0, 0.08, 0.02);
    sofaModelGroup.add(centerSeatGroup);

    parts.push({
      mesh: centerSeatGroup,
      name: 'Center Terracotta Seat Cushion',
      startPos: new THREE.Vector3(0, 0.54, 0.22),
      endPos: new THREE.Vector3(0, 0.08, 0.02),
      startRot: new THREE.Euler(Math.PI / 2 - 0.16, 0, 0),
      endRot: new THREE.Euler(Math.PI / 2, 0, 0),
      startProgress: 0.46,
      endProgress: 0.72,
      noiseOffset: 2.1,
    });

    // Right Seat Cushion
    const rightSeatGroup = createPlushCushion(cushionW, cushionD, cushionH, cushionR, terracottaCushionMat);
    rightSeatGroup.rotation.x = Math.PI / 2;
    rightSeatGroup.position.set(0.73, 0.08, 0.02);
    sofaModelGroup.add(rightSeatGroup);

    parts.push({
      mesh: rightSeatGroup,
      name: 'Right Terracotta Seat Cushion',
      startPos: new THREE.Vector3(0.75, 0.48, 0.18),
      endPos: new THREE.Vector3(0.73, 0.08, 0.02),
      startRot: new THREE.Euler(Math.PI / 2 - 0.14, -0.06, 0.04),
      endRot: new THREE.Euler(Math.PI / 2, 0, 0),
      startProgress: 0.48,
      endProgress: 0.74,
      noiseOffset: 2.4,
    });

    // ─────────────────────────────────────────────────────────────
    // PARTS 9, 10, 11: THREE ERGONOMIC TERRACOTTA BACKREST CUSHIONS
    // ─────────────────────────────────────────────────────────────
    const backW = 0.69;
    const backH = 0.42;
    const backDepth = 0.12;
    const backR = 0.06;

    // Left Back Cushion
    const leftBackGroup = createPlushCushion(backW, backH, backDepth, backR, terracottaCushionMat);
    leftBackGroup.position.set(-0.73, 0.38, -0.22);
    leftBackGroup.rotation.x = 0.18;
    sofaModelGroup.add(leftBackGroup);

    parts.push({
      mesh: leftBackGroup,
      name: 'Left Terracotta Backrest Cushion',
      startPos: new THREE.Vector3(-0.74, 0.82, -0.12),
      endPos: new THREE.Vector3(-0.73, 0.38, -0.22),
      startRot: new THREE.Euler(0.38, 0.08, -0.04),
      endRot: new THREE.Euler(0.18, 0, 0),
      startProgress: 0.58,
      endProgress: 0.80,
      noiseOffset: 2.7,
    });

    // Center Back Cushion
    const centerBackGroup = createPlushCushion(backW, backH, backDepth, backR, terracottaCushionMat);
    centerBackGroup.position.set(0, 0.38, -0.22);
    centerBackGroup.rotation.x = 0.18;
    sofaModelGroup.add(centerBackGroup);

    parts.push({
      mesh: centerBackGroup,
      name: 'Center Terracotta Backrest Cushion',
      startPos: new THREE.Vector3(0, 0.88, -0.15),
      endPos: new THREE.Vector3(0, 0.38, -0.22),
      startRot: new THREE.Euler(0.40, 0, 0),
      endRot: new THREE.Euler(0.18, 0, 0),
      startProgress: 0.60,
      endProgress: 0.82,
      noiseOffset: 3.0,
    });

    // Right Back Cushion
    const rightBackGroup = createPlushCushion(backW, backH, backDepth, backR, terracottaCushionMat);
    rightBackGroup.position.set(0.73, 0.38, -0.22);
    rightBackGroup.rotation.x = 0.18;
    sofaModelGroup.add(rightBackGroup);

    parts.push({
      mesh: rightBackGroup,
      name: 'Right Terracotta Backrest Cushion',
      startPos: new THREE.Vector3(0.74, 0.82, -0.12),
      endPos: new THREE.Vector3(0.73, 0.38, -0.22),
      startRot: new THREE.Euler(0.38, -0.08, 0.04),
      endRot: new THREE.Euler(0.18, 0, 0),
      startProgress: 0.62,
      endProgress: 0.84,
      noiseOffset: 3.3,
    });

    // ─────────────────────────────────────────────────────────────
    // PARTS 12 & 13: TWO PLUMP ACCENT THROW PILLOWS
    // ─────────────────────────────────────────────────────────────
    const pillowSize = 0.32;
    const pillowDepth = 0.08;

    // Left Pillow
    const leftPillowGroup = createPlushCushion(pillowSize, pillowSize, pillowDepth, 0.06, pillowMat, false);
    leftPillowGroup.position.set(-0.86, 0.22, 0.12);
    leftPillowGroup.rotation.set(0.14, 0.44, -0.16);
    sofaModelGroup.add(leftPillowGroup);

    parts.push({
      mesh: leftPillowGroup,
      name: 'Left Accent Throw Pillow',
      startPos: new THREE.Vector3(-1.05, 1.05, 0.18),
      endPos: new THREE.Vector3(-0.86, 0.22, 0.12),
      startRot: new THREE.Euler(0.45, 0.65, -0.32),
      endRot: new THREE.Euler(0.14, 0.44, -0.16),
      startProgress: 0.70,
      endProgress: 0.85,
      noiseOffset: 3.6,
    });

    // Right Pillow
    const rightPillowGroup = createPlushCushion(pillowSize, pillowSize, pillowDepth, 0.06, pillowMat, false);
    rightPillowGroup.position.set(0.86, 0.22, 0.12);
    rightPillowGroup.rotation.set(0.14, -0.44, 0.16);
    sofaModelGroup.add(rightPillowGroup);

    parts.push({
      mesh: rightPillowGroup,
      name: 'Right Accent Throw Pillow',
      startPos: new THREE.Vector3(1.05, 1.05, 0.18),
      endPos: new THREE.Vector3(0.86, 0.22, 0.12),
      startRot: new THREE.Euler(0.45, -0.65, 0.32),
      endRot: new THREE.Euler(0.14, -0.44, 0.16),
      startProgress: 0.72,
      endProgress: 0.85,
      noiseOffset: 3.9,
    });

    // Immediately position every part at its air-suspended start position
    parts.forEach((p) => {
      p.mesh.position.copy(p.startPos);
      p.mesh.rotation.copy(p.startRot);
    });

    console.log('JODO SOFA ASSEMBLED! Total components:', parts.length);
    if (typeof window !== 'undefined') {
      (window as any).__SOFA_SCENE__ = { scene, camera, sofaGroup, parts };
    }

    partsRef.current = parts;

    // 6. Setup Lenis Smooth Scroll
    let lenis: Lenis | null = null;
    let updateLenis: ((time: number) => void) | null = null;
    try {
      lenis = new Lenis({
        duration: 1.25,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        smoothWheel: true,
        touchMultiplier: 1.8,
      });

      lenis.on('scroll', ScrollTrigger.update);

      updateLenis = (time: number) => {
        lenis?.raf(time * 1000);
      };
      gsap.ticker.add(updateLenis);
      gsap.ticker.lagSmoothing(0);
    } catch {
      // Fallback
    }

    // Scroll progress handler with sound triggers
    const handleScrollProgress = (p: number) => {
      setProgress(p);
      if (!soundEngine.enabled && p > 0.04) {
        soundEngine.enabled = true;
      }

      // Sound triggers on milestone arrivals
      if (p >= 0.28 && !soundTriggersRef.current.legs) {
        soundTriggersRef.current.legs = true;
        soundEngine.playWoodTap(1.15, 0.2);
      } else if (p < 0.28) {
        soundTriggersRef.current.legs = false;
      }

      if (p >= 0.38 && !soundTriggersRef.current.feet) {
        soundTriggersRef.current.feet = true;
        soundEngine.playBrassLock(0.12);
      } else if (p < 0.38) {
        soundTriggersRef.current.feet = false;
      }

      if (p >= 0.65 && !soundTriggersRef.current.body) {
        soundTriggersRef.current.body = true;
        soundEngine.playWoodTap(0.75, 0.28); // Deep resonant cushion thud
      } else if (p < 0.65) {
        soundTriggersRef.current.body = false;
      }

      if (p >= 0.80 && !soundTriggersRef.current.pillows) {
        soundTriggersRef.current.pillows = true;
        soundEngine.playWoodTap(1.0, 0.18);
      } else if (p < 0.80) {
        soundTriggersRef.current.pillows = false;
      }

      if (p >= 0.85 && !soundTriggersRef.current.complete) {
        soundTriggersRef.current.complete = true;
        soundEngine.playAssemblyComplete();
        setIsFullyAssembled(true);
      } else if (p < 0.85) {
        soundTriggersRef.current.complete = false;
        setIsFullyAssembled(false);
      }

      if (shadowPlaneRef.current) {
        const shadowMat = shadowPlaneRef.current.material as THREE.MeshBasicMaterial;
        shadowMat.opacity = 0.10 + p * 0.48;
        shadowPlaneRef.current.scale.set(0.7 + p * 0.4, 0.7 + p * 0.4, 1);
      }
    };

    // 7. GSAP ScrollTrigger Integration
    const scrollTrigger = ScrollTrigger.create({
      trigger: container,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.2,
      onUpdate: (self) => {
        handleScrollProgress(self.progress);
      },
    });

    // Native scroll calculation fallback (100% reliable across all environments)
    const onNativeScroll = () => {
      if (!container) return;
      const maxScroll = Math.max(1, container.scrollHeight - window.innerHeight);
      const currentScroll = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      const directP = Math.max(0, Math.min(1, currentScroll / maxScroll));
      handleScrollProgress(directP);
    };

    window.addEventListener('scroll', onNativeScroll, { passive: true });

    // Refresh trigger after mount
    requestAnimationFrame(() => {
      lenis?.resize();
      ScrollTrigger.refresh();
      onNativeScroll();
    });
    const resizeTimer = setTimeout(() => {
      lenis?.resize();
      ScrollTrigger.refresh();
      onNativeScroll();
    }, 250);

    // Dynamic transform calculation for floating in air and assembly on scroll
    const updatePartsTransformation = (prog: number, time: number) => {
      // Assembly happens from progress 0.0 to 0.84
      const assemblyP = Math.min(1, prog / 0.84);

      partsRef.current.forEach((part) => {
        const localP = THREE.MathUtils.clamp(
          (assemblyP - part.startProgress) / (part.endProgress - part.startProgress),
          0,
          1
        );
        const eased = gsap.parseEase('power2.out')(localP);

        // Breathing floating motion while mid-air (strongest at start, settling as assembled)
        const hoverIntensity = (1 - localP) * 0.025;
        const hoverY = Math.sin(time * 1.5 + part.noiseOffset) * hoverIntensity;
        const hoverX = Math.cos(time * 1.2 + part.noiseOffset) * (hoverIntensity * 0.3);
        const hoverRot = Math.sin(time * 1.4 + part.noiseOffset) * (hoverIntensity * 0.4);

        part.mesh.position.x =
          THREE.MathUtils.lerp(part.startPos.x, part.endPos.x, eased) + hoverX;
        part.mesh.position.y =
          THREE.MathUtils.lerp(part.startPos.y, part.endPos.y, eased) + hoverY;
        part.mesh.position.z = THREE.MathUtils.lerp(part.startPos.z, part.endPos.z, eased);

        part.mesh.rotation.x =
          THREE.MathUtils.lerp(part.startRot.x, part.endRot.x, eased) + hoverRot;
        part.mesh.rotation.y =
          THREE.MathUtils.lerp(part.startRot.y, part.endRot.y, eased) + hoverRot * 0.5;
        part.mesh.rotation.z =
          THREE.MathUtils.lerp(part.startRot.z, part.endRot.z, eased) + hoverRot * 0.7;
      });
    };

    // 8. Render Loop with Inertia Turntable & Zero-Gravity Float
    let frameId: number;
    const clock = new THREE.Clock();

    const render = () => {
      const time = clock.getElapsedTime();

      // Read real-time progress
      let currentProgress = scrollTrigger && scrollTrigger.progress !== undefined ? scrollTrigger.progress : 0;
      if (container) {
        const maxScroll = Math.max(1, container.scrollHeight - window.innerHeight);
        const currentScroll = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
        const directP = Math.max(0, Math.min(1, currentScroll / maxScroll));
        if (Math.abs(directP - currentProgress) > 0.02) {
          currentProgress = directP;
        }
      }

      // Animate parts
      updatePartsTransformation(currentProgress, time);

      // Handle sofa orientation:
      // When assembled (progress >= 0.85), turntable drag or gentle ambient drift
      // When assembling / floating in air, hold heroic front-facing three-quarter angle
      if (currentProgress >= 0.85) {
        if (!isPointerDown.current) {
          // Slow ambient idle drift
          dragRotation.current.currentY += 0.0015;
          // Apply residual drag velocity with smooth friction
          dragRotation.current.currentY += dragRotation.current.vx;
          dragRotation.current.currentX += dragRotation.current.vy;
          dragRotation.current.vx *= 0.92;
          dragRotation.current.vy *= 0.92;
        }
        sofaGroup.rotation.y = dragRotation.current.currentY;
        sofaGroup.rotation.x = Math.max(-0.25, Math.min(0.35, dragRotation.current.currentX));
      } else {
        // Controlled front 3/4 perspective: front of the sofa ALWAYS faces the viewer!
        const targetRotY = THREE.MathUtils.lerp(BASE_ROT_Y - 0.08, BASE_ROT_Y, currentProgress);
        const targetRotX = THREE.MathUtils.lerp(BASE_ROT_X + 0.04, BASE_ROT_X, currentProgress);
        sofaGroup.rotation.y = THREE.MathUtils.lerp(sofaGroup.rotation.y, targetRotY, 0.08);
        sofaGroup.rotation.x = THREE.MathUtils.lerp(sofaGroup.rotation.x, targetRotX, 0.08);
        dragRotation.current.currentY = targetRotY;
        dragRotation.current.currentX = targetRotX;
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);

    // 9. Resize Handler
    const handleResize = () => {
      if (!canvas || !renderer || !camera) return;
      updateCameraDistance();
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
      lenis?.resize();
      ScrollTrigger.refresh();
      onNativeScroll();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(resizeTimer);
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', onNativeScroll);
      if (updateLenis) gsap.ticker.remove(updateLenis);
      lenis?.destroy();
      scrollTrigger.kill();
      renderer.dispose();
      partsRef.current.forEach((p) => {
        p.mesh.traverse((c) => {
          if (c instanceof THREE.Mesh) {
            c.geometry.dispose();
            if (Array.isArray(c.material)) {
              c.material.forEach((m) => m.dispose());
            } else if (c.material) {
              c.material.dispose();
            }
          }
        });
      });
    };
  }, [BASE_ROT_X, BASE_ROT_Y]);

  // Pointer Drag Handlers for 360 Turntable
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!soundEngine.enabled) soundEngine.enabled = true;
    if (!isFullyAssembled || e.button !== 0) return;
    isPointerDown.current = true;
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPointerDown.current || !isFullyAssembled) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    if (e.pointerType === 'touch') {
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        dragRotation.current.vx = dx * 0.008;
      }
    } else {
      dragRotation.current.vx = dx * 0.008;
      dragRotation.current.vy = dy * 0.006;
      dragRotation.current.currentY += dx * 0.008;
      dragRotation.current.currentX += dy * 0.006;
    }
  };

  const handlePointerUp = () => {
    isPointerDown.current = false;
    setIsDragging(false);
  };

  // Coming Soon text calculation: emerges gracefully once sofa finishes assembly (progress >= 0.82)
  const comingSoonOpacity = Math.max(0, Math.min(1, (progress - 0.82) / 0.14));
  const comingSoonY = (1 - comingSoonOpacity) * 24;

  return (
    <div
      ref={containerRef}
      style={{
        height: '520vh',
        position: 'relative',
      }}
    >
      {/* Fixed Sticky Full-Screen Viewport */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          width: '100%',
          height: '100vh',
          overflow: 'hidden',
          backgroundColor: '#F4EBDD',
          userSelect: 'none',
          touchAction: 'pan-y',
        }}
      >
        {/* 1. TOP-LEFT CORNER: JODO LOGO */}
        <div
          style={{
            position: 'absolute',
            top: '24px',
            left: '28px',
            zIndex: 100,
            pointerEvents: 'auto',
          }}
        >
          <img
            src="/logo-cropped.png"
            alt="JODO"
            style={{
              width: '115px',
              maxWidth: '28vw',
              height: 'auto',
              display: 'block',
              mixBlendMode: 'multiply',
              userSelect: 'none',
            }}
          />
        </div>

        {/* 2. COMING SOON EDITORIAL HEADLINE (Emerges upon assembly) */}
        <div
          style={{
            position: 'absolute',
            top: 'clamp(24px, 5vh, 48px)',
            left: '50%',
            transform: `translate(-50%, ${comingSoonY}px)`,
            width: '100%',
            textAlign: 'center',
            padding: '0 20px',
            pointerEvents: 'none',
            zIndex: 40,
            opacity: comingSoonOpacity,
            display: comingSoonOpacity > 0.01 ? 'block' : 'none',
            transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
          }}
        >
          <h1
            style={{
              color: '#C65F45',
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: 'clamp(2.2rem, 6.8vw, 5.2rem)',
              letterSpacing: '0.08em',
              lineHeight: 1.0,
              textTransform: 'uppercase',
              textShadow: '0 4px 24px rgba(198, 95, 69, 0.15)',
              margin: 0,
            }}
          >
            COMING SOON
          </h1>
        </div>

        {/* 3. THE 3D CANVAS: CLEAN ARCHITECTURAL SOFA ASSEMBLES ON SCROLL */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            touchAction: 'pan-y',
            zIndex: 10,
            cursor: isDragging ? 'grabbing' : isFullyAssembled ? 'grab' : 'default',
            pointerEvents: isFullyAssembled ? 'auto' : 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        {/* 4. CENTER BELOW: BRAND TAGLINE + SCROLL INDICATOR */}
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
