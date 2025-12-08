import React from 'react';
import { TreeState } from '../types';

interface OverlayProps {
  currentState: TreeState;
  onToggle: () => void;
}

export const Overlay: React.FC<OverlayProps> = ({ currentState, onToggle }) => {
  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-8 z-10">
      
      {/* Header */}
      <header className="text-center mt-4">
        <h1 className="text-4xl md:text-6xl text-yellow-500 font-bold tracking-widest uppercase drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]" style={{ fontFamily: '"Cinzel", serif' }}>
          Christmas Grandeur
        </h1>
        <p className="text-emerald-300 text-sm md:text-lg mt-2 tracking-[0.2em] font-light italic" style={{ fontFamily: '"Playfair Display", serif' }}>
          Interactive Luxury Edition
        </p>
      </header>

      {/* Controls */}
      <div className="mb-12 pointer-events-auto">
        {/* Toggle button preserved as a fallback manual override, but text updated to reflect "magic" */}
        <button
          onClick={onToggle}
          className={`
            relative px-12 py-4 
            border-2 border-yellow-600 
            text-yellow-400 font-serif text-xl tracking-widest uppercase
            transition-all duration-700 ease-out
            group overflow-hidden
            bg-gradient-to-b from-[#0a2f15] to-[#010a05]
            hover:text-white hover:border-yellow-300
            shadow-[0_0_20px_rgba(0,0,0,0.8)]
          `}
        >
          <span className="relative z-10 drop-shadow-md">
            {currentState === TreeState.CHAOS ? "Summon" : "Scatter"}
          </span>
          
          {/* Shine effect */}
          <div className="absolute inset-0 bg-yellow-500/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
        </button>
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