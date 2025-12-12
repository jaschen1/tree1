import React, { useState, Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera, Html, useProgress, Environment } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { TreeState } from './types';
import { LuxuryTree } from './components/LuxuryTree';
import { GoldDust } from './components/GoldDust';
import { GoldenSpirals } from './components/GoldenSpirals';
import { AmbientParticles } from './components/AmbientParticles';
import { Overlay } from './components/Overlay';
import { CameraRig } from './components/CameraRig';

// Simple Loader Component
const Loader = () => {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="text-[#FFD700] font-serif tracking-widest text-lg bg-black/50 px-4 py-2 rounded border border-yellow-900/30 backdrop-blur-sm">
        LOADING {progress.toFixed(0)}%
      </div>
    </Html>
  );
};

const App: React.FC = () => {
  const [treeState, setTreeState] = useState<TreeState>(TreeState.CHAOS);
  const [zoomFactor, setZoomFactor] = useState(0.5); 
  const [userTextureUrls, setUserTextureUrls] = useState<string[]>([]);
  const [isPhotoFocused, setIsPhotoFocused] = useState(false);
  
  // Hand rotation replaced by mouse rotation
  const rotationVelocity = useRef(0);
  
  // Mouse/Touch Logic
  const isDragging = useRef(false);
  const lastX = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag if not interacting with UI (though UI usually stops propagation, this is a safety check)
    isDragging.current = true;
    lastX.current = e.clientX;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || isPhotoFocused) return;
    const deltaX = e.clientX - lastX.current;
    lastX.current = e.clientX;
    // Rotate tree based on drag
    rotationVelocity.current = deltaX * 0.005; 
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isPhotoFocused) return;
    // Zoom logic: Scroll up (negative delta) to zoom in (increase factor)
    const delta = e.deltaY * 0.001;
    setZoomFactor(prev => Math.max(0, Math.min(1, prev - delta)));
  };

  const handleUpload = (files: FileList) => {
    const urls: string[] = [];
    Array.from(files).forEach(file => {
      urls.push(URL.createObjectURL(file));
    });
    setUserTextureUrls(urls);
  };

  const handleGenerate = () => {
    setTreeState(TreeState.FORMED);
  };

  const toggleTreeState = () => {
      setTreeState(prev => prev === TreeState.CHAOS ? TreeState.FORMED : TreeState.CHAOS);
      // If we are formed, user might want to inspect photos, if chaos, they are scattered
      if (treeState === TreeState.FORMED) {
          setIsPhotoFocused(false);
      }
  };

  return (
    <div 
        className="relative w-full h-screen bg-black overflow-hidden touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
    >
      
      {/* 1. Canvas Layer */}
      <Canvas 
        dpr={[1, 1.5]} 
        gl={{ 
          antialias: false, 
          toneMappingExposure: 1.0, 
          alpha: false, 
          powerPreference: "high-performance",
          stencil: false,
          depth: true
        }}
      >
        <color attach="background" args={['#000000']} />
        {/* Adjusted fog to ensure visibility at max camera distance (65) */}
        <fog attach="fog" args={['#000000', 20, 100]} />

        <PerspectiveCamera makeDefault position={[0, 4, 20]} fov={45} />
        <CameraRig zoomFactor={zoomFactor} />

        {/* --- LIGHTING STRATEGY: HYBRID --- */}
        
        {/* 1. Base Lights: Instant load, ensures scene is never pitch black */}
        <hemisphereLight intensity={0.2} color="#ffffff" groundColor="#000000" />
        <ambientLight intensity={0.1} />
        
        <spotLight 
            position={[10, 20, 10]} 
            angle={0.5} 
            penumbra={1} 
            intensity={100} 
            color="#ffeebb" 
            castShadow 
            distance={50}
            decay={2}
        />
        <pointLight position={[-10, 5, -10]} intensity={50} color="#00ff44" distance={40} decay={2} />
        <pointLight position={[0, -5, 10]} intensity={30} color="#ffd700" distance={30} decay={2} />

        {/* 
            2. High Quality Environment (Async) 
            Wrapped in its OWN Suspense. If it hangs (network), 
            it does NOT block the tree or particles from rendering.
        */}
        <Suspense fallback={null}>
            <Environment 
                preset="lobby" 
                background={false} // Don't show the image as background, just use lighting
                blur={0.6}         // High blur for "dreamy" look
            />
        </Suspense>

        {/* Scene Content */}
        <AmbientParticles />
        <GoldDust treeState={treeState} />
        <GoldenSpirals treeState={treeState} />

        <Suspense fallback={<Loader />}>
            <LuxuryTree 
              treeState={treeState} 
              extraRotationVelocity={rotationVelocity}
              userTextureUrls={userTextureUrls}
              isPhotoFocused={isPhotoFocused}
            />
        </Suspense>

        {/* Post Processing for the Glow */}
        <EffectComposer enableNormalPass={false} multisampling={0}>
            {/* Reduced bloom intensity for softer look */}
            <Bloom 
                luminanceThreshold={0.8} 
                mipmapBlur 
                intensity={0.8} 
                radius={0.6}
            />
            <Vignette eskil={false} offset={0.1} darkness={0.8} />
        </EffectComposer>
      </Canvas>

      {/* 2. UI Overlay with Manual Controls */}
      <Overlay 
        currentState={treeState} 
        onToggle={toggleTreeState} 
        onUpload={handleUpload}
        onGenerate={handleGenerate}
        zoomLevel={zoomFactor}
        onZoomChange={setZoomFactor}
      />
      
    </div>
  );
};

export default App;