'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { soundEngine } from '@/audio/woodSound';
import { getBrassMaterial } from '@/textures/woodTexture';

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

    // Position sofa in optical center
    sofaGroup.position.set(0, -0.18, 0);
    sofaGroup.rotation.y = BASE_ROT_Y;
    sofaGroup.rotation.x = BASE_ROT_X;
    // Scale 1.55 gives a wide 3.4-unit designer presence perfectly framed inside the camera view
    sofaGroup.scale.setScalar(1.55);

    // Inner Model Group centered at geometric center
    // Center of GlamVelvetSofa: x = -0.019, y = 0.394, z = -0.116
    const sofaModelGroup = new THREE.Group();
    sofaModelGroup.position.set(0.019, -0.394, 0.116);
    sofaGroup.add(sofaModelGroup);

    // 5. Load Authentic Designer 3-Seater Sofa GLB
    const loader = new GLTFLoader();
    loader.load(
      '/models/glam_sofa.glb',
      (gltf) => {
        const root = gltf.scene;
        root.updateMatrixWorld(true);

        // Find primary meshes
        let legsMesh: THREE.Mesh | null = null;
        let fabricMesh: THREE.Mesh | null = null;
        let feetMesh: THREE.Mesh | null = null;

        root.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.name === 'GlamVelvetSofa_legs') legsMesh = child;
            if (child.name === 'GlamVelvetSofa_fabric') fabricMesh = child;
            if (child.name === 'GlamVelvetSofa_feet') feetMesh = child;
          }
        });

        if (!fabricMesh) return;

        // Signature JODO Terracotta cushion upholstery material
        const terracottaFabricMat = ((fabricMesh as THREE.Mesh).material as THREE.Material).clone();
        if ('color' in terracottaFabricMat) {
          (terracottaFabricMat as THREE.MeshPhysicalMaterial).color = new THREE.Color('#C65F45');
        }
        if ('sheenColor' in terracottaFabricMat && (terracottaFabricMat as THREE.MeshPhysicalMaterial).sheenColor) {
          (terracottaFabricMat as THREE.MeshPhysicalMaterial).sheenColor = new THREE.Color('#D87A63');
        }
        if ('specularColor' in terracottaFabricMat && (terracottaFabricMat as THREE.MeshPhysicalMaterial).specularColor) {
          (terracottaFabricMat as THREE.MeshPhysicalMaterial).specularColor = new THREE.Color('#E59A85');
        }
        (terracottaFabricMat as THREE.MeshPhysicalMaterial).roughness = 0.72;

        (fabricMesh as THREE.Mesh).material = terracottaFabricMat;

        const parts: ComponentPart[] = [];

        // Helper: Create soft, rounded accent throw pillow in matching terracotta
        const createPillow = (): THREE.Mesh => {
          const shape = new THREE.Shape();
          const w = 0.20, h = 0.20, r = 0.06;
          shape.moveTo(-w + r, -h);
          shape.lineTo(w - r, -h);
          shape.quadraticCurveTo(w, -h, w, -h + r);
          shape.lineTo(w, h - r);
          shape.quadraticCurveTo(w, h, w - r, h);
          shape.lineTo(-w + r, h);
          shape.quadraticCurveTo(-w, h, -w, h - r);
          shape.lineTo(-w, -h + r);
          shape.quadraticCurveTo(-w, -h, -w + r, -h);

          const geo = new THREE.ExtrudeGeometry(shape, {
            depth: 0.10,
            bevelEnabled: true,
            bevelSegments: 5,
            steps: 1,
            bevelSize: 0.05,
            bevelThickness: 0.05,
          });
          geo.center();
          const mesh = new THREE.Mesh(geo, terracottaFabricMat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          return mesh;
        };

        // 1. Architectural Leg Chassis Part (Hovers cleanly below the sofa body)
        if (legsMesh) {
          const legsWrapper = new THREE.Group();
          legsWrapper.add(legsMesh);
          sofaModelGroup.add(legsWrapper);

          parts.push({
            mesh: legsWrapper,
            name: 'Architectural Frame & Splayed Legs',
            startPos: new THREE.Vector3(0, -0.22, 0.0),
            endPos: new THREE.Vector3(0, 0, 0),
            startRot: new THREE.Euler(0.05, -0.02, 0.02),
            endRot: new THREE.Euler(0, 0, 0),
            startProgress: 0.0,
            endProgress: 0.36,
            noiseOffset: 0.2,
          });
        }

        // 2. Brass Feet Caps Part (Hovers cleanly just below the leg tips)
        if (feetMesh) {
          const feetWrapper = new THREE.Group();
          feetWrapper.add(feetMesh);
          sofaModelGroup.add(feetWrapper);

          parts.push({
            mesh: feetWrapper,
            name: 'Solid Brass Ferrule Glides',
            startPos: new THREE.Vector3(0, -0.38, 0.01),
            endPos: new THREE.Vector3(0, 0, 0),
            startRot: new THREE.Euler(0.08, 0.04, 0),
            endRot: new THREE.Euler(0, 0, 0),
            startProgress: 0.08,
            endProgress: 0.42,
            noiseOffset: 0.5,
          });
        }

        // 3. Complete Sculpted Terracotta Sofa Body (Floats as a whole, gorgeous luxury piece in mid-air)
        const bodyWrapper = new THREE.Group();
        bodyWrapper.add(fabricMesh);
        sofaModelGroup.add(bodyWrapper);

        parts.push({
          mesh: bodyWrapper,
          name: 'Sculpted Terracotta Sofa Body & Cushions',
          startPos: new THREE.Vector3(0, 0.38, 0.06),
          endPos: new THREE.Vector3(0, 0, 0),
          startRot: new THREE.Euler(-0.06, 0, 0),
          endRot: new THREE.Euler(0, 0, 0),
          startProgress: 0.20,
          endProgress: 0.70,
          noiseOffset: 1.0,
        });

        // 4. Left Luxury Corner Throw Pillow (Floating in air above the left arm, nestling into place)
        const leftPillow = createPillow();
        const leftPillowWrapper = new THREE.Group();
        leftPillowWrapper.add(leftPillow);
        sofaModelGroup.add(leftPillowWrapper);

        parts.push({
          mesh: leftPillowWrapper,
          name: 'Left Corner Accent Pillow',
          startPos: new THREE.Vector3(-0.85, 0.76, 0.22),
          endPos: new THREE.Vector3(-0.72, 0.45, 0.08),
          startRot: new THREE.Euler(0.35, 0.55, -0.2),
          endRot: new THREE.Euler(0.12, 0.40, -0.15),
          startProgress: 0.45,
          endProgress: 0.82,
          noiseOffset: 1.6,
        });

        // 5. Right Luxury Corner Throw Pillow (Floating in air above the right arm, nestling into place)
        const rightPillow = createPillow();
        const rightPillowWrapper = new THREE.Group();
        rightPillowWrapper.add(rightPillow);
        sofaModelGroup.add(rightPillowWrapper);

        parts.push({
          mesh: rightPillowWrapper,
          name: 'Right Corner Accent Pillow',
          startPos: new THREE.Vector3(0.85, 0.76, 0.22),
          endPos: new THREE.Vector3(0.72, 0.45, 0.08),
          startRot: new THREE.Euler(0.35, -0.55, 0.2),
          endRot: new THREE.Euler(0.12, -0.40, 0.15),
          startProgress: 0.48,
          endProgress: 0.84,
          noiseOffset: 2.1,
        });

        // Immediately position every part at its air-suspended start position so the page loads with the exploded view
        parts.forEach((p) => {
          p.mesh.position.copy(p.startPos);
          p.mesh.rotation.copy(p.startRot);
        });

        partsRef.current = parts;
      },
      undefined,
      (err) => {
        console.error('Failed to load 3D designer sofa:', err);
      }
    );

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
            top: '12%',
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
              fontSize: 'clamp(2.4rem, 8.5vw, 6.5rem)',
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
