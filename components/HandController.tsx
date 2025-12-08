import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, DrawingUtils, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { TreeState } from '../types';
import * as THREE from 'three';

interface HandControllerProps {
  onStateChange: (state: TreeState) => void;
  onZoomChange: (factor: number) => void;
  onRotateChange: (velocity: number) => void;
  onPhotoFocusChange: (isFocused: boolean) => void;
}

// Configuration
const HISTORY_SIZE = 5;
const DOUBLE_PINCH_TIMING = 400; // ms between pinches to count as double click
const SWIPE_THRESHOLD = 0.015; // Velocity threshold for swipe
const FIST_THRESHOLD = 0.22; // Average distance of finger tips to wrist to count as fist
const OPEN_THRESHOLD = 0.35; // Average distance to count as open hand

type GestureAction = 'LOCKED_FOCUS' | 'FORM' | 'CHAOS_AND_CONTROL' | 'NONE';

export const HandController: React.FC<HandControllerProps> = ({ 
  onStateChange, 
  onZoomChange, 
  onRotateChange,
  onPhotoFocusChange
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentAction, setCurrentAction] = useState<GestureAction>('NONE');
  
  const requestRef = useRef<number>(0);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);

  // --- STATE MACHINES & HISTORY ---
  
  // 1. Motion Smoothing
  const palmHistory = useRef<{x: number, y: number, time: number}[]>([]);
  const zoomHistory = useRef<number[]>([]); 
  
  // 2. Double Pinch Logic
  const pinchState = useRef({
    isPinched: false,
    lastPinchReleaseTime: 0,
    clickCount: 0,
    isLocked: false // If true, we are in "Focus Mode" holding the pinch
  });

  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );
        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1 
        });
        
        startWebcam();
      } catch (error) {
        console.error("Error initializing MediaPipe:", error);
      }
    };

    initMediaPipe();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const startWebcam = async () => {
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 320, height: 240, frameRate: 30 } 
      });
      videoRef.current.srcObject = stream;
      videoRef.current.addEventListener("loadeddata", predictWebcam);
    } catch (err) {
      console.error("Webcam access denied", err);
    }
  };

  const predictWebcam = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = handLandmarkerRef.current;

    if (video && canvas && landmarker) {
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        const startTimeMs = performance.now();
        const results = landmarker.detectForVideo(video, startTimeMs);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Debug Visualization
        const drawingUtils = new DrawingUtils(ctx);
        if (results.landmarks) {
          for (const landmarks of results.landmarks) {
             drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                color: '#00ff44', lineWidth: 2
             });
             drawingUtils.drawLandmarks(landmarks, {
                color: '#FFD700', lineWidth: 1, radius: 2
             });
          }
        }

        const action = processGestures(results.landmarks);
        setCurrentAction(action);
        
        // UI Debug
        if (action !== 'NONE') {
            ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
            ctx.fillRect(10, 10, 240, 30);
            ctx.fillStyle = action === 'LOCKED_FOCUS' ? "#ff3366" : "#FFD700";
            ctx.font = "bold 14px monospace";
            ctx.fillText(`MODE: ${action}`, 20, 30);
        }
      }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  // --- CORE LOGIC ---

  const processGestures = (landmarksArray: NormalizedLandmark[][]): GestureAction => {
    const now = performance.now();

    // 0. RESET IF NO HAND
    if (!landmarksArray || landmarksArray.length === 0) {
        // Safe Reset
        onRotateChange(0);
        pinchState.current.isPinched = false;
        pinchState.current.isLocked = false;
        pinchState.current.clickCount = 0;
        onPhotoFocusChange(false);
        return 'NONE';
    }

    const hand = landmarksArray[0];
    const wrist = hand[0];
    const thumbTip = hand[4];
    const indexTip = hand[8];
    const middleTip = hand[12];
    const ringTip = hand[16];
    const pinkyTip = hand[20];

    // --- 1. PINCH DETECTION (INDEX + THUMB) ---
    const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const isCurrentlyPinched = pinchDist < 0.05;

    // Rising Edge (Just Pinched)
    if (isCurrentlyPinched && !pinchState.current.isPinched) {
        const timeSinceRelease = now - pinchState.current.lastPinchReleaseTime;
        
        if (timeSinceRelease < DOUBLE_PINCH_TIMING) {
            // Second Click detected!
            pinchState.current.clickCount = 2;
            pinchState.current.isLocked = true; // Lock engaged
        } else {
            // First Click or timed out
            pinchState.current.clickCount = 1;
        }
    }

    // Falling Edge (Just Released)
    if (!isCurrentlyPinched && pinchState.current.isPinched) {
        pinchState.current.lastPinchReleaseTime = now;
        // Unlock on release
        if (pinchState.current.isLocked) {
             pinchState.current.isLocked = false;
             pinchState.current.clickCount = 0;
        }
    }

    pinchState.current.isPinched = isCurrentlyPinched;

    // --- 2. PRIORITY: LOCKED FOCUS MODE ---
    if (pinchState.current.isLocked) {
        onPhotoFocusChange(true);
        onRotateChange(0); // Freeze rotation
        // We do NOT change zoom or state here. Total Lock.
        return 'LOCKED_FOCUS';
    } else {
        onPhotoFocusChange(false);
    }

    // --- 3. FIST vs OPEN DETECTION ---
    const tips = [indexTip, middleTip, ringTip, pinkyTip];
    // Calculate average distance from wrist to finger tips
    const avgDist = tips.reduce((acc, tip) => acc + Math.hypot(tip.x - wrist.x, tip.y - wrist.y), 0) / 4;

    const isFist = avgDist < FIST_THRESHOLD;
    const isOpen = avgDist > OPEN_THRESHOLD; // Use a gap for hysteresis

    // --- 4. ACTION: FIST (BUILD TREE) ---
    if (isFist) {
        onStateChange(TreeState.FORMED);
        onRotateChange(0); // Stop spinning when building
        return 'FORM';
    }

    // --- 5. ACTION: OPEN HAND (CHAOS + CONTROL) ---
    if (isOpen) {
        // Enforce Chaos State
        onStateChange(TreeState.CHAOS);

        // A. Rotation (Swipe) Logic
        // Track history
        palmHistory.current.push({ x: wrist.x, y: wrist.y, time: now });
        if (palmHistory.current.length > HISTORY_SIZE) palmHistory.current.shift();

        let dx = 0;
        if (palmHistory.current.length >= 2) {
            const latest = palmHistory.current[palmHistory.current.length - 1];
            const old = palmHistory.current[0];
            dx = latest.x - old.x;
        }

        // Apply Deadzone for rotation
        if (Math.abs(dx) > SWIPE_THRESHOLD) {
             // Invert X because webcam is mirrored usually, or canvas is scaleX(-1)
             // If canvas is scaleX(-1), moving hand Right physically appears as moving Left on screen coords?
             // Let's standardise: Moving hand Right (User's Right) should rotate tree Right.
             // Canvas is mirrored.
             onRotateChange(dx * -40.0); 
        } else {
             onRotateChange(0);
        }

        // B. Zoom (Depth) Logic
        // Metric: Hand Size (Wrist to Middle Finger Tip)
        // Large Size = Hand Close = Tree Far (Zoom Out, Factor -> 0)
        // Small Size = Hand Far = Tree Close (Zoom In, Factor -> 1)
        const handSize = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);
        
        // Calibration: 
        // Far hand ~ 0.15 (normalized) -> Zoom 1.0
        // Close hand ~ 0.45 (normalized) -> Zoom 0.0
        const minSize = 0.15;
        const maxSize = 0.45;
        
        // Normalize 0 to 1 based on range
        let t = (handSize - minSize) / (maxSize - minSize);
        t = Math.max(0, Math.min(1, t)); // Clamp 0-1
        
        // Inverse Relationship requested
        // Hand Close (t=1) -> Tree Small (Zoom=0)
        // Hand Far (t=0) -> Tree Big (Zoom=1)
        const targetZoom = 1 - t; 

        // Smooth Zoom
        zoomHistory.current.push(targetZoom);
        if (zoomHistory.current.length > 5) zoomHistory.current.shift();
        const smoothedZoom = zoomHistory.current.reduce((a, b) => a + b, 0) / zoomHistory.current.length;
        
        onZoomChange(smoothedZoom);

        return 'CHAOS_AND_CONTROL';
    }

    // Fallback if hand is "neutral" (neither full fist nor full open)
    onRotateChange(0);
    return 'NONE';
  };

  return (
    <div className="hand-tracker-container">
      <video
        ref={videoRef}
        id="webcam-video"
        autoPlay
        playsInline
        muted
      />
      <canvas ref={canvasRef} id="webcam-canvas" />
    </div>
  );
};