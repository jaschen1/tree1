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
  const [recipientName, setRecipientName] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileCount(e.target.files.length);
      onUpload(e.target.files);
      // Auto-generate after selecting files
      onGenerate();
      setIsSubmitted(true);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-8 z-10">
      
      {/* Dynamic Keyframes for the shine effect */}
      <style>{`
        @keyframes metallicShine {
          0% { background-position: -100% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* Header */}
      <header className="text-center mt-4 pointer-events-auto w-full">
        <h1 
            className="text-5xl md:text-8xl font-bold tracking-wide" 
            style={{
                fontFamily: '"Pinyon Script", cursive',
                // Complex gradient for metallic luster
                background: 'linear-gradient(110deg, #aa771c 10%, #FBF5B7 28%, #eebb66 40%, #FFFFF0 50%, #eebb66 60%, #FBF5B7 72%, #aa771c 90%)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))',
                animation: 'metallicShine 4s linear infinite' // Rhythmic animation
            }}
        >
          Merry Christmas
        </h1>
        
        {/* User Input Subtitle - Completely Centered, No Underline */}
        <div className="flex items-center justify-center gap-0 mt-2 w-full text-emerald-400 text-sm md:text-lg tracking-[0.2em] font-light italic" style={{ fontFamily: '"Playfair Display", serif' }}>
            <span>Especially for</span>
            <input 
                type="text" 
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="[Name]"
                className="bg-transparent text-center focus:outline-none placeholder-emerald-400/30"
                style={{ 
                    width: 'auto', 
                    minWidth: '80px',
                    maxWidth: '200px',
                    fontFamily: 'inherit',
                    border: 'none',
                    padding: 0
                }}
                readOnly={isSubmitted}
            />
        </div>
      </header>

      {/* Button Positioned Directly Below Camera */}
      {/* Matches index.html logic: left: 20px, width: 16vw */}
      <div 
        className="pointer-events-auto absolute left-[20px] bottom-[20px]"
        style={{ width: '16vw', maxWidth: '200px', minWidth: '100px' }}
      >
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
            relative w-full py-2
            border border-[#D4AF37]
            text-[#FFD700] font-bold font-serif text-sm md:text-md tracking-[0.1em] uppercase
            transition-all duration-500 ease-out
            group overflow-hidden rounded-md
            bg-gradient-to-r from-[#001a0b]/95 to-[#000]/95 backdrop-blur-md
            hover:text-white hover:border-[#FBF5B7] hover:shadow-[0_0_20px_rgba(212,175,55,0.4)]
            flex justify-center items-center
          `}
        >
          <span className="relative z-10 drop-shadow-md flex items-center gap-2" style={{ fontFamily: '"Playfair Display", serif' }}>
            上传照片
          </span>
          {/* Shine effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FBF5B7]/20 to-transparent translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out" />
        </button>
      </div>

      {/* Footer / Credits */}
      <div className="absolute bottom-4 right-4 text-right opacity-80">
        <p className="text-yellow-200/60 text-xs font-serif tracking-widest">
            Designed by 文弱李工
        </p>
      </div>
    </div>
  );
};