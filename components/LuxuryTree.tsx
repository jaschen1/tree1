import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeState } from '../types';
import { randomPointInCone, randomPointInSphere } from '../utils/math';

interface LuxuryTreeProps {
  treeState: TreeState;
  extraRotationVelocity?: React.MutableRefObject<number>;
  userTextureUrls: string[];
}

const NEEDLE_COUNT = 12000;
const ORNAMENT_COUNT = 150;
const TREE_HEIGHT = 12;
const TREE_RADIUS = 4.5;
const CHAOS_RADIUS = 15;

export const LuxuryTree: React.FC<LuxuryTreeProps> = ({ treeState, extraRotationVelocity, userTextureUrls }) => {
  const groupRef = useRef<THREE.Group>(null);
  const needlesRef = useRef<THREE.Points>(null);
  
  const meshRefs = useRef<THREE.InstancedMesh[]>([]);
  const [loadedTextures, setLoadedTextures] = useState<THREE.Texture[]>([]);

  useEffect(() => {
    if (userTextureUrls.length > 0) {
      const loader = new THREE.TextureLoader();
      const promises = userTextureUrls.map(url => 
        new Promise<THREE.Texture>((resolve) => {
            loader.load(url, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                resolve(tex);
            });
        })
      );
      Promise.all(promises).then(textures => setLoadedTextures(textures));
    } else {
      setLoadedTextures([]);
    }
  }, [userTextureUrls]);

  const velocity = useRef(0);
  
  // --- Geometry Generation ---
  
  // 1. Needles (Foliage)
  const needleData = useMemo(() => {
    const chaos = new Float32Array(NEEDLE_COUNT * 3);
    const target = new Float32Array(NEEDLE_COUNT * 3);
    const colors = new Float32Array(NEEDLE_COUNT * 3);
    
    const color1 = new THREE.Color("#004b23");
    const color2 = new THREE.Color("#046307");
    const tempColor = new THREE.Color();

    for (let i = 0; i < NEEDLE_COUNT; i++) {
      const tPos = randomPointInCone(TREE_HEIGHT, TREE_RADIUS);
      target[i * 3] = tPos.x;
      target[i * 3 + 1] = tPos.y;
      target[i * 3 + 2] = tPos.z;

      const cPos = randomPointInSphere(CHAOS_RADIUS);
      chaos[i * 3] = cPos.x;
      chaos[i * 3 + 1] = cPos.y;
      chaos[i * 3 + 2] = cPos.z;

      tempColor.lerpColors(color1, color2, Math.random());
      colors[i * 3] = tempColor.r;
      colors[i * 3 + 1] = tempColor.g;
      colors[i * 3 + 2] = tempColor.b;
    }
    return { chaos, target, colors };
  }, []);

  // 2. Ornaments (Spheres)
  const { ornamentData, distribution, counts } = useMemo(() => {
    const data = [];
    const colorPalette = [
      new THREE.Color("#FFD700"), // Gold
      new THREE.Color("#B8860B"), // Dark Gold
      new THREE.Color("#8B0000"), // Deep Red
      new THREE.Color("#FFFFFF"), // Diamond
    ];

    for (let i = 0; i < ORNAMENT_COUNT; i++) {
      const tPos = randomPointInCone(TREE_HEIGHT, TREE_RADIUS * 0.9);
      const cPos = randomPointInSphere(CHAOS_RADIUS * 1.2);
      
      data.push({
        tPos,
        cPos,
        color: colorPalette[Math.floor(Math.random() * colorPalette.length)],
        scale: 0.3 + Math.random() * 0.4, 
        phase: Math.random() * Math.PI * 2,
      });
    }

    const dist: { meshIndex: number; localIndex: number }[] = [];
    const localCounts: number[] = new Array(loadedTextures.length + 1).fill(0); 

    data.forEach((_, i) => {
        let assignedTextureIndex = -1;
        
        if (loadedTextures.length > 0 && Math.random() > 0.3) {
            assignedTextureIndex = Math.floor(Math.random() * loadedTextures.length);
        }

        const meshIdx = assignedTextureIndex + 1;
        dist.push({
            meshIndex: meshIdx,
            localIndex: localCounts[meshIdx]
        });
        localCounts[meshIdx]++;
    });

    return { ornamentData: data, distribution: dist, counts: localCounts };
  }, [loadedTextures.length]);

  const currentProgress = useRef(0);
  const dummyObj = useMemo(() => new THREE.Object3D(), []);

  // --- Animation Loop ---
  useFrame((state, delta) => {
    if (!groupRef.current || !needlesRef.current) return;

    const targetProgress = treeState === TreeState.FORMED ? 1 : 0;
    
    // FAST MORPH: High Lerp Speed (Quick Snap)
    currentProgress.current = THREE.MathUtils.lerp(currentProgress.current, targetProgress, delta * 4.0);
    
    const p = currentProgress.current;
    const invP = 1 - p;

    // Needles
    const positions = needlesRef.current.geometry.attributes.position;
    for (let i = 0; i < NEEDLE_COUNT; i++) {
      const x = needleData.chaos[i * 3] * invP + needleData.target[i * 3] * p;
      const y = needleData.chaos[i * 3 + 1] * invP + needleData.target[i * 3 + 1] * p;
      const z = needleData.chaos[i * 3 + 2] * invP + needleData.target[i * 3 + 2] * p;
      positions.setXYZ(i, x, y, z);
    }
    positions.needsUpdate = true;

    // Ornaments
    // Normal animation speed (no time dilation)
    const time = state.clock.elapsedTime; 

    // Dynamic Scale Multiplier
    const scaleMultiplier = THREE.MathUtils.lerp(1.5, 0.5, p);

    ornamentData.forEach((orn, i) => {
        const x = orn.cPos.x * invP + orn.tPos.x * p;
        const y = orn.cPos.y * invP + orn.tPos.y * p;
        const z = orn.cPos.z * invP + orn.tPos.z * p;
        
        dummyObj.position.set(x, y, z);
        
        // Gentle, slow spin
        dummyObj.rotation.set(
            Math.sin(time + orn.phase) * 0.5,
            Math.cos(time + orn.phase) * 0.5,
            0
        );
        
        const scaleWobble = orn.scale * scaleMultiplier * (0.95 + Math.sin(time * 2 + orn.phase) * 0.05);
        dummyObj.scale.setScalar(scaleWobble);
        
        dummyObj.updateMatrix();

        const { meshIndex, localIndex } = distribution[i];
        const mesh = meshRefs.current[meshIndex];
        
        if (mesh) {
            mesh.setMatrixAt(localIndex, dummyObj.matrix);
            if (meshIndex === 0) {
                mesh.setColorAt(localIndex, orn.color);
            }
        }
    });

    meshRefs.current.forEach(mesh => {
        if (mesh) {
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
    });

    // 3. RESPONSIVE ROTATION PHYSICS
    if (extraRotationVelocity) {
        // High input sensitivity: Immediate reaction
        velocity.current += extraRotationVelocity.current * 0.8; 
        extraRotationVelocity.current = 0; // Consume input immediately
    }
    
    // High Friction / Fast Decay: "Stop quickly"
    // Multiplying by a lower number means velocity dies out faster per frame
    velocity.current *= 0.75; 

    // Minimal idle drift just to keep it alive, but basically stopped
    const idleSpeed = 0.0001;
    if (treeState === TreeState.FORMED && Math.abs(velocity.current) < 0.001) {
        velocity.current += (idleSpeed - velocity.current) * 0.01;
    }
    
    groupRef.current.rotation.y += velocity.current;
  });

  return (
    <group ref={groupRef}>
      <points ref={needlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={NEEDLE_COUNT}
            array={needleData.chaos}
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

      {/* 0. Default Mesh (Spheres) */}
      <instancedMesh 
        ref={el => { if(el) meshRefs.current[0] = el; }} 
        args={[undefined, undefined, counts[0]]}
      >
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial 
            metalness={0.9} 
            roughness={0.1} 
            emissive="#443300"
            emissiveIntensity={0.2}
        />
      </instancedMesh>

      {/* 1..N Texture Meshes (Photos on Spheres) */}
      {loadedTextures.map((tex, i) => (
        <instancedMesh
            key={i}
            ref={el => { if(el) meshRefs.current[i + 1] = el; }}
            args={[undefined, undefined, counts[i + 1]]}
        >
            <sphereGeometry args={[1, 32, 32]} />
            <meshStandardMaterial 
                map={tex}
                metalness={0.2}
                roughness={0.5}
                color="#ffffff"
            />
        </instancedMesh>
      ))}

    </group>
  );
};