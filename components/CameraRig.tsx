import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface CameraRigProps {
  zoomFactor: number; // 0 to 1
}

export const CameraRig: React.FC<CameraRigProps> = ({ zoomFactor }) => {
  const { camera } = useThree();
  const vec = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    // Zoom Factor 0 = Far (65 units)
    // Zoom Factor 1 = Close (8 units) - Closer than previous 12, giving more impact
    const targetZ = THREE.MathUtils.lerp(65, 8, zoomFactor);
    
    // Smoothly interpolate current position to target
    // Speed 2.0 provides a good balance between weight and responsiveness
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, delta * 2.0);
    
    // Ensure camera always looks at center slightly elevated
    vec.current.set(0, 4, 0);
    camera.lookAt(vec.current);
  });

  return null;
};