import React, { useRef, useState } from 'react';
import { TreeState } from '../types';

interface OverlayProps {
  currentState: TreeState;
  onToggle: () => void;
  onUpload: (files: FileList) => void;
  onGenerate: () => void;
}

export const Overlay: React.FC<OverlayProps> = ({ currentState, onToggle, onUpload, onGenerate }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileCount, setFileCount] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileCount(e.target.files.length);
      onUpload(e.target.files);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-8 z-10">
      
      {/* Header */}
      <header className="text-center mt-4 pointer-events-auto">
        <h1 className="text-4xl md:text-6xl text-yellow-500 font-bold tracking-widest uppercase drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]" style={{ fontFamily: '"Cinzel", serif' }}>
          Christmas Grandeur
        </h1>
        <p className="text-emerald-300 text-sm md:text-lg mt-2 tracking-[0.2em] font-light italic" style={{ fontFamily: '"Playfair Display", serif' }}>
          Interactive Luxury Edition
        </p>
      </header>

      {/* Controls */}
      <div className="mb-12 pointer-events-auto flex flex-col items-center gap-6">
        
        {/* Upload Section */}
        <div className="flex flex-col items-center gap-4">
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                multiple
                className="hidden" 
            />
            
            <button
            onClick={handleUploadClick}
            className={`
                relative px-8 py-3 
                border border-yellow-600/50
                text-yellow-100 font-serif text-sm tracking-widest uppercase
                transition-all duration-300 ease-out
                bg-black/60 backdrop-blur-md
                hover:bg-yellow-900/40 hover:border-yellow-400 hover:text-white
                flex items-center gap-2
            `}
            >
              <span>{fileCount > 0 ? `${fileCount} Photos Selected` : "Upload Photos"}</span>
            </button>

            {/* Generate Button (Main Action) */}
            <button
              onClick={onGenerate}
              disabled={fileCount === 0 && currentState === TreeState.CHAOS} // Optional: allow generating without photos if user just wants the tree
              className={`
                relative px-16 py-5
                border-2 border-yellow-500
                text-yellow-400 font-bold font-serif text-2xl tracking-[0.2em] uppercase
                transition-all duration-500 ease-out
                group overflow-hidden
                bg-gradient-to-b from-[#0a2f15] to-[#000]
                hover:text-white hover:border-yellow-200 hover:shadow-[0_0_40px_rgba(255,215,0,0.6)]
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <span className="relative z-10 drop-shadow-md">
                Generate
              </span>
              {/* Shine effect */}
              <div className="absolute inset-0 bg-yellow-400/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
            </button>
        </div>
      </div>

      {/* Interaction Hint */}
      <div className="absolute bottom-4 right-4 text-right opacity-60">
        <p className="text-yellow-200 text-xs font-serif tracking-wider leading-relaxed">
          <b>Gestures Enabled</b><br/>
          Pinch to Form &bull; Spread to Scatter<br/>
          Push Palm to Zoom &bull; Swipe to Spin
        </p>
      </div>
    </div>
  );
};