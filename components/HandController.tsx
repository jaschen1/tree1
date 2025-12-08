import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, DrawingUtils, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { TreeState } from '../types';

interface HandControllerProps {
  onStateChange: (state: TreeState) => void;
  onZoomChange: (factor: number) => void;
  onRotateChange: (velocity: number) => void;
  onPhotoFocusChange: (isFocused: boolean) => void;
}

// Configuration
const DOUBLE_PINCH_TIMING = 400; // ms
const FIST_THRESHOLD = 0.18; // Avg tip-wrist distance

// Chaos Gesture Config
const CHAOS_SPREAD_SPEED_THRESHOLD = 0.02; 

// Interaction Config
// Increased thresholds to filter out unconscious jitter
const ROTATION_THRESHOLD = 0.005; 
const ZOOM_THRESHOLD = 0.01;      
// Reduced sensitivity for "heavy" feel
const ROTATION_SENSITIVITY = -15.0; 
const ZOOM_SENSITIVITY = 1.5;       

type GestureAction = 'LOCKED_FOCUS' | 'FORM' | 'CHAOS' | 'CONTROL' | 'NONE';

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
  
  // Incremental Zoom State
  const currentZoomLevel = useRef<number>(0.5);
  
  const handsDistanceHistory = useRef<number[]>([]); 
  
  // Double Pinch Logic
  const pinchState = useRef({
    isPinched: false,
    lastPinchReleaseTime: 0,
    clickCount: 0,
    isLocked: false 
  });

  const lastWristPos = useRef<{x: number, y: number} | null>(null);

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
          numHands: 2 
        });
        
        startWebcam();
      } catch (error) {
        console.error("Error initializing MediaPipe:", error);
      }
    };

    initMediaPipe();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
      }
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const startWebcam = async () => {
    if (!videoRef.current) return;
    try {
      // Mobile-friendly constraints:
      // Do not specify exact width/height to avoid OverconstrainedError on mobile
      const constraints = {
        video: {
            facingMode: "user" 
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoRef.current.srcObject = stream;
      
      // Ensure video plays on mobile (sometimes autoPlay is ignored)
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(e => console.error("Play error:", e));
      };

      videoRef.current.addEventListener("loadeddata", predictWebcam);
    } catch (err) {
      console.error("Webcam access denied or not supported", err);
    }
  };

  const predictWebcam = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = handLandmarkerRef.current;

    if (video && canvas && landmarker) {
      // Handle variable video dimensions from mobile cameras
      if (video.videoWidth > 0 && video.videoHeight > 0) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          const ctx = canvas.getContext('2d');
          if (ctx) {
            const startTimeMs = performance.now();
            const results = landmarker.detectForVideo(video, startTimeMs);
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
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
            
            if (action !== 'NONE') {
                ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
                ctx.fillRect(10, 10, 240, 30);
                ctx.fillStyle = action === 'LOCKED_FOCUS' ? "#ff3366" : "#FFD700";
                ctx.font = "bold 14px monospace";
                ctx.fillText(`MODE: ${action}`, 20, 30);
            }
          }
      }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  // --- CORE LOGIC ---

  const processGestures = (landmarksArray: NormalizedLandmark[][]): GestureAction => {
    const now = performance.now();

    if (!landmarksArray || landmarksArray.length === 0) {
        onRotateChange(0);
        pinchState.current.isPinched = false;
        pinchState.current.isLocked = false;
        pinchState.current.clickCount = 0;
        onPhotoFocusChange(false);
        lastWristPos.current = null;
        handsDistanceHistory.current = [];
        return 'NONE';
    }

    const hand1 = landmarksArray[0];
    const hand2 = landmarksArray.length > 1 ? landmarksArray[1] : null;

    // --- 1. CHAOS ---
    let isSpreading = false;
    if (hand2) {
        const h1Wrist = hand1[0];
        const h2Wrist = hand2[0];
        const dist = Math.hypot(h1Wrist.x - h2Wrist.x, h1Wrist.y - h2Wrist.y);
        
        handsDistanceHistory.current.push(dist);
        if (handsDistanceHistory.current.length > 5) handsDistanceHistory.current.shift();

        if (handsDistanceHistory.current.length >= 2) {
            const currentDist = handsDistanceHistory.current[handsDistanceHistory.current.length - 1];
            const prevDist = handsDistanceHistory.current[handsDistanceHistory.current.length - 2];
            if (currentDist - prevDist > CHAOS_SPREAD_SPEED_THRESHOLD) {
                isSpreading = true;
            }
        }
    } else {
        handsDistanceHistory.current = [];
    }

    if (isSpreading) {
        onStateChange(TreeState.CHAOS);
        return 'CHAOS';
    }

    // --- 2. FORM (FIST) ---
    const checkFist = (hand: NormalizedLandmark[]) => {
        const wrist = hand[0];
        const tips = [hand[8], hand[12], hand[16], hand[20]]; 
        const avgTipDist = tips.reduce((acc, tip) => acc + Math.hypot(tip.x - wrist.x, tip.y - wrist.y), 0) / 4;
        return avgTipDist < FIST_THRESHOLD;
    };

    if (checkFist(hand1) || (hand2 && checkFist(hand2))) {
        onStateChange(TreeState.FORMED);
        return 'FORM';
    }

    // --- 3. PINCH ---
    const thumbTip = hand1[4];
    const indexTip = hand1[8];
    const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const isCurrentlyPinched = pinchDist < 0.05;

    if (isCurrentlyPinched && !pinchState.current.isPinched) {
        const timeSinceRelease = now - pinchState.current.lastPinchReleaseTime;
        if (timeSinceRelease < DOUBLE_PINCH_TIMING) {
            pinchState.current.clickCount = 2;
            pinchState.current.isLocked = true;
        } else {
            pinchState.current.clickCount = 1;
        }
    }

    if (!isCurrentlyPinched && pinchState.current.isPinched) {
        pinchState.current.lastPinchReleaseTime = now;
        if (pinchState.current.isLocked) {
             pinchState.current.isLocked = false;
             pinchState.current.clickCount = 0;
        }
    }
    pinchState.current.isPinched = isCurrentlyPinched;

    if (pinchState.current.isLocked) {
        onPhotoFocusChange(true);
        onRotateChange(0);
        return 'LOCKED_FOCUS';
    } else {
        onPhotoFocusChange(false);
    }

    // --- 4. CONTROL (SPATIAL DRAG) ---
    const wrist = hand1[0];
    let dX = 0;
    let dY = 0;

    if (lastWristPos.current) {
        dX = wrist.x - lastWristPos.current.x;
        dY = wrist.y - lastWristPos.current.y;
    }
    lastWristPos.current = { x: wrist.x, y: wrist.y };

    if (Math.abs(dX) > ROTATION_THRESHOLD) {
        onRotateChange(dX * ROTATION_SENSITIVITY);
    } else {
        onRotateChange(0);
    }

    if (Math.abs(dY) > ZOOM_THRESHOLD) {
        const zoomDelta = dY * ZOOM_SENSITIVITY; 
        currentZoomLevel.current += zoomDelta;
        currentZoomLevel.current = Math.max(0, Math.min(1, currentZoomLevel.current));
        onZoomChange(currentZoomLevel.current);
    }

    return 'CONTROL';
  };

  return (
    <div className="hand-tracker-container">
      <video ref={videoRef} id="webcam-video" autoPlay playsInline muted />
      <canvas ref={canvasRef} id="webcam-canvas" />
    </div>
  );
};