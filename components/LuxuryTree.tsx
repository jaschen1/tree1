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
const ORNAMENT_COUNT = 120; 
const TREE_HEIGHT = 12;
const TREE_RADIUS = 4.5;
const CHAOS_RADIUS = 15;

// Types of ornaments
enum OrnamentType {
  SPHERE = 0,
  BOX = 1,
  GEM = 2,
  USER = 3
}

// Helper to create the custom framed geometry
// Returns a BufferGeometry with 2 groups: 0 (Frame/Gold), 1 (Photo)
const createFramedGeometry = () => {
    const width = 1.5;
    const height = 1.8;
    const depth = 0.1;
    const border = 0.08; 

    // 1. Frame (Box) - Material Index 0
    const box = new THREE.BoxGeometry(width, height, depth);
    const boxNonIndexed = box.toNonIndexed();
    
    // 2. Front Photo (Plane) - Material Index 1
    const pW = width - border * 2;
    const pH = height - border * 2;
    const front = new THREE.PlaneGeometry(pW, pH);
    front.translate(0, 0, depth/2 + 0.005);
    const frontNonIndexed = front.toNonIndexed();

    // 3. Back Photo (Plane) - Material Index 1
    const back = new THREE.PlaneGeometry(pW, pH);
    back.rotateY(Math.PI);
    back.translate(0, 0, -depth/2 - 0.005);
    const backNonIndexed = back.toNonIndexed();
    
    // Baroque Ornaments (Corner Spheres)
    // We add 4 spheres to corners to give it that "Baroque" feel
    // Manually constructing small sphere geoms and merging is expensive here?
    // Let's keep it simple geometry for performance but add simple "studs"
    // For now, the "Baroque" comes from the double-bevel-ish look we can simulate or just the material.
    // Given the prompt "Baroque style border", let's make the top decoration.
    
    // Top Crown (Cylinder flattened)
    const crown = new THREE.CylinderGeometry(0.3, 0.1, 0.2, 8);
    crown.rotateX(Math.PI/2);
    crown.translate(0, height/2 + 0.1, 0);
    const crownNonIndexed = crown.toNonIndexed();

    // Merge attributes
    const parts = [boxNonIndexed, frontNonIndexed, backNonIndexed, crownNonIndexed];
    
    let totalVerts = 0;
    parts.forEach(p => totalVerts += p.attributes.position.count);
    
    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);

    let vOffset = 0;
    let boxVertCount = 0;
    let photoVertCount = 0;

    // Box
    positions.set(boxNonIndexed.attributes.position.array, vOffset * 3);
    normals.set(boxNonIndexed.attributes.normal.array, vOffset * 3);
    uvs.set(boxNonIndexed.attributes.uv.array, vOffset * 2);
    boxVertCount += boxNonIndexed.attributes.position.count;
    vOffset += boxNonIndexed.attributes.position.count;

    // Crown (Add to Frame Group)
    positions.set(crownNonIndexed.attributes.position.array, vOffset * 3);
    normals.set(crownNonIndexed.attributes.normal.array, vOffset * 3);
    uvs.set(crownNonIndexed.attributes.uv.array, vOffset * 2);
    boxVertCount += crownNonIndexed.attributes.position.count;
    vOffset += crownNonIndexed.attributes.position.count;

    // Front
    positions.set(frontNonIndexed.attributes.position.array, vOffset * 3);
    normals.set(frontNonIndexed.attributes.normal.array, vOffset * 3);
    uvs.set(frontNonIndexed.attributes.uv.array, vOffset * 2);
    photoVertCount += frontNonIndexed.attributes.position.count;
    vOffset += frontNonIndexed.attributes.position.count;

    // Back
    positions.set(backNonIndexed.attributes.position.array, vOffset * 3);
    normals.set(backNonIndexed.attributes.normal.array, vOffset * 3);
    uvs.set(backNonIndexed.attributes.uv.array, vOffset * 2);
    photoVertCount += backNonIndexed.attributes.position.count;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    geo.addGroup(0, boxVertCount, 0); 
    geo.addGroup(boxVertCount, photoVertCount, 1); 

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

  const [loadedTextures, setLoadedTextures] = useState<THREE.Texture[]>([]);

  const goldFrameMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#FFD700",
    metalness: 1.0,
    roughness: 0.15,
    clearcoat: 1.0,
    envMapIntensity: 2.0
  }), []);

  const framedGeometry = useMemo(() => createFramedGeometry(), []);

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
  
  // Track the currently focused ornament index
  const [activeFocusIndex, setActiveFocusIndex] = useState<number>(-1);
  const prevFocusState = useRef(false);

  // --- Geometry Generation ---
  const needleData = useMemo(() => {
    const chaos = new Float32Array(NEEDLE_COUNT * 3);
    const target = new Float32Array(NEEDLE_COUNT * 3);
    const colors = new Float32Array(NEEDLE_COUNT * 3);
    
    const color1 = new THREE.Color("#004b23"); 
    const color2 = new THREE.Color("#013220"); 
    const color3 = new THREE.Color("#0f5f30"); 
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
      
      tempColor.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);

      colors[i * 3] = tempColor.r;
      colors[i * 3 + 1] = tempColor.g;
      colors[i * 3 + 2] = tempColor.b;
    }
    return { chaos, target, colors };
  }, []);

  const { ornamentData, counts, userCounts } = useMemo(() => {
    const data = [];
    
    const sphereColors = [
      new THREE.Color("#FFD700"), 
      new THREE.Color("#C5A000"), 
      new THREE.Color("#8B0000"), 
      new THREE.Color("#004225"), 
      new THREE.Color("#C0C0C0"), 
    ];

    const boxColors = [
      new THREE.Color("#8B0000"), 
      new THREE.Color("#FFFFFF"), 
      new THREE.Color("#D4AF37"), 
    ];
    
    const gemColors = [
      new THREE.Color("#FFFFFF"), 
      new THREE.Color("#E0FFFF"), 
    ];

    let sCount = 0;
    let bCount = 0;
    let gCount = 0;
    const uCounts = new Array(Math.max(1, loadedTextures.length)).fill(0);
    
    for (let i = 0; i < ORNAMENT_COUNT; i++) {
      const tPos = randomPointInCone(TREE_HEIGHT, TREE_RADIUS * 0.95);
      const cPos = randomPointInSphere(CHAOS_RADIUS * 1.3);
      
      let type = OrnamentType.SPHERE;
      const rand = Math.random();
      
      let textureIndex = -1;
      if (loadedTextures.length > 0 && rand > 0.8) {
        type = OrnamentType.USER;
        textureIndex = Math.floor(Math.random() * loadedTextures.length);
        uCounts[textureIndex]++;
      } else {
        if (rand < 0.50) { type = OrnamentType.SPHERE; sCount++; } 
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
      }

      let localIndex = 0;
      if (type === OrnamentType.SPHERE) localIndex = sCount - 1;
      if (type === OrnamentType.BOX) localIndex = bCount - 1;
      if (type === OrnamentType.GEM) localIndex = gCount - 1;
      if (type === OrnamentType.USER) localIndex = uCounts[textureIndex] - 1;

      data.push({
        id: i,
        tPos,
        cPos,
        type,
        color,
        scale,
        textureIndex,
        localIndex,
        phase: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 2.0,
        rotationAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize()
      });
    }

    return { 
        ornamentData: data, 
        counts: { sphere: sCount, box: bCount, gem: gCount }, 
        userCounts: uCounts,
    };
  }, [loadedTextures.length]);

  const currentProgress = useRef(0);
  const focusProgress = useRef(0);
  const dummyObj = useMemo(() => new THREE.Object3D(), []);

  // --- Animation Loop ---
  useFrame((state, delta) => {
    if (!groupRef.current || !needlesRef.current) return;

    // Detect Focus Trigger (Rising Edge)
    if (isPhotoFocused && !prevFocusState.current) {
        // Find the Nearest Photo to Camera
        const worldRot = groupRef.current.rotation.y;
        let minDist = Infinity;
        let nearestId = -1;

        // Iterate only user photos
        ornamentData.forEach(orn => {
            if (orn.type !== OrnamentType.USER) return;
            
            // Calculate current world position
            const p = currentProgress.current;
            const invP = 1 - p;
            
            // Base pos
            const bx = orn.cPos.x * invP + orn.tPos.x * p;
            const by = orn.cPos.y * invP + orn.tPos.y * p;
            const bz = orn.cPos.z * invP + orn.tPos.z * p;

            // Apply Group Rotation
            // x' = x cos θ - z sin θ
            // z' = x sin θ + z cos θ
            const wx = bx * Math.cos(worldRot) + bz * Math.sin(worldRot);
            const wy = by;
            const wz = -bx * Math.sin(worldRot) + bz * Math.cos(worldRot);

            // Distance to Camera (Camera is at roughly 0, 4, 20)
            const dx = wx - camera.position.x;
            const dy = wy - camera.position.y;
            const dz = wz - camera.position.z;
            const d = dx*dx + dy*dy + dz*dz;

            if (d < minDist) {
                minDist = d;
                nearestId = orn.id;
            }
        });
        
        if (nearestId !== -1) {
            setActiveFocusIndex(nearestId);
        }
    }
    prevFocusState.current = isPhotoFocused;


    // 1. Tree Morph Logic
    const targetProgress = treeState === TreeState.FORMED ? 1 : 0;
    currentProgress.current = THREE.MathUtils.lerp(currentProgress.current, targetProgress, delta * 4.0);
    const p = currentProgress.current;
    const invP = 1 - p;

    // 2. Focus Logic
    const targetFocus = isPhotoFocused ? 1 : 0;
    focusProgress.current = THREE.MathUtils.lerp(focusProgress.current, targetFocus, delta * 5.0);
    const fp = focusProgress.current;
    
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
    const time = state.clock.elapsedTime; 
    const globalScale = THREE.MathUtils.lerp(1.5, 1.0, p);
    const userShrinkFactor = THREE.MathUtils.lerp(1.0, 0.3, p);

    const camZ = state.camera.position.z;
    const focusPos = new THREE.Vector3(0, 4, camZ - 5);

    ornamentData.forEach((orn) => {
        let x = orn.cPos.x * invP + orn.tPos.x * p;
        let y = orn.cPos.y * invP + orn.tPos.y * p;
        let z = orn.cPos.z * invP + orn.tPos.z * p;
        
        const isTarget = (orn.id === activeFocusIndex);
        
        dummyObj.rotation.set(0, 0, 0);

        const breathe = 1.0 + Math.sin(time * 3 + orn.phase) * 0.05;
        const currentScaleVec = orn.scale.clone().multiplyScalar(globalScale * breathe);

        if (orn.type === OrnamentType.USER) {
            currentScaleVec.multiplyScalar(userShrinkFactor);
        }

        if (isTarget && fp > 0.01) {
            const invRotY = -groupRef.current!.rotation.y;
            const targetX = focusPos.x * Math.cos(invRotY) - focusPos.z * Math.sin(invRotY);
            const targetZ = focusPos.x * Math.sin(invRotY) + focusPos.z * Math.cos(invRotY);
            const targetY = focusPos.y;

            x = THREE.MathUtils.lerp(x, targetX, fp);
            y = THREE.MathUtils.lerp(y, targetY, fp);
            z = THREE.MathUtils.lerp(z, targetZ, fp);

            const baseFocusScale = 3.0; 
            dummyObj.scale.lerpVectors(currentScaleVec, new THREE.Vector3(baseFocusScale, baseFocusScale, baseFocusScale), fp);
            
            const camX = state.camera.position.x * Math.cos(invRotY) - state.camera.position.z * Math.sin(invRotY);
            const camZLocal = state.camera.position.x * Math.sin(invRotY) + state.camera.position.z * Math.cos(invRotY);
            dummyObj.position.set(x, y, z);
            dummyObj.lookAt(camX, state.camera.position.y, camZLocal);
            
        } else {
            dummyObj.position.set(x, y, z);
            if (orn.type === OrnamentType.USER) {
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
    userMeshRefs.current.forEach(mesh => {
        if (mesh) mesh.instanceMatrix.needsUpdate = true;
    });

    // 3. Rotation Physics
    if (extraRotationVelocity && !isPhotoFocused) {
        velocity.current += extraRotationVelocity.current * 0.8; 
        extraRotationVelocity.current = 0; 
    }
    
    if (isPhotoFocused) {
        velocity.current *= 0.5;
    } else {
        velocity.current *= 0.75; 
    }

    const idleSpeed = 0.0001;
    if (treeState === TreeState.FORMED && Math.abs(velocity.current) < 0.001 && !isPhotoFocused) {
        velocity.current += (idleSpeed - velocity.current) * 0.01;
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

      {/* 1. SPHERES */}
      <instancedMesh 
        ref={sphereMeshRef} 
        args={[undefined, undefined, counts.sphere]}
      >
        <sphereGeometry args={[1, 64, 64]} /> 
        <meshPhysicalMaterial 
            metalness={0.9} 
            roughness={0.15} 
            clearcoat={1.0}
            clearcoatRoughness={0.1}
            envMapIntensity={1.5}
        />
      </instancedMesh>

      {/* 2. BOXES */}
      <instancedMesh 
        ref={boxMeshRef} 
        args={[undefined, undefined, counts.box]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial 
            metalness={0.3} 
            roughness={0.5} 
            envMapIntensity={1.0}
        />
      </instancedMesh>

      {/* 3. GEMS */}
      <instancedMesh 
        ref={gemMeshRef} 
        args={[undefined, undefined, counts.gem]}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshPhysicalMaterial 
            color="#ffffff"
            metalness={0.9} 
            roughness={0.05} 
            envMapIntensity={3.0} 
            emissive="#ffffff"
            emissiveIntensity={0.1}
        />
      </instancedMesh>

      {/* 4. USER PHOTOS - Gold Framed Double-Sided Panels */}
      {loadedTextures.map((tex, i) => {
         const photoMaterial = new THREE.MeshStandardMaterial({
            map: tex,
            metalness: 0.1,
            roughness: 0.2, // Glossy photo finish
            color: '#ffffff'
         });
         
         return (
            <instancedMesh
                key={i}
                ref={el => { if(el) userMeshRefs.current[i] = el; }}
                args={[undefined, undefined, userCounts[i]]}
                geometry={framedGeometry}
                material={[goldFrameMaterial, photoMaterial]}
            />
         );
      })}

    </group>
  );
};