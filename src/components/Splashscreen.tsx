import envkuLogo from "../assets/envku-logo.svg";
import packageJson from "../../package.json";

interface SplashscreenProps {
  isSplash: boolean;
}

export default function Splashscreen({ isSplash }: SplashscreenProps) {
  if (!isSplash) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-transparent select-none font-sans overflow-hidden">
      {/* Centered Cream Brutalist Panel */}
      <div 
        className="w-[360px] p-8 flex flex-col items-center gap-6 bg-[#fffefb] border-4 border-[#09090b] shadow-[8px_8px_0px_0px_#09090b] relative overflow-hidden"
        style={{ animation: "splashFadeUp 0.6s ease-out both" }}
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
        <div className="w-full flex flex-col items-center gap-4 mt-2">
          <div className="w-full h-4 border-3 border-[#09090b] bg-[#eae6df] overflow-hidden relative">
            <div 
              className="h-full bg-[#fde047] border-r-3 border-[#09090b] transition-all duration-300"
              style={{ 
                width: "100%",
                background: "repeating-linear-gradient(45deg, #fde047, #fde047 10px, #e2cb00 10px, #e2cb00 20px)",
                animation: "splashShimmer 2s linear infinite",
                backgroundSize: "40px 40px"
              }} 
            />
          </div>

          {/* Status and Version Info */}
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-[11px] font-mono font-black text-[#14532d] tracking-wider animate-pulse uppercase">
              {">> "}MEMPERSIAPKAN LINGKUNGAN...
            </p>
            <span className="text-[10px] font-mono text-[#52525b] font-extrabold uppercase">VERSION v{packageJson.version}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
