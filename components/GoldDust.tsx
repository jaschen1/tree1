import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeState } from '../types';

const COUNT = 2000;

interface GoldDustProps {
  treeState: TreeState;
}

export const GoldDust: React.FC<GoldDustProps> = ({ treeState }) => {
  const { viewport } = useThree();
  const pointsRef = useRef<THREE.Points>(null);
  
  const progressRef = useRef(0);

  // Generate a soft glow texture for circular particles
  const glowTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        // Radial gradient for soft, glowing circle
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');     // Hot center
        gradient.addColorStop(0.2, 'rgba(255, 240, 200, 0.9)'); // Warm core
        gradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.3)');   // Gold glow
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');           // Fade out
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  const data = useMemo(() => {
    const chaos = new Float32Array(COUNT * 3);
    const target = new Float32Array(COUNT * 3);
    const current = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    
    for (let i = 0; i < COUNT; i++) {
      // 1. CHAOS
      chaos[i * 3] = (Math.random() - 0.5) * 30;
      chaos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      chaos[i * 3 + 2] = (Math.random() - 0.5) * 20;

      // 2. TARGET (Spiral)
      const h = (Math.random() - 0.5) * 14; 
      const relH = (h + 7) / 14; 
      const radius = (1 - relH) * 5.5 + 0.5; 
      const angle = h * 2 + (i % 2 === 0 ? 0 : Math.PI); 
      
      target[i * 3] = Math.cos(angle) * radius;
      target[i * 3 + 1] = h + 1; 
      target[i * 3 + 2] = Math.sin(angle) * radius;

      // Initialize
      current[i * 3] = chaos[i * 3];
      current[i * 3 + 1] = chaos[i * 3 + 1];
      current[i * 3 + 2] = chaos[i * 3 + 2];

      velocities[i * 3] = 0;
      velocities[i * 3 + 1] = 0;
      velocities[i * 3 + 2] = 0;
    }
    return { chaos, target, current, velocities };
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;

    const targetP = treeState === TreeState.FORMED ? 1 : 0;
    // FAST MORPH: Lerp fast
    progressRef.current = THREE.MathUtils.lerp(progressRef.current, targetP, delta * 3.0);
    const p = progressRef.current;
    
    const positionsAttribute = pointsRef.current.geometry.attributes.position;
    
    for (let i = 0; i < COUNT; i++) {
      const idx = i * 3;
      
      const homeX = data.chaos[idx] * (1 - p) + data.target[idx] * p;
      const homeY = data.chaos[idx + 1] * (1 - p) + data.target[idx + 1] * p;
      const homeZ = data.chaos[idx + 2] * (1 - p) + data.target[idx + 2] * p;

      let px = positionsAttribute.getX(i);
      let py = positionsAttribute.getY(i);
      let pz = positionsAttribute.getZ(i);

      // Physics - Strong springs for snappy movement
      const springStr = p > 0.5 ? 0.08 : 0.05;
      data.velocities[idx] += (homeX - px) * springStr;
      data.velocities[idx + 1] += (homeY - py) * springStr;
      data.velocities[idx + 2] += (homeZ - pz) * springStr;

      if (p > 0.8) {
        // Slow spiral spin
        const angle = Math.atan2(pz, px);
        const tangX = -Math.sin(angle);
        const tangZ = Math.cos(angle);
        
        data.velocities[idx] += tangX * 0.003;
        data.velocities[idx + 2] += tangZ * 0.003;
      }

      // Normal friction
      data.velocities[idx] *= 0.90;
      data.velocities[idx + 1] *= 0.90;
      data.velocities[idx + 2] *= 0.90;

      px += data.velocities[idx];
      py += data.velocities[idx + 1];
      pz += data.velocities[idx + 2];

      positionsAttribute.setXYZ(i, px, py, pz);
    }

    positionsAttribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={COUNT}
          array={data.current}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        map={glowTexture}
        size={0.25} 
        color="#FFD700"
        transparent={true}
        opacity={0.9}
        sizeAttenuation={true}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};