import envkuLogo from "../assets/envku-logo.svg";
import packageJson from "../../package.json";

interface SplashscreenProps {
  isSplash: boolean;
}

export default function Splashscreen({ isSplash }: SplashscreenProps) {
  if (!isSplash) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-transparent select-none font-sans overflow-hidden">
      {/* Centered Brutalist Panel */}
      <div 
        className="w-[360px] p-8 flex flex-col items-center gap-6 bg-[#16171d] border-[4px] border-black shadow-[8px_8px_0px_#000000] relative overflow-hidden"
        style={{ animation: "splashFadeUp 0.6s ease-out both" }}
      >
        {/* Brutalist Header bar */}
        <div className="w-[calc(100%+64px)] flex items-center justify-between border-b-[3px] border-black bg-[#FFE600] px-4 py-2 -mt-8 -mx-8">
          <span className="text-[10px] font-black text-black tracking-widest font-mono">ENVKU - INITIALIZING</span>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 border-2 border-black bg-white" />
            <span className="w-3 h-3 border-2 border-black bg-black" />
          </div>
        </div>

        {/* Logo box */}
        <div className="p-3 border-[3px] border-black bg-[#FFE600] shadow-[4px_4px_0px_#000000] mt-2">
          <img src={envkuLogo} alt="Envku" className="w-[56px] h-[56px]" />
        </div>

        {/* Brand text */}
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-wider text-white uppercase" style={{ textShadow: "2px 2px 0px #000" }}>
            Envku
          </h1>
          <span className="text-[9px] font-bold tracking-[0.35em] text-[#38BDF8] block font-mono mt-1" style={{ textShadow: "1px 1px 0px #000" }}>
            ORCHESTRATOR
          </span>
        </div>

        {/* Loading Indicator bar */}
        <div className="w-full flex flex-col items-center gap-4 mt-2">
          <div className="w-full h-4 border-[3px] border-black bg-black overflow-hidden relative">
            <div 
              className="h-full bg-[#FFE600] border-r-[3px] border-black transition-all duration-300"
              style={{ 
                width: "100%",
                background: "repeating-linear-gradient(45deg, #FFE600, #FFE600 10px, #e2cb00 10px, #e2cb00 20px)",
                animation: "splashShimmer 2s linear infinite",
                backgroundSize: "40px 40px"
              }} 
            />
          </div>

          {/* Status and Version Info */}
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-[11px] font-mono font-bold text-[#34D399] tracking-wider animate-pulse uppercase">
              {">> "}MEMPERSIAPKAN LINGKUNGAN...
            </p>
            <span className="text-[9px] font-mono text-zinc-500 font-bold uppercase">VERSION v{packageJson.version}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
