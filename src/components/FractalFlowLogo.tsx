import React from 'react';

interface FractalFlowLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-10 h-10 rounded-xl',
  md: 'w-12 h-12 sm:w-14 sm:h-14 rounded-2xl',
  lg: 'w-14 h-14 sm:w-[68px] sm:h-[68px] rounded-2xl',
};

export const FractalFlowLogo: React.FC<FractalFlowLogoProps> = ({
  size = 'md',
  className = '',
}) => {
  return (
    <div
      className={`relative overflow-hidden shrink-0 bg-[#01071b] border border-[#5ee2ff]/50 shadow-[0_0_18px_rgba(34,202,255,0.45),inset_0_0_12px_rgba(56,189,248,0.22)] select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      <img
        src="/assets/aistudio/______b2b426d8.jpg"
        alt="Fractal Flow Logo"
        draggable={false}
        className="w-full h-full object-cover pointer-events-none select-none"
        style={{
          transform: 'scale(1.88) translateY(16%)',
          transformOrigin: '50% 50%',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/15"
      />
    </div>
  );
};

interface FractalFlowBrandCardProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const CARD_SHELL_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'px-2.5 py-1.5 rounded-xl gap-2',
  md: 'px-3 sm:px-4 py-2 rounded-2xl gap-2.5 sm:gap-3',
  lg: 'px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl gap-2.5 sm:gap-3.5',
};

const CARD_EMBLEM_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-8 h-8 sm:w-9 sm:h-9',
  md: 'w-10 h-10 sm:w-12 sm:h-12',
  lg: 'w-11 h-11 sm:w-[58px] sm:h-[58px]',
};

const CARD_WORDMARK_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-7 sm:h-8',
  md: 'h-9 sm:h-11',
  lg: 'h-9 sm:h-[50px]',
};

export const FractalFlowBrandCard: React.FC<FractalFlowBrandCardProps> = ({
  size = 'lg',
  className = '',
}) => {
  return (
    <div
      className={`relative inline-flex items-center overflow-hidden bg-[radial-gradient(ellipse_at_16%_50%,rgba(14,82,196,0.34),transparent_58%),linear-gradient(135deg,#010514_0%,#020b24_55%,#010618_100%)] border border-[#5ee2ff]/50 shadow-[0_0_22px_rgba(34,202,255,0.38),inset_0_0_16px_rgba(56,189,248,0.16)] select-none max-w-full ${CARD_SHELL_CLASSES[size]} ${className}`}
    >
      {/* Unified F Emblem */}
      <div className={`relative overflow-hidden shrink-0 ${CARD_EMBLEM_CLASSES[size]}`}>
        <img
          src="/assets/aistudio/______b2b426d8.jpg"
          alt="Fractal Flow Icon"
          draggable={false}
          className="w-full h-full object-cover mix-blend-screen pointer-events-none select-none"
          style={{
            transform: 'scale(1.92) translateY(16%)',
            transformOrigin: '50% 50%',
          }}
        />
      </div>

      {/* Subtle Divider */}
      <span
        aria-hidden="true"
        className="h-7 sm:h-10 w-[1px] shrink-0 bg-gradient-to-b from-transparent via-[#5ee2ff]/45 to-transparent"
      />

      {/* Unified FRACTAL FLOW Wordmark */}
      <div className="min-w-0 flex items-center">
        <img
          src="/assets/aistudio/image_842fb74c.png"
          alt="FRACTAL FLOW — From One to Infinity"
          draggable={false}
          className={`${CARD_WORDMARK_CLASSES[size]} w-auto max-w-full object-contain mix-blend-screen brightness-110 pointer-events-none select-none`}
        />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10"
      />
    </div>
  );
};
