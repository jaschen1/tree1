import React, { useState, Suspense, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera, Html, useProgress, Environment } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { TreeState } from './types';
import { LuxuryTree } from './components/LuxuryTree';
import { GoldDust } from './components/GoldDust';
import { GoldenSpirals } from './components/GoldenSpirals';
import { AmbientParticles } from './components/AmbientParticles';
import { CameraRig } from './components/CameraRig';
import { HandController } from './components/HandController';

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
  const [isPhotoFocused, setIsPhotoFocused] = useState(false);
  
  // Rotation velocity driven only by HandController now
  const rotationVelocity = useRef(0);
  
  // Hand Controller Callbacks
  const handleHandStateChange = useCallback((newState: TreeState) => {
    setTreeState(newState);
    if (newState === TreeState.FORMED) setIsPhotoFocused(false);
  }, [treeState]);

  const handleHandRotate = useCallback((velocity: number) => {
    if (Math.abs(velocity) > 0.0001) {
        rotationVelocity.current = velocity;
    }
  }, []);

  const handleHandZoom = useCallback((factor: number) => {
    setZoomFactor(factor);
  }, []);

  const handleHandFocus = useCallback((isFocused: boolean) => {
    setIsPhotoFocused(isFocused);
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden touch-none">
      
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
        <fog attach="fog" args={['#000000', 20, 100]} />

        <PerspectiveCamera makeDefault position={[0, 4, 20]} fov={45} />
        <CameraRig zoomFactor={zoomFactor} />

        {/* Lighting */}
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

        <Suspense fallback={null}>
            <Environment preset="lobby" background={false} blur={0.6} />
        </Suspense>

        {/* Scene Content */}
        <AmbientParticles />
        <GoldDust treeState={treeState} />
        <GoldenSpirals treeState={treeState} />

        <Suspense fallback={<Loader />}>
            <LuxuryTree 
              treeState={treeState} 
              extraRotationVelocity={rotationVelocity}
              userTextureUrls={[]} // Empty array since upload UI is removed
              isPhotoFocused={isPhotoFocused}
            />
        </Suspense>

        <EffectComposer enableNormalPass={false} multisampling={0}>
            <Bloom luminanceThreshold={0.8} mipmapBlur intensity={0.8} radius={0.6} />
            <Vignette eskil={false} offset={0.1} darkness={0.8} />
        </EffectComposer>
      </Canvas>

      {/* 2. Hand Controller (Main Input) */}
      <HandController 
        onStateChange={handleHandStateChange}
        onRotateChange={handleHandRotate}
        onZoomChange={handleHandZoom}
        onPhotoFocusChange={handleHandFocus}
      />
      
    </div>
  );
};

export default App;