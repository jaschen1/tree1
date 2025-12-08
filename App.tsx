import React, { useState, Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { TreeState } from './types';
import { LuxuryTree } from './components/LuxuryTree';
import { GoldDust } from './components/GoldDust';
import { AmbientParticles } from './components/AmbientParticles';
import { Overlay } from './components/Overlay';
import { HandController } from './components/HandController';
import { CameraRig } from './components/CameraRig';

const App: React.FC = () => {
  const [treeState, setTreeState] = useState<TreeState>(TreeState.CHAOS);
  const [zoomFactor, setZoomFactor] = useState(0.5); // 0.5 is default middle ground
  const [userTextureUrls, setUserTextureUrls] = useState<string[]>([]);
  const [isPhotoFocused, setIsPhotoFocused] = useState(false);
  
  // Ref for Y-axis rotation (spin) velocity
  const handRotationVelocity = useRef(0);

  const handleStateChangeFromHand = (newState: TreeState) => {
    // Lock state changes if focusing photo
    if (isPhotoFocused) return;
    setTreeState(newState);
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

  // We just pass a dummy toggle to Overlay if needed, or Overlay handles Generate separately
  const dummyToggle = () => {}; 

  return (
    <div className="relative w-full h-screen bg-[#000502]">
      
      {/* Hand Tracking Controller (Invisible/Overlay) */}
      <HandController 
        onStateChange={handleStateChangeFromHand}
        onZoomChange={(z) => {
            if (!isPhotoFocused) setZoomFactor(z);
        }}
        onRotateChange={(v) => {
          if (!isPhotoFocused) {
              handRotationVelocity.current = v;
          } else {
              handRotationVelocity.current = 0;
          }
        }}
        onPhotoFocusChange={setIsPhotoFocused}
      />

      {/* 1. Canvas Layer */}
      <Canvas 
        dpr={[1, 2]} 
        gl={{ antialias: false, toneMappingExposure: 1.5 }}
      >
        <PerspectiveCamera makeDefault position={[0, 4, 20]} fov={45} />
        <CameraRig zoomFactor={zoomFactor} />

        {/* Cinematic Lighting */}
        <ambientLight intensity={0.2} color="#001100" />
        <spotLight 
            position={[10, 20, 10]} 
            angle={0.3} 
            penumbra={1} 
            intensity={2} 
            color="#ffeebb" 
            castShadow 
        />
        <pointLight position={[-10, 5, -10]} intensity={1} color="#00ff44" />
        <pointLight position={[0, -5, 5]} intensity={0.5} color="#ffd700" />

        <Suspense fallback={null}>
            <Environment preset="lobby" background={false} blur={0.6} />
            
            {/* Background Layer: Persistent drifting stars */}
            <AmbientParticles />
            
            {/* The Main Stars */}
            <LuxuryTree 
              treeState={treeState} 
              extraRotationVelocity={handRotationVelocity}
              userTextureUrls={userTextureUrls}
              isPhotoFocused={isPhotoFocused}
            />
            {/* Foreground interactive dust */}
            <GoldDust treeState={treeState} />
        </Suspense>

        {/* Post Processing for the "Trump-esque" Glow */}
        <EffectComposer enableNormalPass={false}>
            <Bloom 
                luminanceThreshold={0.7} 
                mipmapBlur 
                intensity={1.2} 
                radius={0.6}
            />
            <Vignette eskil={false} offset={0.1} darkness={1.1} />
        </EffectComposer>
      </Canvas>

      {/* 2. UI Overlay */}
      <Overlay 
        currentState={treeState} 
        onToggle={dummyToggle} 
        onUpload={handleUpload}
        onGenerate={handleGenerate}
      />
      
    </div>
  );
};

export default App;