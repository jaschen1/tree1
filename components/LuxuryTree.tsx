import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeState } from '../types';
import { randomPointInCone, randomPointInSphere } from '../utils/math';

interface LuxuryTreeProps {
  treeState: TreeState;
  extraRotationVelocity?: React.MutableRefObject<number>;
}

const NEEDLE_COUNT = 12000;
const ORNAMENT_COUNT = 150;
const TREE_HEIGHT = 12;
const TREE_RADIUS = 4.5;
const CHAOS_RADIUS = 15;

export const LuxuryTree: React.FC<LuxuryTreeProps> = ({ treeState, extraRotationVelocity }) => {
  const groupRef = useRef<THREE.Group>(null);
  const needlesRef = useRef<THREE.Points>(null);
  const ornamentsRef = useRef<THREE.InstancedMesh>(null);
  
  // Physics State (Inertia)
  const velocity = useRef(0);
  
  // --- Geometry Generation ---
  
  // 1. Needles (Foliage) Data
  const needleData = useMemo(() => {
    const chaos = new Float32Array(NEEDLE_COUNT * 3);
    const target = new Float32Array(NEEDLE_COUNT * 3);
    const colors = new Float32Array(NEEDLE_COUNT * 3);
    
    const color1 = new THREE.Color("#004b23"); // Deep Emerald
    const color2 = new THREE.Color("#046307"); // Lighter Green
    const tempColor = new THREE.Color();

    for (let i = 0; i < NEEDLE_COUNT; i++) {
      // Target (Cone)
      const tPos = randomPointInCone(TREE_HEIGHT, TREE_RADIUS);
      target[i * 3] = tPos.x;
      target[i * 3 + 1] = tPos.y;
      target[i * 3 + 2] = tPos.z;

      // Chaos (Sphere)
      const cPos = randomPointInSphere(CHAOS_RADIUS);
      chaos[i * 3] = cPos.x;
      chaos[i * 3 + 1] = cPos.y;
      chaos[i * 3 + 2] = cPos.z;

      // Color variation
      tempColor.lerpColors(color1, color2, Math.random());
      colors[i * 3] = tempColor.r;
      colors[i * 3 + 1] = tempColor.g;
      colors[i * 3 + 2] = tempColor.b;
    }
    return { chaos, target, colors };
  }, []);

  // 2. Ornaments Data
  const ornamentData = useMemo(() => {
    const data = [];
    const colorPalette = [
      new THREE.Color("#FFD700"), // Gold
      new THREE.Color("#B8860B"), // Dark Gold
      new THREE.Color("#8B0000"), // Deep Red (Classic luxury accent)
      new THREE.Color("#FFFFFF"), // Diamond/Light
    ];

    for (let i = 0; i < ORNAMENT_COUNT; i++) {
      const tPos = randomPointInCone(TREE_HEIGHT, TREE_RADIUS * 0.9); // Slightly inside foliage
      const cPos = randomPointInSphere(CHAOS_RADIUS * 1.2);
      
      data.push({
        tPos,
        cPos,
        color: colorPalette[Math.floor(Math.random() * colorPalette.length)],
        scale: 0.2 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
      });
    }
    return { data };
  }, []);

  // Animation Refs
  const currentProgress = useRef(0);
  const dummyObj = useMemo(() => new THREE.Object3D(), []);

  // --- Animation Loop ---
  useFrame((state, delta) => {
    if (!groupRef.current || !needlesRef.current || !ornamentsRef.current) return;

    // 1. Handle Morphing Progress
    const targetProgress = treeState === TreeState.FORMED ? 1 : 0;
    // Smooth lerp for state transition
    currentProgress.current = THREE.MathUtils.lerp(currentProgress.current, targetProgress, delta * 1.5);
    const p = currentProgress.current;
    const invP = 1 - p;

    // 2. Animate Needles
    const positions = needlesRef.current.geometry.attributes.position;
    for (let i = 0; i < NEEDLE_COUNT; i++) {
      const x = needleData.chaos[i * 3] * invP + needleData.target[i * 3] * p;
      const y = needleData.chaos[i * 3 + 1] * invP + needleData.target[i * 3 + 1] * p;
      const z = needleData.chaos[i * 3 + 2] * invP + needleData.target[i * 3 + 2] * p;
      positions.setXYZ(i, x, y, z);
    }
    positions.needsUpdate = true;

    // 3. Animate Ornaments (InstancedMesh)
    ornamentData.data.forEach((orn, i) => {
        // Interpolate position
        const x = orn.cPos.x * invP + orn.tPos.x * p;
        const y = orn.cPos.y * invP + orn.tPos.y * p;
        const z = orn.cPos.z * invP + orn.tPos.z * p;
        
        dummyObj.position.set(x, y, z);
        
        // Add subtle rotation to ornaments
        dummyObj.rotation.set(
            Math.sin(state.clock.elapsedTime + orn.phase) * 0.5,
            Math.cos(state.clock.elapsedTime + orn.phase) * 0.5,
            0
        );
        
        // Scale wobble
        const scaleWobble = orn.scale * (0.9 + Math.sin(state.clock.elapsedTime * 2 + orn.phase) * 0.1);
        dummyObj.scale.setScalar(scaleWobble);
        
        dummyObj.updateMatrix();
        ornamentsRef.current!.setMatrixAt(i, dummyObj.matrix);
        ornamentsRef.current!.setColorAt(i, orn.color);
    });
    ornamentsRef.current.instanceMatrix.needsUpdate = true;
    if (ornamentsRef.current.instanceColor) ornamentsRef.current.instanceColor.needsUpdate = true;

    // 4. Handle Physics & Rotation
    
    // Add external hand velocity if provided
    if (extraRotationVelocity) {
        velocity.current += extraRotationVelocity.current;
        // Dampen external source slightly to prevent infinite buildup from noise
        extraRotationVelocity.current *= 0.8; 
    }

    // Friction / Decay
    velocity.current *= 0.96;
    
    // Auto spin if formed and idle
    if (treeState === TreeState.FORMED && Math.abs(velocity.current) < 0.001) {
        velocity.current += 0.0001; // Gentle ambient spin
    }

    groupRef.current.rotation.y += velocity.current;
  });

  return (
    <group ref={groupRef}>
      {/* Needles */}
      <points ref={needlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={NEEDLE_COUNT}
            array={needleData.chaos} // Initial buffer
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={NEEDLE_COUNT}
            array={needleData.colors}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.12}
          sizeAttenuation={true}
          transparent={true}
          opacity={0.9}
        />
      </points>

      {/* Ornaments */}
      <instancedMesh ref={ornamentsRef} args={[undefined, undefined, ORNAMENT_COUNT]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial 
            metalness={0.9} 
            roughness={0.1} 
            emissive="#443300"
            emissiveIntensity={0.2}
        />
      </instancedMesh>
    </group>
  );
};