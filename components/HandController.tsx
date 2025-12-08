import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
import { TreeState } from '../types';

interface HandControllerProps {
  onStateChange: (state: TreeState) => void;
  onZoomChange: (factor: number) => void; // 0 (far) to 1 (close)
  onRotateChange: (velocity: number) => void;
}

export const HandController: React.FC<HandControllerProps> = ({ 
  onStateChange, 
  onZoomChange, 
  onRotateChange 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const lastVideoTimeRef = useRef(-1);
  const requestRef = useRef<number>(0);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);

  // Gesture State
  const lastHandX = useRef<number | null>(null);
  const pinchFrames = useRef(0);
  const openHandFrames = useRef(0);
  const lastZoomFactor = useRef(0.5);

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
      setIsLoaded(true);
    } catch (err) {
      console.error("Webcam access denied", err);
    }
  };

  const predictWebcam = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = handLandmarkerRef.current;

    if (video && canvas && landmarker && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      
      // Resize canvas to match video
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Clear canvas for transparency
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const startTimeMs = performance.now();
        const results = landmarker.detectForVideo(video, startTimeMs);
        const drawingUtils = new DrawingUtils(ctx);

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          
          // --- 1. VISUALIZATION (Wireframe) ---
          // Draw connectors (Skeleton)
          drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
            color: '#00ff44', // Green Matrix-style lines
            lineWidth: 3
          });
          // Draw landmarks (Joints)
          drawingUtils.drawLandmarks(landmarks, {
            color: '#FFD700', // Gold joints
            lineWidth: 1,
            radius: 3
          });

          // --- 2. GESTURE LOGIC ---
          processGestures(landmarks);
        } else {
          // No hand detected
          onRotateChange(0);
        }
      }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  const processGestures = (landmarks: any[]) => {
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const palmCenter = { x: landmarks[9].x, y: landmarks[9].y }; // Middle finger MCP

    // --- A. AGGREGATION (Tree State) ---
    // Calculate "Spread": Average distance of finger tips from palm center
    const tips = [thumbTip, indexTip, middleTip, ringTip, pinkyTip];
    let totalDist = 0;
    tips.forEach(tip => {
      totalDist += Math.hypot(tip.x - palmCenter.x, tip.y - palmCenter.y);
    });
    const avgSpread = totalDist / 5;

    // Thresholds: Small spread = Fist/Pinch; Large spread = Open Hand
    // Typical values: Open ~0.15+, Fist ~0.05
    const isGathered = avgSpread < 0.12; 
    const isScattered = avgSpread > 0.18;

    if (isGathered) {
      pinchFrames.current++;
      openHandFrames.current = 0;
      // Require sustained gesture to avoid flicker
      if (pinchFrames.current > 5) onStateChange(TreeState.FORMED);
    } else if (isScattered) {
      openHandFrames.current++;
      pinchFrames.current = 0;
      if (openHandFrames.current > 5) onStateChange(TreeState.CHAOS);
    } else {
      // Neutral state - maintain current, just decay counters
      pinchFrames.current = Math.max(0, pinchFrames.current - 1);
      openHandFrames.current = Math.max(0, openHandFrames.current - 1);
    }

    // --- B. ZOOM (Palm Depth) ---
    // We can estimate depth by the distance between wrist and middle finger MCP (Palm length)
    // Larger length = Closer to camera
    const palmLength = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);
    // Map 0.1 (Far) -> 0.4 (Close) to Zoom 0 -> 1
    const rawZoom = (palmLength - 0.15) * 3.5; 
    const clampedZoom = Math.max(0, Math.min(1, rawZoom));
    
    // Smooth Lerp
    lastZoomFactor.current = lastZoomFactor.current + (clampedZoom - lastZoomFactor.current) * 0.15;
    onZoomChange(lastZoomFactor.current);

    // --- C. ROTATION (Swipe) ---
    // Only rotate if hand is somewhat vertical (palm facing camera, not pointing down for commands)
    const currentX = wrist.x;
    
    // Check if fingers are pointed up (Wrist Y > Finger Y because Y increases downwards in screen coords)
    const isHandUpright = wrist.y > middleTip.y;

    if (lastHandX.current !== null && isHandUpright) {
      const deltaX = currentX - lastHandX.current;
      
      // Sensitivity Threshold
      if (Math.abs(deltaX) > 0.005) {
        // Negative multiplier because mirroring + 3D rotation direction
        // Moving hand right (on screen) -> Rotate Tree Right
        onRotateChange(-deltaX * 2.0);
      } else {
         onRotateChange(0);
      }
    }
    lastHandX.current = currentX;
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