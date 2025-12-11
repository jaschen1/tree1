import { Vector3, Color } from 'three';

export enum TreeState {
  CHAOS = 'CHAOS',
  FORMED = 'FORMED'
}

export interface ParticleData {
  chaosPos: Vector3;
  targetPos: Vector3;
  currentPos: Vector3;
  color: Color;
  size: number;
  speed: number;
}

export interface OrnamentData {
  chaosPos: Vector3;
  targetPos: Vector3;
  rotation: Vector3;
  scale: number;
  type: 'box' | 'ball' | 'light';
  color: Color;
}

// Augment global JSX namespace to include React Three Fiber elements
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

// Augment React's JSX namespace (crucial for modern React/TS setups and R3F)
import 'react';
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}