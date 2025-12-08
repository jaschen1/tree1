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

// Tree vertical bounds based on randomPointInCone logic
// y goes from (0 - 0.2)*H to (1 - 0.2)*H -> -2.4 to 9.6
const TREE_TOP_Y = 0.8 * TREE_HEIGHT; 

enum OrnamentType {
  SPHERE = 0,
  BOX = 1,
  GEM = 2,
  USER = 3
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

// Simplified geometry: No crown, sleek minimal frame
const createFramedGeometry = () => {
    const width = 1.5;
    const height = 1.8;
    const depth = 0.05; // Thinner
    
    // 1. The Backing/Side Plate (Gold)
    const box = new THREE.BoxGeometry(width, height, depth);
    const boxNonIndexed = box.toNonIndexed();
    
    // 2. The Photo Plane (Front)
    // Slightly smaller than width/height to show a tiny metallic rim, or full bleed.
    // Let's go for full bleed front with gold sides.
    const front = new THREE.PlaneGeometry(width, height);
    front.translate(0, 0, depth/2 + 0.001); // Just in front of the box
    const frontNonIndexed = front.toNonIndexed();

    // The back plane (Gold)
    const back = new THREE.PlaneGeometry(width, height);
    back.rotateY(Math.PI);
    back.translate(0, 0, -depth/2 - 0.001);
    const backNonIndexed = back.toNonIndexed();
    
    // Combine
    const parts = [boxNonIndexed, frontNonIndexed, backNonIndexed];
    
    let totalVerts = 0;
    parts.forEach(p => totalVerts += p.attributes.position.count);
    
    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);

    let vOffset = 0;
    let boxVertCount = 0;
    let photoVertCount = 0;

    // Add Box (Material 0: Gold)
    positions.set(boxNonIndexed.attributes.position.array, vOffset * 3);
    normals.set(boxNonIndexed.attributes.normal.array, vOffset * 3);
    uvs.set(boxNonIndexed.attributes.uv.array, vOffset * 2);
    boxVertCount += boxNonIndexed.attributes.position.count;
    vOffset += boxNonIndexed.attributes.position.count;

    // Add Back Plane (Material 0: Gold)
    positions.set(backNonIndexed.attributes.position.array, vOffset * 3);
    normals.set(backNonIndexed.attributes.normal.array, vOffset * 3);
    uvs.set(backNonIndexed.attributes.uv.array, vOffset * 2);
    boxVertCount += backNonIndexed.attributes.position.count;
    vOffset += backNonIndexed.attributes.position.count;

    // Add Front Plane (Material 1: Photo)
    positions.set(frontNonIndexed.attributes.position.array, vOffset * 3);
    normals.set(frontNonIndexed.attributes.normal.array, vOffset * 3);
    uvs.set(frontNonIndexed.attributes.uv.array, vOffset * 2);
    photoVertCount += frontNonIndexed.attributes.position.count;

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
    roughness: 0.2,
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
  const [activeFocusIndex, setActiveFocusIndex] = useState<number>(-1);
  const prevFocusState = useRef(false);

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
    const sphereColors = [new THREE.Color("#FFD700"), new THREE.Color("#C5A000"), new THREE.Color("#8B0000"), new THREE.Color("#004225"), new THREE.Color("#C0C0C0")];
    const boxColors = [new THREE.Color("#8B0000"), new THREE.Color("#FFFFFF"), new THREE.Color("#D4AF37")];
    const gemColors = [new THREE.Color("#FFFFFF"), new THREE.Color("#E0FFFF")];

    let sCount = 0, bCount = 0, gCount = 0;
    const uCounts = new Array(Math.max(1, loadedTextures.length)).fill(0);
    
    for (let i = 0; i < ORNAMENT_COUNT; i++) {
      // Default random pos for normal ornaments
      let tPos = randomPointInCone(TREE_HEIGHT, TREE_RADIUS * 0.95);
      const cPos = randomPointInSphere(CHAOS_RADIUS * 1.3);
      
      let type = OrnamentType.SPHERE;
      const rand = Math.random();
      let textureIndex = -1;
      
      if (loadedTextures.length > 0 && rand > 0.8) {
        type = OrnamentType.USER;
        textureIndex = Math.floor(Math.random() * loadedTextures.length);
        uCounts[textureIndex]++;

        // --- Custom Distribution for Photos ---
        const sectionR = Math.random();
        let normalizedH = 0.5; // 0 to 1 relative to tree height

        if (sectionR < 0.15) {
            normalizedH = Math.random() * 0.2;
        } else if (sectionR > 0.85) {
            normalizedH = 0.8 + Math.random() * 0.2;
        } else {
            const r1 = Math.random();
            const r2 = Math.random();
            const tri = (r1 + r2) / 2; 
            normalizedH = 0.2 + tri * 0.6; 
        }

        const yMin = -0.2 * TREE_HEIGHT;
        const yMax = 0.8 * TREE_HEIGHT;
        const yRange = yMax - yMin;
        const finalY = yMin + normalizedH * yRange;

        const distFromTip = yMax - finalY;
        const currentRadius = (distFromTip / yRange) * TREE_RADIUS * 1.1; 

        const angle = Math.random() * Math.PI * 2;
        tPos = new THREE.Vector3(
            Math.cos(angle) * currentRadius,
            finalY,
            Math.sin(angle) * currentRadius
        );

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
        id: i, tPos, cPos, type, color, scale, textureIndex, localIndex,
        phase: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 2.0,
        rotationAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize()
      });
    }

    return { ornamentData: data, counts: { sphere: sCount, box: bCount, gem: gCount }, userCounts: uCounts };
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
    
    const positions = needlesRef.current.geometry.attributes.position;
    for (let i = 0; i < NEEDLE_COUNT; i++) {
      const x = needleData.chaos[i * 3] * invP + needleData.target[i * 3] * p;
      const y = needleData.chaos[i * 3 + 1] * invP + needleData.target[i * 3 + 1] * p;
      const z = needleData.chaos[i * 3 + 2] * invP + needleData.target[i * 3 + 2] * p;
      positions.setXYZ(i, x, y, z);
    }
    positions.needsUpdate = true;

    const time = state.clock.elapsedTime; 
    const globalScale = THREE.MathUtils.lerp(1.5, 1.0, p);
    
    // Scale Logic Change: 
    // Chaos (p=0) -> 1.5 (50% larger than original 1.0)
    // Formed (p=1) -> 0.3 (Same small size on tree)
    const userShrinkFactor = THREE.MathUtils.lerp(1.5, 0.3, p);

    const focusPos = new THREE.Vector3(0, 4, state.camera.position.z - 5);

    ornamentData.forEach((orn) => {
        let x = orn.cPos.x * invP + orn.tPos.x * p;
        let y = orn.cPos.y * invP + orn.tPos.y * p;
        let z = orn.cPos.z * invP + orn.tPos.z * p;
        
        const isTarget = (orn.id === activeFocusIndex);
        dummyObj.rotation.set(0, 0, 0);
        const breathe = 1.0 + Math.sin(time * 3 + orn.phase) * 0.05;
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
    userMeshRefs.current.forEach(mesh => { if (mesh) mesh.instanceMatrix.needsUpdate = true; });

    // --- PHYSICS UPDATE FOR "TIME STOP" FEEL ---
    if (extraRotationVelocity && !isPhotoFocused) {
        // Only take 20% of the input force (heavy object)
        velocity.current += extraRotationVelocity.current * 0.2; 
        extraRotationVelocity.current = 0; 
    }
    
    // High drag (air resistance)
    // 0.85 means it loses 15% of its speed every frame.
    // It creates a "thick fluid" sensation.
    velocity.current *= 0.85;

    // Almost zero idle spin to enhance "suspended in time" look
    const idleSpeed = 0.00005; 
    if (treeState === TreeState.FORMED && Math.abs(velocity.current) < 0.001 && !isPhotoFocused) {
        velocity.current += (idleSpeed - velocity.current) * 0.01;
    }
    
    groupRef.current.rotation.y += velocity.current;
  });

  return (
    <group ref={groupRef}>
      {/* Santa Hat attached to the top */}
      {treeState === TreeState.FORMED && <SantaHat />}

      <points ref={needlesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={NEEDLE_COUNT} array={needleData.chaos} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={NEEDLE_COUNT} array={needleData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial vertexColors size={0.12} sizeAttenuation={true} transparent={true} opacity={0.9} />
      </points>
      <instancedMesh ref={sphereMeshRef} args={[undefined, undefined, counts.sphere]}>
        <sphereGeometry args={[1, 64, 64]} /> 
        <meshPhysicalMaterial metalness={0.9} roughness={0.15} clearcoat={1.0} clearcoatRoughness={0.1} envMapIntensity={1.5} />
      </instancedMesh>
      <instancedMesh ref={boxMeshRef} args={[undefined, undefined, counts.box]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial metalness={0.3} roughness={0.5} envMapIntensity={1.0} />
      </instancedMesh>
      <instancedMesh ref={gemMeshRef} args={[undefined, undefined, counts.gem]}>
        <octahedronGeometry args={[1, 0]} />
        <meshPhysicalMaterial color="#ffffff" metalness={0.9} roughness={0.05} envMapIntensity={3.0} emissive="#ffffff" emissiveIntensity={0.1} />
      </instancedMesh>
      {loadedTextures.map((tex, i) => (
            <instancedMesh key={i} ref={el => { if(el) userMeshRefs.current[i] = el; }} args={[undefined, undefined, userCounts[i]]} geometry={framedGeometry} material={[goldFrameMaterial, new THREE.MeshStandardMaterial({ map: tex, metalness: 0.1, roughness: 0.2, color: '#ffffff' })]} />
      ))}
    </group>
  );
};