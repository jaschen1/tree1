import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeState } from '../types';
import { randomPointInSphere } from '../utils/math';

interface GoldenSpiralsProps {
  treeState: TreeState;
}

const BASE_RADIUS = 5.0; 
const TOP_RADIUS = 0.2;
const LOOPS = 5.5; 
const STRANDS = 2; 
const PARTICLES_PER_STRAND = 600;
const TOTAL_PARTICLES = STRANDS * PARTICLES_PER_STRAND;
const CHAOS_RADIUS = 15;

export const GoldenSpirals: React.FC<GoldenSpiralsProps> = ({ treeState }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const progressRef = useRef(0);

  // Generate the glowing texture
  const glowTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');     
        gradient.addColorStop(0.2, 'rgba(255, 223, 100, 1)'); 
        gradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.4)');   
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');           
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  const data = useMemo(() => {
    const chaos = new Float32Array(TOTAL_PARTICLES * 3);
    const target = new Float32Array(TOTAL_PARTICLES * 3);
    const current = new Float32Array(TOTAL_PARTICLES * 3);
    
    for (let s = 0; s < STRANDS; s++) {
        const strandOffset = (Math.PI * 2 * s) / STRANDS; 

        for (let i = 0; i < PARTICLES_PER_STRAND; i++) {
            // --- Target Calculation (Spiral) ---
            const t = i / PARTICLES_PER_STRAND;
            const y = -2.0 + t * 11.0; 
            const currentRadius = THREE.MathUtils.lerp(BASE_RADIUS, TOP_RADIUS, t);
            const angle = t * Math.PI * 2 * LOOPS + strandOffset;

            const x = Math.cos(angle) * currentRadius;
            const z = Math.sin(angle) * currentRadius;

            // Jitter
            const jitterAmt = 0.15;
            const jx = (Math.random() - 0.5) * jitterAmt;
            const jy = (Math.random() - 0.5) * jitterAmt;
            const jz = (Math.random() - 0.5) * jitterAmt;

            const idx = (s * PARTICLES_PER_STRAND + i) * 3;
            target[idx] = x + jx;
            target[idx + 1] = y + jy;
            target[idx + 2] = z + jz;

            // --- Chaos Calculation (Sphere) ---
            const cPos = randomPointInSphere(CHAOS_RADIUS);
            chaos[idx] = cPos.x;
            chaos[idx + 1] = cPos.y;
            chaos[idx + 2] = cPos.z;

            // Initial Position (Chaos)
            current[idx] = chaos[idx];
            current[idx + 1] = chaos[idx + 1];
            current[idx + 2] = chaos[idx + 2];
        }
    }
    return { chaos, target, current };
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current || !materialRef.current) return;

    // 1. Transition Progress
    const targetP = treeState === TreeState.FORMED ? 1 : 0;
    progressRef.current = THREE.MathUtils.lerp(progressRef.current, targetP, delta * 2.5);
    const p = progressRef.current;
    const invP = 1 - p;

    // 2. Interpolate Positions
    const positions = pointsRef.current.geometry.attributes.position;
    for (let i = 0; i < TOTAL_PARTICLES; i++) {
        const idx = i * 3;
        const x = data.chaos[idx] * invP + data.target[idx] * p;
        const y = data.chaos[idx + 1] * invP + data.target[idx + 1] * p;
        const z = data.chaos[idx + 2] * invP + data.target[idx + 2] * p;
        positions.setXYZ(i, x, y, z);
    }
    positions.needsUpdate = true;

    // 3. Rotation & Animation
    pointsRef.current.rotation.y += delta * 0.1;
    pointsRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.2;

    // 4. Opacity - Always visible
    materialRef.current.opacity = THREE.MathUtils.lerp(materialRef.current.opacity, 1.0, delta);
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute 
            attach="attributes-position" 
            count={TOTAL_PARTICLES} 
            array={data.current} 
            itemSize={3} 
        />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
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