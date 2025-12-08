import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeState } from '../types';

const COUNT = 1200; // Increased particle count for better spiral

interface GoldDustProps {
  treeState: TreeState;
}

export const GoldDust: React.FC<GoldDustProps> = ({ treeState }) => {
  const { viewport } = useThree();
  const pointsRef = useRef<THREE.Points>(null);
  
  // Progress tracker for morphing
  const progressRef = useRef(0);

  // Generate Chaos and Target (Spiral) positions
  const data = useMemo(() => {
    const chaos = new Float32Array(COUNT * 3);
    const target = new Float32Array(COUNT * 3);
    const current = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    
    for (let i = 0; i < COUNT; i++) {
      // 1. CHAOS: Random Sphere/Box
      chaos[i * 3] = (Math.random() - 0.5) * 30;
      chaos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      chaos[i * 3 + 2] = (Math.random() - 0.5) * 20;

      // 2. TARGET: Double Helix Spiral around the tree
      // Height from -6 to 6
      const h = (Math.random() - 0.5) * 14; 
      // Tapered radius: wider at bottom
      // Normalize h (-7 to 7) -> 0 (top) to 1 (bottom) approximately
      const relH = (h + 7) / 14; 
      const radius = relH * 5.5 + 0.5; // Base radius 6, Top radius 0.5
      
      const angle = h * 2 + (i % 2 === 0 ? 0 : Math.PI); // Two intertwined spirals
      
      target[i * 3] = Math.cos(angle) * radius;
      target[i * 3 + 1] = h + 1; // Shift up slightly
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

    // 1. Update State Progress
    const targetP = treeState === TreeState.FORMED ? 1 : 0;
    progressRef.current = THREE.MathUtils.lerp(progressRef.current, targetP, delta * 2);
    const p = progressRef.current;
    
    const positionsAttribute = pointsRef.current.geometry.attributes.position;
    
    for (let i = 0; i < COUNT; i++) {
      const idx = i * 3;
      
      // Calculate Morph Target Position (Base position without physics)
      // Interpolate between Chaos and Spiral
      const homeX = data.chaos[idx] * (1 - p) + data.target[idx] * p;
      const homeY = data.chaos[idx + 1] * (1 - p) + data.target[idx + 1] * p;
      const homeZ = data.chaos[idx + 2] * (1 - p) + data.target[idx + 2] * p;

      // Current physics position
      let px = positionsAttribute.getX(i);
      let py = positionsAttribute.getY(i);
      let pz = positionsAttribute.getZ(i);

      // --- Physics ---

      // 1. Attraction to Home (Morphing Force)
      // Stronger when formed to keep shape, looser when chaos
      const springStr = p > 0.5 ? 0.05 : 0.02;
      data.velocities[idx] += (homeX - px) * springStr;
      data.velocities[idx + 1] += (homeY - py) * springStr;
      data.velocities[idx + 2] += (homeZ - pz) * springStr;

      // 2. Spiral Spin Effect (When Formed)
      if (p > 0.8) {
        // Add tangential velocity for spinning aura
        const angle = Math.atan2(pz, px);
        // const rad = Math.sqrt(px*px + pz*pz);
        const tangX = -Math.sin(angle);
        const tangZ = Math.cos(angle);
        
        data.velocities[idx] += tangX * 0.01;
        data.velocities[idx + 2] += tangZ * 0.01;
      }

      // 3. Damping
      data.velocities[idx] *= 0.92;
      data.velocities[idx + 1] *= 0.92;
      data.velocities[idx + 2] *= 0.92;

      // Update
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
        size={0.15}
        color="#FFD700"
        transparent
        opacity={0.8}
        sizeAttenuation={true}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};