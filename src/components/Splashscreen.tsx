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
    const duration = 4000; // 4.0s smooth duration for full 0% -> 100% progress

    // Organic S-curve (easeInOutCubic) for ultra-fluid, natural acceleration & deceleration
    const easeInOutCubic = (t: number): number => {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const linearProgress = Math.min(1, elapsed / duration);
      
      const eased = easeInOutCubic(linearProgress);
      const currentPct = Math.min(100, eased * 100);

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
    if (pct < 18) return "MEMBACA KONFIGURASI SISTEM...";
    if (pct < 40) return "MEMERIKSA LAYANAN APACHE & MYSQL...";
    if (pct < 65) return "MEMERIKSA MODUL PHP & NODE.JS...";
    if (pct < 90) return "MENYINKRONKAN LINGKUNGAN PENGEMBANGAN...";
    return "MEMBUKA DASHBOARD ENVKU...";
  };

  if (!isSplash) return null;

  const integerProgress = Math.min(100, Math.floor(progress));

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-transparent select-none font-sans overflow-hidden">
      {/* Centered Cream Brutalist Panel with Glow Pulse */}
      <div 
        className="w-[380px] p-8 flex flex-col items-center gap-6 bg-[#fffefb] border-4 border-[#09090b] shadow-[10px_10px_0px_0px_#09090b] relative overflow-hidden transition-all duration-300"
        style={{ animation: "splashFadeUp 0.6s ease-out both" }}
      >
        {/* Header bar */}
        <div className="w-[calc(100%+64px)] flex items-center justify-between border-b-3 border-[#09090b] bg-[#fde047] px-4 py-2 -mt-8 -mx-8">
          <span className="text-[10px] font-black text-[#09090b] tracking-widest font-mono">ENVKU - INITIALIZING</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 border-2 border-[#09090b] bg-[#ffffff]" />
            <span className="w-2.5 h-2.5 border-2 border-[#09090b] bg-[#09090b]" />
          </div>
        </div>

        {/* Logo box with subtle bounce */}
        <div className="relative flex items-center justify-center mt-2">
          <div className="absolute inset-0 bg-[#fde047] border-2 border-[#09090b] rounded-full scale-110 opacity-30 animate-pulse" />
          <img src={envkuLogo} alt="Envku" className="w-[68px] h-[68px] object-contain relative z-10 transition-transform duration-300 hover:scale-105" />
        </div>

        {/* Brand text */}
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-wider text-[#09090b] uppercase">
            Envku
          </h1>
          <span className="text-[10px] font-black tracking-[0.35em] text-[#52525b] block font-mono mt-1 uppercase">
            ORCHESTRATOR
          </span>
        </div>

        {/* Loading Indicator bar */}
        <div className="w-full flex flex-col items-center gap-3 mt-1">
          {/* Progress track */}
          <div className="w-full h-6 border-3 border-[#09090b] bg-[#eae6df] overflow-hidden relative p-[3px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]">
            <div 
              className="h-full bg-[#fde047] border-r-2 border-[#09090b] relative overflow-hidden"
              style={{ 
                width: `${progress}%`,
                background: "linear-gradient(90deg, #fde047 0%, #fef08a 50%, #fde047 100%)",
                willChange: "width"
              }} 
            >
              {/* Striped overlay */}
              <div 
                className="absolute inset-0 opacity-25"
                style={{
                  background: "repeating-linear-gradient(45deg, #09090b, #09090b 8px, transparent 8px, transparent 16px)",
                  backgroundSize: "22px 22px",
                  animation: "splashShimmer 4s linear infinite"
                }}
              />
            </div>
          </div>

          {/* Status and Percentage Info */}
          <div className="w-full flex justify-between items-center px-1">
            <p className="text-[10px] font-mono font-black text-[#14532d] tracking-wider uppercase truncate max-w-[260px] transition-all duration-300">
              <span className="text-[#09090b] font-extrabold mr-1">❯❯</span> {getStatusText(integerProgress)}
            </p>
            <span className="text-[11px] font-mono font-black text-[#09090b] bg-[#fde047] px-1.5 py-0.5 border-1.5 border-[#09090b] shadow-[1px_1px_0px_0px_#09090b]">
              {integerProgress}%
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
