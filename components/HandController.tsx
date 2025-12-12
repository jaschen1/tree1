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
const CHAOS_SPREAD_SPEED_THRESHOLD = 0.015; 

// Interaction Config
const ROTATION_THRESHOLD = 0.01; // Deadzone
const ZOOM_THRESHOLD = 0.005;      
const ROTATION_SENSITIVITY = 20.0; 
const ZOOM_SENSITIVITY = 2.0;       

// Throttling for Mobile Performance
const DETECTION_INTERVAL = 33; // ~30 FPS

type GestureAction = 'LOCKED_FOCUS' | 'FORM' | 'CHAOS' | 'CONTROL' | 'NONE';

export const HandController: React.FC<HandControllerProps> = (props) => {
  const { onStateChange, onZoomChange, onRotateChange, onPhotoFocusChange } = props;
  
  // Keep props fresh for loop
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string>('Init Camera...');
  
  const requestRef = useRef<number>(0);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const lastProcessTimeRef = useRef<number>(0);

  // --- STATE MACHINES ---
  const currentZoomLevel = useRef<number>(0.5);
  const handsDistanceHistory = useRef<number[]>([]); 
  
  const pinchState = useRef({
    isPinched: false,
    lastPinchReleaseTime: 0,
    clickCount: 0,
    isLocked: false 
  });

  const lastWristPos = useRef<{x: number, y: number} | null>(null);
  const smoothedVelocity = useRef(0);

  useEffect(() => {
    let isActive = true;

    // 1. Initialize Camera
    const initCamera = async () => {
      if (!videoRef.current) return;
      try {
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { 
                  facingMode: "user",
                  width: { ideal: 640 },
                  height: { ideal: 480 } 
              }
            });
        } catch (e) {
            console.warn("User camera failed, falling back...", e);
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        
        if (isActive && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
                videoRef.current?.play().catch(console.error);
            };
            requestRef.current = requestAnimationFrame(predictLoop);
        }
      } catch (err) {
        console.error("Camera access denied:", err);
        if (isActive) setStatus("No Camera");
      }
    };

    // 2. Initialize AI (China Friendly Configuration)
    const initAI = async () => {
      try {
        if(isActive) setStatus("Loading AI...");
        
        // Use jsDelivr (usually accessible in China) for the WASM binaries
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );
        
        if (!isActive) return;

        // CRITICAL: Point to a LOCAL file for the model to avoid Google Storage blocks
        // The user must place 'hand_landmarker.task' in the public folder
        const modelPath = "/hand_landmarker.task";

        try {
            handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: modelPath,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
            });
            if (isActive) setStatus(""); // Success, clear text
        } catch (e) {
            console.error("Model load failed. Check if hand_landmarker.task is in public folder.", e);
            if (isActive) setStatus("Model Missing");
        }
        
      } catch (error) {
        console.error("AI Init Failed:", error);
        if (isActive) setStatus("AI Error");
      }
    };

    initCamera();
    initAI();

    return () => {
      isActive = false;
      cancelAnimationFrame(requestRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const predictLoop = (time: number) => {
    requestRef.current = requestAnimationFrame(predictLoop);
    if (time - lastProcessTimeRef.current < DETECTION_INTERVAL) return;
    lastProcessTimeRef.current = time;
    detect();
  };

  const detect = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = handLandmarkerRef.current;

    if (!landmarker || !video || !canvas) return;
    if (video.paused || video.ended || video.readyState < 2) return;

    if (video.videoWidth > 0 && video.videoHeight > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

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
                    color: '#FFD700', lineWidth: 0, radius: 2
                });
            }
        }

        const action = processGestures(results.landmarks);
        
        // Debug Status
        if (status || action !== 'NONE') {
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(0, 0, 150, 30);
            ctx.fillStyle = "#00ff00";
            ctx.font = "14px Arial";
            ctx.fillText(status || action, 10, 20);
        }
    }
  };

  const processGestures = (landmarksArray: NormalizedLandmark[][]): GestureAction => {
    const { onRotateChange, onStateChange, onZoomChange, onPhotoFocusChange } = propsRef.current;

    if (!landmarksArray || landmarksArray.length === 0) {
        smoothedVelocity.current *= 0.8;
        if (Math.abs(smoothedVelocity.current) > 0.001) {
            onRotateChange(smoothedVelocity.current);
        } else {
            onRotateChange(0);
        }
        
        pinchState.current.isPinched = false;
        pinchState.current.isLocked = false;
        lastWristPos.current = null;
        handsDistanceHistory.current = [];
        return 'NONE';
    }

    const hand1 = landmarksArray[0];
    const hand2 = landmarksArray.length > 1 ? landmarksArray[1] : null;

    // 1. CHAOS (Two Hands Spreading)
    if (hand2) {
        const h1Wrist = hand1[0];
        const h2Wrist = hand2[0];
        const dist = Math.hypot(h1Wrist.x - h2Wrist.x, h1Wrist.y - h2Wrist.y);
        
        handsDistanceHistory.current.push(dist);
        if (handsDistanceHistory.current.length > 5) handsDistanceHistory.current.shift();

        if (handsDistanceHistory.current.length >= 3) {
            const currentDist = handsDistanceHistory.current[handsDistanceHistory.current.length - 1];
            const prevDist = handsDistanceHistory.current[0]; 
            if (currentDist - prevDist > CHAOS_SPREAD_SPEED_THRESHOLD) {
                onStateChange(TreeState.CHAOS);
                return 'CHAOS';
            }
        }
    } else {
        handsDistanceHistory.current = [];
    }

    // 2. FORM (Fist)
    const checkFist = (hand: NormalizedLandmark[]) => {
        const wrist = hand[0];
        const tips = [8, 12, 16, 20];
        const THRESHOLD = 0.15; 
        return tips.every(idx => {
            const d = Math.hypot(hand[idx].x - wrist.x, hand[idx].y - wrist.y);
            return d < THRESHOLD;
        });
    };

    if (checkFist(hand1)) {
        onStateChange(TreeState.FORMED);
        return 'FORM';
    }

    // 3. PINCH (Zoom / Focus)
    const thumb = hand1[4];
    const index = hand1[8];
    const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
    const isPinched = pinchDist < 0.06;

    if (isPinched && !pinchState.current.isPinched) {
        const now = performance.now();
        if (now - pinchState.current.lastPinchReleaseTime < DOUBLE_PINCH_TIMING) {
            pinchState.current.isLocked = true;
        }
    }
    if (!isPinched && pinchState.current.isPinched) {
        pinchState.current.lastPinchReleaseTime = performance.now();
        if (pinchState.current.isLocked) {
             pinchState.current.isLocked = false;
             onPhotoFocusChange(false); 
        }
    }
    pinchState.current.isPinched = isPinched;

    if (pinchState.current.isLocked) {
        onPhotoFocusChange(true);
        onRotateChange(0); 
        return 'LOCKED_FOCUS';
    }

    // 4. ROTATION & ZOOM (Palm Drag)
    const wrist = hand1[0];
    let dX = 0;
    let dY = 0;

    if (lastWristPos.current) {
        dX = wrist.x - lastWristPos.current.x;
        dY = wrist.y - lastWristPos.current.y;
    }
    lastWristPos.current = { x: wrist.x, y: wrist.y };

    // Rotation
    if (Math.abs(dX) > ROTATION_THRESHOLD) {
        const sign = Math.sign(dX);
        const val = Math.abs(dX) - ROTATION_THRESHOLD; 
        const rotInput = sign * Math.pow(val, 1.2) * ROTATION_SENSITIVITY;
        smoothedVelocity.current = smoothedVelocity.current * 0.8 + rotInput * 0.2;
    } else {
        smoothedVelocity.current *= 0.8;
    }
    onRotateChange(smoothedVelocity.current);

    // Zoom
    if (Math.abs(dY) > ZOOM_THRESHOLD) {
        const zoomDelta = -dY * ZOOM_SENSITIVITY; 
        currentZoomLevel.current = Math.max(0, Math.min(1, currentZoomLevel.current + zoomDelta));
        onZoomChange(currentZoomLevel.current);
    }

    return 'CONTROL';
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