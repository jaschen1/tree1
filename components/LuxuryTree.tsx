import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeState } from '../types';
import { randomPointInSphere } from '../utils/math';

interface LuxuryTreeProps {
  treeState: TreeState;
  extraRotationVelocity?: React.MutableRefObject<number>;
  userTextureUrls: string[];
  isPhotoFocused: boolean;
}

// Keep needle count high for density
const NEEDLE_COUNT = 40000; 
const ORNAMENT_COUNT = 180; 
const TREE_HEIGHT = 12;
const TREE_RADIUS = 4.5;
const CHAOS_RADIUS = 15;
const TREE_TIERS = 8; 

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
            <mesh position={[0, 0, 0]}>
                <torusGeometry args={[0.5, 0.2, 16, 32]} />
                <meshStandardMaterial color="#ffffff" roughness={1} />
            </mesh>
            <mesh position={[0, 0.8, 0]}>
                <coneGeometry args={[0.45, 1.8, 32]} />
                <meshStandardMaterial color="#D40000" roughness={0.6} />
            </mesh>
            <mesh position={[0, 1.7, 0]}>
                <sphereGeometry args={[0.22, 16, 16]} />
                <meshStandardMaterial color="#ffffff" roughness={1} />
            </mesh>
        </group>
    );
};

const createHeptagramShape = () => {
    const shape = new THREE.Shape();
    const points = 7;
    const outerRadiusBase = 1.0;
    const innerRadiusBase = 0.5;

    for (let i = 0; i < points * 2; i++) {
        const angle = (i / (points * 2)) * Math.PI * 2;
        const isTip = i % 2 === 0;
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

// Custom shape function for the Sawtooth/Pine Tree Look
const randomPointInPineTree = (height: number, maxRadius: number, tiers: number): THREE.Vector3 => {
    // 0 to 1 (Bottom to Top)
    const normalizedH = Math.random(); 
    
    // Y position
    const y = (normalizedH - 0.2) * height; // Shift down slightly

    // --- Sawtooth Logic ---
    // 1. Overall Taper (Cone shape foundation)
    const overallTaper = 1 - normalizedH; 

    // 2. Tier Logic
    // Scale normalizedH by tiers (e.g., 0 to 8). 
    // The decimal part is the progress within that specific tier.
    const tierPos = normalizedH * tiers;
    const tierProgress = tierPos % 1; // 0.0 (bottom of tier) -> 1.0 (top of tier)

    // A pine branch sticks out at the bottom and tapers in at the top of the tier.
    // So radius is larger when tierProgress is low.
    const tierFlare = (1 - tierProgress); 

    // Combine: The radius depends on how high we are overall (taper) AND where we are in the tier (flare)
    // We blend them: mostly flare at bottom, but constrained by overall taper.
    const currentMaxRadius = maxRadius * (overallTaper * 0.7 + tierFlare * 0.3 * overallTaper);

    // Distribution: sqrt ensures uniform area filling, otherwise center is too dense
    const r = Math.sqrt(Math.random()) * currentMaxRadius;
    const angle = Math.random() * Math.PI * 2;

    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;

    return new THREE.Vector3(x, y, z);
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

  // UPDATED TEXTURE: Solid matte circle (No glow)
  const particleTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32; 
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0,0,32,32);
        
        const cx = 16;
        const cy = 16;
        const r = 14;

        // Solid white circle, no gradient fade out
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  const goldFrameMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#FFD700",
    metalness: 0.9,
    roughness: 0.3,
    clearcoat: 0.8,
    envMapIntensity: 1.2
  }), []);
  
  const heptagramMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#CFB53B", 
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
    const color2 = new THREE.Color("#22c55e"); 
    const color3 = new THREE.Color("#15803d"); 
    const tempColor = new THREE.Color();

    for (let i = 0; i < NEEDLE_COUNT; i++) {
      // Use Pine Tree Logic
      const tPos = randomPointInPineTree(TREE_HEIGHT, TREE_RADIUS, TREE_TIERS);
      
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
      
      // Add slight hue shift
      tempColor.offsetHSL(0, 0.05, (Math.random() - 0.5) * 0.1);

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
      // Use Pine Tree logic for Ornaments too, but slightly smaller radius so they sit inside/on the branches
      let tPos = randomPointInPineTree(TREE_HEIGHT, TREE_RADIUS * 0.95, TREE_TIERS);

      const cPos = randomPointInSphere(CHAOS_RADIUS * 1.3);
      
      let type = OrnamentType.SPHERE;
      const rand = Math.random();
      let textureIndex = -1;
      
      if (loadedTextures.length > 0 && rand > 0.85) {
        type = OrnamentType.USER;
        textureIndex = Math.floor(Math.random() * loadedTextures.length);
        uCounts[textureIndex]++;
        
        // Custom logic for User photos to ensure they spiral nicely
        const sectionR = Math.random();
        let normalizedH = 0.5; 
        if (sectionR < 0.15) normalizedH = Math.random() * 0.2;
        else if (sectionR > 0.85) normalizedH = 0.8 + Math.random() * 0.2;
        else normalizedH = 0.2 + (Math.random() + Math.random())/2 * 0.6; 

        const yMin = -0.2 * TREE_HEIGHT;
        const yMax = 0.8 * TREE_HEIGHT;
        
        // Approximate the pine radius at this height
        const overallTaper = 1 - normalizedH; 
        const tierPos = normalizedH * TREE_TIERS;
        const tierProgress = tierPos % 1; 
        const tierFlare = (1 - tierProgress); 
        const currentRadius = TREE_RADIUS * 1.1 * (overallTaper * 0.7 + tierFlare * 0.3 * overallTaper);

        const finalY = yMin + normalizedH * (yMax - yMin);
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
      
      // SMALLER ORNAMENTS AGAIN
      const baseScale = 0.18 + Math.random() * 0.12; 

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
        scale.setScalar(baseScale * 0.9); 
      }

      let localIndex = 0;
      if (type === OrnamentType.SPHERE) localIndex = sCount - 1;
      if (type === OrnamentType.BOX) localIndex = bCount - 1;
      if (type === OrnamentType.GEM) localIndex = gCount - 1;
      if (type === OrnamentType.USER) localIndex = uCounts[textureIndex] - 1;
      if (type === OrnamentType.HEPTAGRAM) localIndex = hCount - 1;

      let rotAxis = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();
      let rotSpeed = (Math.random() - 0.5) * 2.0;

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

  // Use vectors to avoid garbage collection
  const vec3 = useMemo(() => new THREE.Vector3(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);

  useFrame((state, delta) => {
    if (!groupRef.current || !needlesRef.current) return;

    // Detect Focus Trigger
    if (isPhotoFocused && !prevFocusState.current) {
        const worldRot = groupRef.current.rotation.y;
        let minDist = Infinity;
        let nearestId = -1;

        ornamentData.forEach(orn => {
            if (orn.type !== OrnamentType.USER) return;
            // Calculate current world position of the photo
            const p = currentProgress.current;
            const invP = 1 - p;
            const bx = orn.cPos.x * invP + orn.tPos.x * p;
            const by = orn.cPos.y * invP + orn.tPos.y * p;
            const bz = orn.cPos.z * invP + orn.tPos.z * p;
            
            // Approximate world position based on group rotation
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
    
    for (let i = 0; i < NEEDLE_COUNT; i++) {
      let x = needleData.chaos[i * 3] * invP + needleData.target[i * 3] * p;
      let y = needleData.chaos[i * 3 + 1] * invP + needleData.target[i * 3 + 1] * p;
      let z = needleData.chaos[i * 3 + 2] * invP + needleData.target[i * 3 + 2] * p;

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

    ornamentData.forEach((orn) => {
        // Base Tree Position
        let x = orn.cPos.x * invP + orn.tPos.x * p;
        let y = orn.cPos.y * invP + orn.tPos.y * p;
        let z = orn.cPos.z * invP + orn.tPos.z * p;
        
        const isFixed = (orn.type === OrnamentType.HEPTAGRAM);
        
        // Gentle tree motion
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
        dummyObj.rotation.set(0, 0, 0); // Reset for clean state
        
        let breathe = 1.0;
        if (!isFixed) {
            breathe = 1.0 + Math.sin(time * 3 + orn.phase) * 0.05;
        }
        
        // Base Scale on Tree
        const treeScaleVec = orn.scale.clone().multiplyScalar(globalScale * breathe);
        if (orn.type === OrnamentType.USER) treeScaleVec.multiplyScalar(userShrinkFactor);

        if (isTarget && fp > 0.001) {
            // --- FOCUS MODE CALCULATION ---
            // Goal: Calculate local pos/rot so that WorldPos matches camera center at fixed distance
            
            // 1. Calculate Target World Params
            const dist = 10; // Fixed distance from camera
            const vFOV = camera.fov * Math.PI / 180;
            const visibleHeight = 2 * Math.tan(vFOV / 2) * dist;
            // Target Area = 1/6th of screen. 
            // Square Root of 1/6 is approx 0.408. 
            // So we want the object to take up ~41% of screen height.
            const targetHeight = visibleHeight * 0.408;
            const geomHeight = 2.0; // Height of frame geometry
            const targetScaleVal = targetHeight / geomHeight;
            const targetScaleVec = new THREE.Vector3(targetScaleVal, targetScaleVal, targetScaleVal);

            // Target World Position: Camera Pos + Forward * Distance
            camera.getWorldDirection(vec3);
            const worldTargetPos = camera.position.clone().add(vec3.multiplyScalar(dist));
            
            // Target World Rotation: Look at Camera (or match camera orientation)
            // We match camera orientation so it's perfectly flat to screen
            const worldTargetQuat = camera.quaternion.clone();

            // 2. Convert World to Local (cancel out Group Rotation)
            // Local = Inv(GroupMatrix) * World
            // Since Group only rotates Y and is at 0,0,0, we can just rotate vectors/quaternions
            const groupInvQuat = groupRef.current!.quaternion.clone().invert();
            
            // Local Position
            // P_local = P_world.applyQuaternion(GroupInv)
            const localTargetPos = worldTargetPos.clone().applyQuaternion(groupInvQuat);
            
            // Local Rotation
            // Q_local = GroupInv * Q_world
            const localTargetQuat = groupInvQuat.multiply(worldTargetQuat);

            // 3. Interpolate from Tree State to Focus State
            // Current Tree Position
            const treePos = new THREE.Vector3(x, y, z);
            
            // Interpolate Position
            dummyObj.position.lerpVectors(treePos, localTargetPos, fp);
            
            // Interpolate Rotation
            // Calculate tree-state rotation
            const treeQuat = new THREE.Quaternion();
            const dummyEuler = new THREE.Euler(0, time * 0.2 + orn.phase, Math.sin(time * 0.5 + orn.phase) * 0.1);
            treeQuat.setFromEuler(dummyEuler);
            
            dummyObj.quaternion.slerpQuaternions(treeQuat, localTargetQuat, fp);
            
            // Interpolate Scale
            dummyObj.scale.lerpVectors(treeScaleVec, targetScaleVec, fp);

        } else {
            // Normal Tree State
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
            dummyObj.scale.copy(treeScaleVec);
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
        // Increased influence (0.15) for snappier rotation
        velocity.current += extraRotationVelocity.current * 0.15; 
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
        
        {/* UPDATED MATERIAL: Matte, tiny particles */}
        <pointsMaterial 
            map={particleTexture}
            vertexColors 
            size={0.06} // VERY SMALL
            sizeAttenuation={true} 
            transparent={true} 
            opacity={0.9} 
            alphaTest={0.1} 
            depthWrite={false}
            blending={THREE.NormalBlending} 
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