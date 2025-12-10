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
const FIST_THRESHOLD = 0.20; // Increased from 0.18 to make it easier to trigger
const CHAOS_SPREAD_SPEED_THRESHOLD = 0.015; // Slightly easier to trigger

// Interaction Config
const ROTATION_THRESHOLD = 0.002; // Reduced deadzone for more responsiveness
const ZOOM_THRESHOLD = 0.005;      
const ROTATION_SENSITIVITY = 25.0; // Adjusted for natural feel
const ZOOM_SENSITIVITY = 2.0;       

// Throttling for Mobile Performance
const DETECTION_INTERVAL = 33; // ~30 FPS

type GestureAction = 'LOCKED_FOCUS' | 'FORM' | 'CHAOS' | 'CONTROL' | 'NONE';

export const HandController: React.FC<HandControllerProps> = ({ 
  onStateChange, 
  onZoomChange, 
  onRotateChange,
  onPhotoFocusChange
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string>('Initializing AI...');
  
  const requestRef = useRef<number>(0);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
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

    const initMediaPipe = async () => {
      try {
        setStatus("Loading Model...");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );
        
        if (!isActive) return;

        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        
        if (isActive) {
            setStatus("Starting Camera...");
            await startWebcam();
        }
      } catch (error) {
        console.error("Error initializing MediaPipe:", error);
        setStatus("AI Init Failed");
      }
    };

    initMediaPipe();

    return () => {
      isActive = false;
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
      let stream: MediaStream;
      
      // 1. Prefer user-facing camera
      try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: "user",
                width: { ideal: 640 }, // Lower res for better performance
                height: { ideal: 480 } 
            }
          });
      } catch (e) {
          console.warn("User camera failed, trying fallback...", e);
          // 2. Fallback to any camera
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.error("Play error:", e));
          setStatus(""); // Clear status on success
      };

      requestRef.current = requestAnimationFrame(predictLoop);
    } catch (err) {
      console.error("Webcam denied:", err);
      setStatus("Camera Denied");
    }
  };

  const predictLoop = (time: number) => {
    // Throttle Detection to ~30FPS to save GPU for Three.js
    if (time - lastProcessTimeRef.current >= DETECTION_INTERVAL) {
        lastProcessTimeRef.current = time;
        detect();
    }
    requestRef.current = requestAnimationFrame(predictLoop);
  };

  const detect = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = handLandmarkerRef.current;

    if (!video || !canvas || !landmarker) return;
    if (video.paused || video.ended) return;

    // Check if video has data
    if (video.readyState < 2) return; 

    // Resize canvas to match video (crucial for alignment)
    if (video.videoWidth > 0 && video.videoHeight > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        // Only detect if size is valid
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const startTimeMs = performance.now();
        const results = landmarker.detectForVideo(video, startTimeMs);

        // Clear Canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Visuals
        const drawingUtils = new DrawingUtils(ctx);
        
        if (results.landmarks) {
            for (const landmarks of results.landmarks) {
                // Draw high-tech looking skeleton
                drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                    color: '#00ff44', lineWidth: 3
                });
                drawingUtils.drawLandmarks(landmarks, {
                    color: '#FFD700', lineWidth: 0, radius: 3
                });
            }
        }

        const action = processGestures(results.landmarks);
        
        // Draw HUD
        if (action !== 'NONE' || status) {
            ctx.fillStyle = "rgba(0, 10, 5, 0.8)";
            ctx.roundRect(10, 10, 180, 40, 8);
            ctx.fill();
            ctx.strokeStyle = "#FFD700";
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = action === 'LOCKED_FOCUS' ? "#ff3366" : "#00ff44";
            ctx.font = "bold 16px 'Courier New', monospace";
            const text = status || `ACT: ${action}`;
            ctx.fillText(text, 25, 35);
        }
    }
  };

  const processGestures = (landmarksArray: NormalizedLandmark[][]): GestureAction => {
    const now = performance.now();

    if (!landmarksArray || landmarksArray.length === 0) {
        // Decay velocity if no hand detected
        smoothedVelocity.current *= 0.8;
        if (Math.abs(smoothedVelocity.current) > 0.001) {
            onRotateChange(smoothedVelocity.current);
        } else {
            onRotateChange(0);
        }
        
        pinchState.current.isPinched = false;
        pinchState.current.isLocked = false;
        pinchState.current.clickCount = 0;
        lastWristPos.current = null;
        handsDistanceHistory.current = [];
        return 'NONE';
    }

    const hand1 = landmarksArray[0];
    const hand2 = landmarksArray.length > 1 ? landmarksArray[1] : null;

    // --- 1. CHAOS (Spread Hands) ---
    let isSpreading = false;
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

    // --- 2. FORM (Fist) ---
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
    const isCurrentlyPinched = pinchDist < 0.06;

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
             onPhotoFocusChange(false); 
        }
    }
    pinchState.current.isPinched = isCurrentlyPinched;

    if (pinchState.current.isLocked) {
        onPhotoFocusChange(true);
        onRotateChange(0); 
        return 'LOCKED_FOCUS';
    }

    // --- 4. CONTROL (Spatial Drag) ---
    const wrist = hand1[0];
    let dX = 0;
    let dY = 0;

    if (lastWristPos.current) {
        dX = wrist.x - lastWristPos.current.x;
        dY = wrist.y - lastWristPos.current.y;
    }
    lastWristPos.current = { x: wrist.x, y: wrist.y };

    let rotInput = 0;
    if (Math.abs(dX) > ROTATION_THRESHOLD) {
        const sign = Math.sign(dX);
        const val = Math.abs(dX);
        rotInput = sign * Math.pow(val, 1.2) * ROTATION_SENSITIVITY;
    }

    smoothedVelocity.current = smoothedVelocity.current * 0.6 + rotInput * 0.4;
    
    onRotateChange(smoothedVelocity.current);

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
      <video 
        ref={videoRef} 
        id="webcam-video" 
        autoPlay 
        playsInline 
        muted 
        // Style removed to rely on CSS. Do not use display: none
      />
      <canvas ref={canvasRef} id="webcam-canvas" />
    </div>
  );
};