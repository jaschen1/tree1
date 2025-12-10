import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const GoldParticles = () => {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 2500; 

  const { positions, scales, offsets } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const offsets = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = 30 + Math.random() * 60; 
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      scales[i] = Math.random();
      offsets[i] = Math.random() * 100;
    }
    return { positions, scales, offsets };
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color("#FFD700") } 
  }), []);

  useFrame((state) => {
    if (pointsRef.current && pointsRef.current.material) {
        // @ts-ignore
        pointsRef.current.material.uniforms.uTime.value = state.clock.elapsedTime;
    }
    if(pointsRef.current) {
        pointsRef.current.rotation.y = state.clock.elapsedTime * 0.03;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aScale" count={count} array={scales} itemSize={1} />
        <bufferAttribute attach="attributes-aTimeOffset" count={count} array={offsets} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial 
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={`
          uniform float uTime;
          attribute float aScale;
          attribute float aTimeOffset;
          varying float vAlpha;
          
          void main() {
            vec3 pos = position;
            float driftSpeed = 0.2;
            pos.x += sin(uTime * driftSpeed + aTimeOffset) * 2.0;
            pos.y += cos(uTime * driftSpeed * 0.8 + aTimeOffset) * 2.0;
            pos.z += sin(uTime * driftSpeed * 0.5 + aTimeOffset * 0.5) * 1.0;
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = (3.0 * aScale + 1.0) * (40.0 / -mvPosition.z);
            float twinkle = sin(uTime * 2.0 + aTimeOffset);
            vAlpha = 0.3 + 0.7 * (0.5 + 0.5 * twinkle);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            vec2 center = vec2(0.5, 0.5);
            float dist = distance(gl_PointCoord, center);
            if (dist > 0.5) discard;
            float glow = 1.0 - (dist * 2.0);
            glow = pow(glow, 2.0);
            gl_FragColor = vec4(uColor, vAlpha * glow);
          }
        `}
      />
    </points>
  );
};

const SnowParticles = () => {
    const pointsRef = useRef<THREE.Points>(null);
    const count = 1500; 
  
    const { positions, scales, offsets } = useMemo(() => {
      const positions = new Float32Array(count * 3);
      const scales = new Float32Array(count);
      const offsets = new Float32Array(count);
  
      for (let i = 0; i < count; i++) {
        const r = 20 + Math.random() * 80; 
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = (Math.random() - 0.5) * 60; 
        positions[i * 3 + 2] = r * Math.cos(phi);
  
        scales[i] = Math.random();
        offsets[i] = Math.random() * 100;
      }
      return { positions, scales, offsets };
    }, []);
  
    const uniforms = useMemo(() => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#FFFFFF") } 
    }), []);
  
    useFrame((state) => {
      if (pointsRef.current && pointsRef.current.material) {
          // @ts-ignore
          pointsRef.current.material.uniforms.uTime.value = state.clock.elapsedTime;
      }
    });
  
    return (
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-aScale" count={count} array={scales} itemSize={1} />
          <bufferAttribute attach="attributes-aTimeOffset" count={count} array={offsets} itemSize={1} />
        </bufferGeometry>
        <shaderMaterial 
          transparent={true}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={uniforms}
          vertexShader={`
            uniform float uTime;
            attribute float aScale;
            attribute float aTimeOffset;
            varying float vAlpha;
            
            void main() {
              vec3 pos = position;
              
              // Downward Drift for Snow
              float fallSpeed = 0.5 + aScale * 0.5;
              pos.y -= mod(uTime * fallSpeed + aTimeOffset, 60.0) - 30.0; 
              pos.x += sin(uTime * 0.3 + aTimeOffset) * 1.5; 
              
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              
              // INCREASED SIZE MULTIPLIER (2.0 -> 8.0) for much bigger snow
              gl_PointSize = (8.0 * aScale + 2.0) * (40.0 / -mvPosition.z);
              
              vAlpha = 0.6 + 0.4 * sin(uTime + aTimeOffset);
            }
          `}
          fragmentShader={`
            uniform vec3 uColor;
            varying float vAlpha;
            void main() {
              vec2 center = vec2(0.5, 0.5);
              float dist = distance(gl_PointCoord, center);
              if (dist > 0.5) discard;
              
              float glow = 1.0 - (dist * 2.0);
              glow = pow(glow, 1.5);
              
              gl_FragColor = vec4(uColor, vAlpha * glow);
            }
          `}
        />
      </points>
    );
  };

export const AmbientParticles: React.FC = () => {
    return (
        <>
            <GoldParticles />
            <SnowParticles />
        </>
    );
};