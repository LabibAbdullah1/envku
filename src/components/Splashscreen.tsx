import { useEffect, useState } from "react";
import envkuLogo from "../assets/envku-logo.svg";
import packageJson from "../../package.json";

interface SplashscreenProps {
  isSplash: boolean;
}

export default function Splashscreen({ isSplash }: SplashscreenProps) {
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    if (!isSplash) return;

    let animationFrameId: number;
    const startTime = performance.now();
    const duration = 1500; // 100% progress reached at 1.5s

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const linearProgress = Math.min(1, elapsed / duration);
      
      // Smooth cubic ease-out curve (60 FPS fluid rendering)
      const easeOutCubic = 1 - Math.pow(1 - linearProgress, 3);
      const currentPct = Math.min(100, Math.round(easeOutCubic * 100));

      setProgress(currentPct);

      if (linearProgress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isSplash]);

  const getStatusText = (pct: number) => {
    if (pct < 20) return "MEMBACA KONFIGURASI SISTEM...";
    if (pct < 45) return "MEMERIKSA LAYANAN SERVER PORTABLE...";
    if (pct < 75) return "MEMERIKSA KOMPONEN PHP & APACHE...";
    if (pct < 95) return "MENYINKRONKAN STATUS LINGKUNGAN...";
    return "MEMBUKA DASHBOARD ENVKU...";
  };

  if (!isSplash) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-transparent select-none font-sans overflow-hidden">
      {/* Centered Cream Brutalist Panel */}
      <div 
        className="w-[360px] p-8 flex flex-col items-center gap-6 bg-[#fffefb] border-4 border-[#09090b] shadow-[8px_8px_0px_0px_#09090b] relative overflow-hidden"
        style={{ animation: "splashFadeUp 0.5s ease-out both" }}
      >
        {/* Header bar */}
        <div className="w-[calc(100%+64px)] flex items-center justify-between border-b-3 border-[#09090b] bg-[#fde047] px-4 py-2 -mt-8 -mx-8">
          <span className="text-[10px] font-black text-[#09090b] tracking-widest font-mono">ENVKU - INITIALIZING</span>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 border-2 border-[#09090b] bg-[#ffffff]" />
            <span className="w-3 h-3 border-2 border-[#09090b] bg-[#09090b]" />
          </div>
        </div>

        {/* Logo box */}
        <img src={envkuLogo} alt="Envku" className="w-[60px] h-[60px] object-contain mt-2" />

        {/* Brand text */}
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-wider text-[#09090b] uppercase">
            Envku
          </h1>
          <span className="text-[10px] font-black tracking-[0.3em] text-[#52525b] block font-mono mt-1 uppercase">
            ORCHESTRATOR
          </span>
        </div>

        {/* Loading Indicator bar */}
        <div className="w-full flex flex-col items-center gap-3 mt-1">
          {/* Progress track */}
          <div className="w-full h-5 border-3 border-[#09090b] bg-[#eae6df] overflow-hidden relative p-[2px]">
            <div 
              className="h-full bg-[#fde047] border-r-2 border-[#09090b] will-change-[width]"
              style={{ 
                width: `${progress}%`,
                background: "repeating-linear-gradient(45deg, #fde047, #fde047 10px, #e2cb00 10px, #e2cb00 20px)",
                backgroundSize: "40px 40px"
              }} 
            />
          </div>

          {/* Status and Percentage Info */}
          <div className="w-full flex justify-between items-center px-0.5">
            <p className="text-[10px] font-mono font-black text-[#14532d] tracking-wider uppercase truncate max-w-[240px]">
              {">> "} {getStatusText(progress)}
            </p>
            <span className="text-[11px] font-mono font-black text-[#09090b]">
              {progress}%
            </span>
          </div>

          <span className="text-[9px] font-mono text-[#71717a] font-extrabold uppercase mt-1">
            VERSION v{packageJson.version}
          </span>
        </div>

      </div>
    </div>
  );
}
