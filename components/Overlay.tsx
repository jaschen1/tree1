import React, { useRef, useState } from 'react';
import { TreeState } from '../types';

interface OverlayProps {
  currentState: TreeState;
  onToggle: () => void;
  onUpload: (files: FileList) => void;
  onGenerate: () => void;
  zoomLevel: number;
  onZoomChange: (val: number) => void;
}

export const Overlay: React.FC<OverlayProps> = ({ 
  currentState, 
  onToggle, 
  onUpload, 
  onGenerate,
  zoomLevel,
  onZoomChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recipientName, setRecipientName] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files);
      onGenerate();
      setIsSubmitted(true);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-8 z-10">
      
      <style>{`
        @keyframes metallicShine {
          0% { background-position: -100% center; }
          100% { background-position: 200% center; }
        }
        
        /* Custom Range Slider Styling */
        input[type=range] {
          -webkit-appearance: none; 
          width: 100%; 
          background: transparent; 
        }
        
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #FFD700;
          cursor: pointer;
          margin-top: -6px;
          box-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
        }
        
        input[type=range]::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          cursor: pointer;
          background: rgba(255, 215, 0, 0.3);
          border-radius: 2px;
          border: 1px solid rgba(255, 215, 0, 0.5);
        }
      `}</style>

      {/* Header */}
      <header className="text-center mt-4 pointer-events-auto w-full">
        <h1 
            className="text-5xl md:text-8xl font-extrabold tracking-wide" 
            style={{
                fontFamily: '"Pinyon Script", cursive',
                background: 'linear-gradient(110deg, #aa771c 10%, #FBF5B7 28%, #eebb66 40%, #FFFFF0 50%, #eebb66 60%, #FBF5B7 72%, #aa771c 90%)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))',
                animation: 'metallicShine 4s linear infinite',
                textShadow: '0 0 2px rgba(170, 119, 28, 0.5)'
            }}
        >
          Merry Christmas
        </h1>
        
        <div className="flex items-center justify-center gap-2 mt-2 w-full text-[#4ade80] text-xl md:text-2xl tracking-[0.1em]" style={{ fontFamily: '"Playfair Display", serif' }}>
            <input 
                type="text" 
                value="Especially for"
                readOnly
                className="bg-transparent text-right focus:outline-none cursor-default select-none"
                style={{ 
                    width: 'auto', 
                    minWidth: '120px',
                    fontFamily: 'inherit',
                    border: 'none',
                    padding: 0
                }}
            />
            <input 
                type="text" 
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="[Name]"
                className="bg-transparent text-left focus:outline-none placeholder-[#4ade80]/50"
                style={{ 
                    width: 'auto', 
                    minWidth: '80px',
                    maxWidth: '300px',
                    fontFamily: 'inherit',
                    border: 'none',
                    padding: 0
                }}
                readOnly={isSubmitted}
            />
        </div>
      </header>

      {/* Footer Controls Container */}
      <div className="absolute bottom-6 left-0 right-0 px-6 md:px-12 flex flex-col md:flex-row items-end md:items-center justify-between pointer-events-none gap-4">
        
        {/* Left: Upload Button */}
        <div className="pointer-events-auto w-full md:w-auto flex justify-start">
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                multiple
                className="hidden" 
            />
            <button
            onClick={handleButtonClick}
            className={`
                relative w-40 py-2
                border border-[#D4AF37]
                text-[#FFD700] font-bold font-serif text-sm tracking-[0.1em] uppercase
                transition-all duration-500 ease-out
                group overflow-hidden rounded-md
                bg-black/60 backdrop-blur-md
                hover:text-white hover:border-[#FBF5B7] hover:shadow-[0_0_20px_rgba(212,175,55,0.4)]
                flex justify-center items-center
            `}
            >
            <span className="relative z-10 drop-shadow-md flex items-center gap-2" style={{ fontFamily: '"Playfair Display", serif' }}>
                上传照片
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FBF5B7]/20 to-transparent translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out" />
            </button>
        </div>

        {/* Center: Zoom Slider */}
        <div className="pointer-events-auto w-full md:w-64 flex flex-col items-center gap-1 bg-black/40 backdrop-blur-sm p-3 rounded-lg border border-[#D4AF37]/30">
            <span className="text-[#FFD700] text-[10px] tracking-widest uppercase font-serif opacity-80">Zoom Level</span>
            <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={zoomLevel} 
                onChange={(e) => onZoomChange(parseFloat(e.target.value))}
            />
        </div>

        {/* Right: State Toggle Button */}
        <div className="pointer-events-auto w-full md:w-auto flex justify-end">
            <button
                onClick={onToggle}
                className={`
                    relative w-40 py-2
                    border border-[#D4AF37]
                    text-[#FFD700] font-bold font-serif text-sm tracking-[0.1em] uppercase
                    transition-all duration-500 ease-out
                    group overflow-hidden rounded-md
                    bg-black/60 backdrop-blur-md
                    hover:text-white hover:border-[#FBF5B7] hover:shadow-[0_0_20px_rgba(212,175,55,0.4)]
                    flex justify-center items-center
                `}
            >
                <span className="relative z-10 drop-shadow-md" style={{ fontFamily: '"Playfair Display", serif' }}>
                    {currentState === TreeState.CHAOS ? "聚拢 (FORM)" : "散开 (CHAOS)"}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FBF5B7]/20 to-transparent translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out" />
            </button>
        </div>
      </div>
    </div>
  );
};