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
      // Auto-generate after selecting files
      onGenerate();
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-8 z-10">
      
      {/* Header */}
      <header className="text-center mt-4 pointer-events-auto">
        <h1 className="text-4xl md:text-6xl text-yellow-500 font-bold tracking-widest uppercase drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]" style={{ fontFamily: '"Cinzel", serif' }}>
          Merry Christmas
        </h1>
        <p className="text-emerald-400 text-sm md:text-lg mt-2 tracking-[0.2em] font-light italic" style={{ fontFamily: '"Playfair Display", serif' }}>
          Dear. XYZA
        </p>
      </header>

      {/* Button Positioned Above Camera (Bottom Left) */}
      <div className="pointer-events-auto absolute left-[20px] bottom-[220px]">
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
            relative px-12 py-4
            border-2 border-yellow-500
            text-yellow-400 font-bold font-serif text-xl tracking-[0.1em] uppercase
            transition-all duration-500 ease-out
            group overflow-hidden rounded-sm
            bg-gradient-to-r from-[#0a2f15]/90 to-[#000]/90 backdrop-blur-md
            hover:text-white hover:border-yellow-200 hover:shadow-[0_0_30px_rgba(255,215,0,0.4)]
          `}
        >
          <span className="relative z-10 drop-shadow-md flex items-center gap-2">
            Upload & Light Up
          </span>
          {/* Shine effect */}
          <div className="absolute inset-0 bg-yellow-400/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
        </button>
      </div>

      {/* Footer / Credits */}
      <div className="absolute bottom-4 right-4 text-right opacity-80">
        <p className="text-yellow-200/80 text-sm font-serif tracking-widest">
            Designed by 文弱李工
        </p>
      </div>
    </div>
  );
};