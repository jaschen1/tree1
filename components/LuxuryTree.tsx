import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeState } from '../types';
import { randomPointInCone, randomPointInSphere } from '../utils/math';

interface LuxuryTreeProps {
  treeState: TreeState;
  extraRotationVelocity?: React.MutableRefObject<number>;
  userTextureUrls: string[];
  isPhotoFocused: boolean;
}

const NEEDLE_COUNT = 15000; 
const ORNAMENT_COUNT = 180; // Adjusted count after removing white particles
const TREE_HEIGHT = 12;
const TREE_RADIUS = 4.5;
const CHAOS_RADIUS = 15;

// Tree vertical bounds based on randomPointInCone logic
// y goes from (0 - 0.2)*H to (1 - 0.2)*H -> -2.4 to 9.6
const TREE_TOP_Y = 0.8 * TREE_HEIGHT; 

enum OrnamentType {
  SPHERE = 0,
  BOX = 1,
  GEM = 2,
  USER = 3,
  HEPTAGRAM = 4
}

const SantaHat = () => {
    return (
        <group position={[0, TREE_TOP_Y + 0.2, 0]} rotation={[0.1, 0, 0.1]}>
            {/* Brim */}
            <mesh position={[0, 0, 0]}>
                <torusGeometry args={[0.5, 0.2, 16, 32]} />
                <meshStandardMaterial color="#ffffff" roughness={1} />
            </mesh>
            {/* Main Cone */}
            <mesh position={[0, 0.8, 0]}>
                <coneGeometry args={[0.45, 1.8, 32]} />
                <meshStandardMaterial color="#D40000" roughness={0.6} />
            </mesh>
            {/* Tip Ball (slightly offset to look droopy) */}
            <mesh position={[0, 1.7, 0]}>
                <sphereGeometry args={[0.22, 16, 16]} />
                <meshStandardMaterial color="#ffffff" roughness={1} />
            </mesh>
        </group>
    );
};

// Helper to create an irregular 7-pointed star shape
const createHeptagramShape = () => {
    const shape = new THREE.Shape();
    const points = 7;
    const outerRadiusBase = 1.0;
    const innerRadiusBase = 0.5;

    for (let i = 0; i < points * 2; i++) {
        const angle = (i / (points * 2)) * Math.PI * 2;
        const isTip = i % 2 === 0;
        
        // Add "Irregularity" by varying the radius slightly per point
        const variance = Math.sin(i * 123.45) * 0.15; 
        
        const r = isTip 
            ? outerRadiusBase + variance 
            : innerRadiusBase + variance * 0.5;

        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;

        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
};

// Double-sided photo frame with narrow gold border
const createFramedGeometry = () => {
    const frameW = 1.6;
    const frameH = 2.0;
    const frameD = 0.08; 
    const photoW = 1.5;
    const photoH = 1.9;
    
    const box = new THREE.BoxGeometry(frameW, frameH, frameD);
    const boxNonIndexed = box.toNonIndexed();
    
    const front = new THREE.PlaneGeometry(photoW, photoH);
    front.translate(0, 0, frameD/2 + 0.001); 
    const frontNonIndexed = front.toNonIndexed();

    const back = new THREE.PlaneGeometry(photoW, photoH);
    back.rotateY(Math.PI); 
    back.translate(0, 0, -frameD/2 - 0.001); 
    const backNonIndexed = back.toNonIndexed();
    
    const boxCount = boxNonIndexed.attributes.position.count;
    const frontCount = frontNonIndexed.attributes.position.count;
    const backCount = backNonIndexed.attributes.position.count;
    const totalVerts = boxCount + frontCount + backCount;
    
    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);

    let vOffset = 0;
    positions.set(boxNonIndexed.attributes.position.array, vOffset * 3);
    normals.set(boxNonIndexed.attributes.normal.array, vOffset * 3);
    uvs.set(boxNonIndexed.attributes.uv.array, vOffset * 2);
    vOffset += boxCount;

    positions.set(frontNonIndexed.attributes.position.array, vOffset * 3);
    normals.set(frontNonIndexed.attributes.normal.array, vOffset * 3);
    uvs.set(frontNonIndexed.attributes.uv.array, vOffset * 2);
    vOffset += frontCount;

    positions.set(backNonIndexed.attributes.position.array, vOffset * 3);
    normals.set(backNonIndexed.attributes.normal.array, vOffset * 3);
    uvs.set(backNonIndexed.attributes.uv.array, vOffset * 2);
    vOffset += backCount;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    geo.addGroup(0, boxCount, 0); 
    geo.addGroup(boxCount, frontCount + backCount, 1); 

    return geo;
};

export const LuxuryTree: React.FC<LuxuryTreeProps> = ({ treeState, extraRotationVelocity, userTextureUrls, isPhotoFocused }) => {
  const groupRef = useRef<THREE.Group>(null);
  const needlesRef = useRef<THREE.Points>(null);
  const { camera } = useThree();
  
  const sphereMeshRef = useRef<THREE.InstancedMesh>(null);
  const boxMeshRef = useRef<THREE.InstancedMesh>(null);
  const gemMeshRef = useRef<THREE.InstancedMesh>(null);
  const userMeshRefs = useRef<THREE.InstancedMesh[]>([]);
  const heptagramMeshRef = useRef<THREE.InstancedMesh>(null);

  const [loadedTextures, setLoadedTextures] = useState<THREE.Texture[]>([]);

  // Texture for "Glass" look - SHARPER VERSION
  const glassTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; 
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0,0,64,64);
        ctx.beginPath();
        ctx.arc(32, 32, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
        ctx.fill();
        const gradient = ctx.createRadialGradient(32, 32, 12, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)'); 
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');     
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  // Material adjustments: Reduced envMapIntensity and increased roughness slightly for less glare
  const goldFrameMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#FFD700",
    metalness: 0.9,
    roughness: 0.3,
    clearcoat: 0.8,
    envMapIntensity: 1.2
  }), []);
  
  const heptagramMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#CFB53B", // Old Gold
    metalness: 0.8,
    roughness: 0.5,
    envMapIntensity: 1.0
  }), []);

  const framedGeometry = useMemo(() => createFramedGeometry(), []);
  
  const heptagramGeometry = useMemo(() => {
      const shape = createHeptagramShape();
      const extrudeSettings = { 
          depth: 0.2, 
          bevelEnabled: true, 
          bevelThickness: 0.05, 
          bevelSize: 0.05, 
          bevelSegments: 2 
      };
      return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, []);

  useEffect(() => {
    if (userTextureUrls.length > 0) {
      const loader = new THREE.TextureLoader();
      const promises = userTextureUrls.map(url => 
        new Promise<THREE.Texture>((resolve) => {
            loader.load(url, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.minFilter = THREE.LinearMipMapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.generateMipmaps = true;
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
  const [activeFocusIndex, setActiveFocusIndex] = useState<number>(-1);
  const prevFocusState = useRef(false);

  const needleData = useMemo(() => {
    const chaos = new Float32Array(NEEDLE_COUNT * 3);
    const target = new Float32Array(NEEDLE_COUNT * 3);
    const colors = new Float32Array(NEEDLE_COUNT * 3);
    
    const color1 = new THREE.Color("#4ade80"); 
    const color2 = new THREE.Color("#10b981"); 
    const color3 = new THREE.Color("#064e3b"); 
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

      const r = Math.random();
      if (r < 0.33) tempColor.copy(color1);
      else if (r < 0.66) tempColor.copy(color2);
      else tempColor.copy(color3);
      
      tempColor.offsetHSL(0, 0.1, (Math.random() - 0.5) * 0.2);

      colors[i * 3] = tempColor.r;
      colors[i * 3 + 1] = tempColor.g;
      colors[i * 3 + 2] = tempColor.b;
    }
    return { chaos, target, colors };
  }, []);

  const { ornamentData, counts, userCounts } = useMemo(() => {
    const data = [];
    const sphereColors = [new THREE.Color("#FFD700"), new THREE.Color("#C5A000"), new THREE.Color("#8B0000"), new THREE.Color("#004225"), new THREE.Color("#C0C0C0")];
    const boxColors = [new THREE.Color("#8B0000"), new THREE.Color("#FFFFFF"), new THREE.Color("#D4AF37")];
    const gemColors = [new THREE.Color("#FFFFFF"), new THREE.Color("#E0FFFF")];

    let sCount = 0, bCount = 0, gCount = 0, hCount = 0;
    const uCounts = new Array(Math.max(1, loadedTextures.length)).fill(0);
    
    for (let i = 0; i < ORNAMENT_COUNT; i++) {
      let tPos = randomPointInCone(TREE_HEIGHT, TREE_RADIUS * 0.95);
      const cPos = randomPointInSphere(CHAOS_RADIUS * 1.3);
      
      let type = OrnamentType.SPHERE;
      const rand = Math.random();
      let textureIndex = -1;
      
      if (loadedTextures.length > 0 && rand > 0.85) {
        type = OrnamentType.USER;
        textureIndex = Math.floor(Math.random() * loadedTextures.length);
        uCounts[textureIndex]++;
        
        const sectionR = Math.random();
        let normalizedH = 0.5; 
        if (sectionR < 0.15) normalizedH = Math.random() * 0.2;
        else if (sectionR > 0.85) normalizedH = 0.8 + Math.random() * 0.2;
        else normalizedH = 0.2 + (Math.random() + Math.random())/2 * 0.6; 

        const yMin = -0.2 * TREE_HEIGHT;
        const yMax = 0.8 * TREE_HEIGHT;
        const yRange = yMax - yMin;
        const finalY = yMin + normalizedH * yRange;
        const distFromTip = yMax - finalY;
        const currentRadius = (distFromTip / yRange) * TREE_RADIUS * 1.1; 
        const angle = Math.random() * Math.PI * 2;
        tPos = new THREE.Vector3(Math.cos(angle) * currentRadius, finalY, Math.sin(angle) * currentRadius);

      } else {
        if (rand < 0.15) { type = OrnamentType.HEPTAGRAM; hCount++; }
        else if (rand < 0.50) { type = OrnamentType.SPHERE; sCount++; } 
        else if (rand < 0.75) { type = OrnamentType.BOX; bCount++; } 
        else { type = OrnamentType.GEM; gCount++; }
      }

      let color = new THREE.Color();
      let scale = new THREE.Vector3(1, 1, 1);
      const baseScale = 0.2 + Math.random() * 0.2;

      if (type === OrnamentType.SPHERE) {
        color = sphereColors[Math.floor(Math.random() * sphereColors.length)];
        scale.setScalar(baseScale);
      } else if (type === OrnamentType.BOX) {
        color = boxColors[Math.floor(Math.random() * boxColors.length)];
        const sx = baseScale * (0.8 + Math.random() * 0.4);
        scale.set(sx, sx, sx);
      } else if (type === OrnamentType.GEM) {
        color = gemColors[Math.floor(Math.random() * gemColors.length)];
        scale.setScalar(baseScale * 0.8); 
      } else if (type === OrnamentType.USER) {
        scale.setScalar(baseScale * 3.0); 
      } else if (type === OrnamentType.HEPTAGRAM) {
        color = new THREE.Color("#CFB53B"); 
        scale.setScalar(baseScale * 1.2); 
      }

      let localIndex = 0;
      if (type === OrnamentType.SPHERE) localIndex = sCount - 1;
      if (type === OrnamentType.BOX) localIndex = bCount - 1;
      if (type === OrnamentType.GEM) localIndex = gCount - 1;
      if (type === OrnamentType.USER) localIndex = uCounts[textureIndex] - 1;
      if (type === OrnamentType.HEPTAGRAM) localIndex = hCount - 1;

      let rotAxis = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();
      let rotSpeed = (Math.random() - 0.5) * 2.0;

      // Override for FIXED items (Heptagrams)
      if (type === OrnamentType.HEPTAGRAM) {
          rotSpeed = 0; 
          rotAxis = new THREE.Vector3(0, 1, 0); 
      }

      data.push({
        id: i, tPos, cPos, type, color, scale, textureIndex, localIndex,
        phase: Math.random() * Math.PI * 2, 
        rotSpeed,
        rotationAxis: rotAxis
      });
    }

    return { 
        ornamentData: data, 
        counts: { sphere: sCount, box: bCount, gem: gCount, heptagram: hCount }, 
        userCounts: uCounts 
    };
  }, [loadedTextures.length]);

  const currentProgress = useRef(0);
  const focusProgress = useRef(0);
  const dummyObj = useMemo(() => new THREE.Object3D(), []);

  useFrame((state, delta) => {
    if (!groupRef.current || !needlesRef.current) return;

    if (isPhotoFocused && !prevFocusState.current) {
        const worldRot = groupRef.current.rotation.y;
        let minDist = Infinity;
        let nearestId = -1;

        ornamentData.forEach(orn => {
            if (orn.type !== OrnamentType.USER) return;
            const p = currentProgress.current;
            const invP = 1 - p;
            const bx = orn.cPos.x * invP + orn.tPos.x * p;
            const by = orn.cPos.y * invP + orn.tPos.y * p;
            const bz = orn.cPos.z * invP + orn.tPos.z * p;
            const wx = bx * Math.cos(worldRot) + bz * Math.sin(worldRot);
            const wy = by;
            const wz = -bx * Math.sin(worldRot) + bz * Math.cos(worldRot);
            const d = (wx - camera.position.x)**2 + (wy - camera.position.y)**2 + (wz - camera.position.z)**2;
            if (d < minDist) { minDist = d; nearestId = orn.id; }
        });
        if (nearestId !== -1) setActiveFocusIndex(nearestId);
    }
    prevFocusState.current = isPhotoFocused;

    const targetProgress = treeState === TreeState.FORMED ? 1 : 0;
    currentProgress.current = THREE.MathUtils.lerp(currentProgress.current, targetProgress, delta * 4.0);
    const p = currentProgress.current;
    const invP = 1 - p;

    const targetFocus = isPhotoFocused ? 1 : 0;
    focusProgress.current = THREE.MathUtils.lerp(focusProgress.current, targetFocus, delta * 5.0);
    const fp = focusProgress.current;
    
    const time = state.clock.elapsedTime;
    const positions = needlesRef.current.geometry.attributes.position;
    
    // Animate Needles
    for (let i = 0; i < NEEDLE_COUNT; i++) {
      let x = needleData.chaos[i * 3] * invP + needleData.target[i * 3] * p;
      let y = needleData.chaos[i * 3 + 1] * invP + needleData.target[i * 3 + 1] * p;
      let z = needleData.chaos[i * 3 + 2] * invP + needleData.target[i * 3 + 2] * p;

      // SPATIAL WAVE for consistency
      if (p > 0.1) {
          const waveAmp = 0.05 * p; 
          const waveFreq = 1.5;
          const spatialPhase = needleData.target[i * 3] * 0.5 + needleData.target[i * 3 + 1] * 0.5;
          
          x += Math.sin(time * waveFreq + spatialPhase) * waveAmp;
          y += Math.cos(time * waveFreq * 0.8 + spatialPhase) * waveAmp * 0.5; 
          z += Math.sin(time * waveFreq * 1.2 + spatialPhase) * waveAmp;
      }

      positions.setXYZ(i, x, y, z);
    }
    positions.needsUpdate = true;

    const globalScale = THREE.MathUtils.lerp(1.5, 1.0, p);
    const userShrinkFactor = THREE.MathUtils.lerp(1.5, 0.3, p);
    const focusPos = new THREE.Vector3(0, 4, state.camera.position.z - 5);

    ornamentData.forEach((orn) => {
        let x = orn.cPos.x * invP + orn.tPos.x * p;
        let y = orn.cPos.y * invP + orn.tPos.y * p;
        let z = orn.cPos.z * invP + orn.tPos.z * p;
        
        const isFixed = (orn.type === OrnamentType.HEPTAGRAM);
        
        // Apply SAME Spatial Wave logic to ornaments to maintain relative distance
        if (p > 0.1) {
            const waveAmp = 0.05 * p; 
            const waveFreq = 1.5;
            const spatialPhase = orn.tPos.x * 0.5 + orn.tPos.y * 0.5;

            x += Math.sin(time * waveFreq + spatialPhase) * waveAmp;
            y += Math.cos(time * waveFreq * 0.8 + spatialPhase) * waveAmp * 0.5; 
            z += Math.sin(time * waveFreq * 1.2 + spatialPhase) * waveAmp;
        }
        
        if (p > 0.5 && !isFixed) {
             y += Math.sin(time + orn.phase) * 0.05;
        }

        const isTarget = (orn.id === activeFocusIndex);
        dummyObj.rotation.set(0, 0, 0);
        
        let breathe = 1.0;
        if (!isFixed) {
            breathe = 1.0 + Math.sin(time * 3 + orn.phase) * 0.05;
        }
        
        const currentScaleVec = orn.scale.clone().multiplyScalar(globalScale * breathe);
        if (orn.type === OrnamentType.USER) currentScaleVec.multiplyScalar(userShrinkFactor);

        if (isTarget && fp > 0.01) {
            const invRotY = -groupRef.current!.rotation.y;
            const targetX = focusPos.x * Math.cos(invRotY) - focusPos.z * Math.sin(invRotY);
            const targetZ = focusPos.x * Math.sin(invRotY) + focusPos.z * Math.cos(invRotY);
            const targetY = focusPos.y; 
            x = THREE.MathUtils.lerp(x, targetX, fp);
            y = THREE.MathUtils.lerp(y, targetY, fp);
            z = THREE.MathUtils.lerp(z, targetZ, fp);
            dummyObj.scale.lerpVectors(currentScaleVec, new THREE.Vector3(3.0, 3.0, 3.0), fp);
            dummyObj.position.set(x, y, z);
            const vCam = camera.position.clone();
            groupRef.current?.worldToLocal(vCam);
            dummyObj.lookAt(vCam);
        } else {
            dummyObj.position.set(x, y, z);
            
            if (isFixed) {
                dummyObj.lookAt(0, y, 0); 
                dummyObj.rotateY(Math.PI); 
                dummyObj.rotateZ(orn.phase); 
            } else if (orn.type === OrnamentType.USER) {
               dummyObj.rotation.y = time * 0.2 + orn.phase;
               dummyObj.rotation.x = Math.sin(time * 0.5 + orn.phase) * 0.1;
            } else {
               dummyObj.rotateOnAxis(orn.rotationAxis, time * orn.rotSpeed + orn.phase);
            }
            dummyObj.scale.copy(currentScaleVec);
        }
        dummyObj.updateMatrix();

        if (orn.type === OrnamentType.SPHERE && sphereMeshRef.current) {
            sphereMeshRef.current.setMatrixAt(orn.localIndex, dummyObj.matrix);
            sphereMeshRef.current.setColorAt(orn.localIndex, orn.color);
        } else if (orn.type === OrnamentType.BOX && boxMeshRef.current) {
            boxMeshRef.current.setMatrixAt(orn.localIndex, dummyObj.matrix);
            boxMeshRef.current.setColorAt(orn.localIndex, orn.color);
        } else if (orn.type === OrnamentType.GEM && gemMeshRef.current) {
            gemMeshRef.current.setMatrixAt(orn.localIndex, dummyObj.matrix);
            gemMeshRef.current.setColorAt(orn.localIndex, orn.color);
        } else if (orn.type === OrnamentType.HEPTAGRAM && heptagramMeshRef.current) {
            heptagramMeshRef.current.setMatrixAt(orn.localIndex, dummyObj.matrix);
        } else if (orn.type === OrnamentType.USER && userMeshRefs.current[orn.textureIndex]) {
            userMeshRefs.current[orn.textureIndex].setMatrixAt(orn.localIndex, dummyObj.matrix);
        }
    });

    if (sphereMeshRef.current) {
        sphereMeshRef.current.instanceMatrix.needsUpdate = true;
        if (sphereMeshRef.current.instanceColor) sphereMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (boxMeshRef.current) {
        boxMeshRef.current.instanceMatrix.needsUpdate = true;
        if (boxMeshRef.current.instanceColor) boxMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (gemMeshRef.current) {
        gemMeshRef.current.instanceMatrix.needsUpdate = true;
        if (gemMeshRef.current.instanceColor) gemMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (heptagramMeshRef.current) heptagramMeshRef.current.instanceMatrix.needsUpdate = true;
    userMeshRefs.current.forEach(mesh => { if (mesh) mesh.instanceMatrix.needsUpdate = true; });

    if (extraRotationVelocity && !isPhotoFocused) {
        velocity.current += extraRotationVelocity.current * 0.2; 
        extraRotationVelocity.current = 0; 
    }
    
    velocity.current *= 0.85;

    const idleSpeed = 0.00005; 
    if (treeState === TreeState.FORMED && Math.abs(velocity.current) < 0.001 && !isPhotoFocused) {
        velocity.current += (idleSpeed - velocity.current) * 0.01;
    }
    
    groupRef.current.rotation.y += velocity.current;
  });

  return (
    <group ref={groupRef}>
      {treeState === TreeState.FORMED && <SantaHat />}

      <points ref={needlesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={NEEDLE_COUNT} array={needleData.chaos} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={NEEDLE_COUNT} array={needleData.colors} itemSize={3} />
        </bufferGeometry>
        {/* Adjusted Size and AlphaTest to prevent disappearing particles at distance */}
        <pointsMaterial 
            map={glassTexture}
            vertexColors 
            size={0.45} // Increased size to help visibility at distance
            sizeAttenuation={true} 
            transparent={true} 
            opacity={0.95} 
            alphaTest={0.15} // Lower alphaTest prevents culling of small distant particles
            depthWrite={false}
            blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Existing Ornaments */}
      <instancedMesh ref={sphereMeshRef} args={[undefined, undefined, counts.sphere]}>
        <sphereGeometry args={[1, 64, 64]} /> 
        <meshPhysicalMaterial metalness={0.8} roughness={0.2} clearcoat={1.0} clearcoatRoughness={0.2} envMapIntensity={1.0} />
      </instancedMesh>
      <instancedMesh ref={boxMeshRef} args={[undefined, undefined, counts.box]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial metalness={0.3} roughness={0.5} envMapIntensity={0.8} />
      </instancedMesh>
      <instancedMesh ref={gemMeshRef} args={[undefined, undefined, counts.gem]}>
        <octahedronGeometry args={[1, 0]} />
        <meshPhysicalMaterial color="#ffffff" metalness={0.9} roughness={0.1} envMapIntensity={1.5} emissive="#ffffff" emissiveIntensity={0.1} />
      </instancedMesh>

      {/* Heptagrams only */}
      <instancedMesh ref={heptagramMeshRef} args={[undefined, undefined, counts.heptagram]} geometry={heptagramGeometry} material={heptagramMaterial} />

      {/* User Photos */}
      {loadedTextures.map((tex, i) => (
            <instancedMesh key={i} ref={el => { if(el) userMeshRefs.current[i] = el; }} args={[undefined, undefined, userCounts[i]]} geometry={framedGeometry} material={[goldFrameMaterial, new THREE.MeshStandardMaterial({ map: tex, metalness: 0.1, roughness: 0.4, color: '#ffffff' })]} />
      ))}
    </group>
  );
};