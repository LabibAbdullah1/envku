import { 
  Activity, 
  Download, 
  Layers, 
  Plus, 
  Code, 
  Globe,
  Bug
} from "lucide-react";
import envkuLogo from "../assets/envku-logo.svg";

interface SidebarProps {
  activeTab: "dashboard" | "downloader" | "services" | "wizard" | "php" | "node" | "support";
  setActiveTab: (tab: "dashboard" | "downloader" | "services" | "wizard" | "php" | "node" | "support") => void;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  return (
    <aside className="w-[240px] border-r-3 border-[#09090b] bg-[#eae6df] flex flex-col justify-between p-6 z-20 shrink-0 select-none">
      <div className="space-y-8">
        
        {/* Brand header */}
        <div className="flex items-center space-x-3 px-1">
          <img src={envkuLogo} alt="Envku Logo" className="w-8 h-8 object-contain shrink-0" />
          <div>
            <h1 className="text-sm font-black text-[#09090b] tracking-wider uppercase">Envku</h1>
            <span className="text-[10px] text-[#52525b] font-mono font-black tracking-widest block mt-0.5">ORCHESTRATOR</span>
          </div>
        </div>

        {/* Navigation Tab Links */}
        <nav className="space-y-2.5">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 text-xs font-black transition-all duration-150 cursor-pointer border-2.5 border-[#09090b] ${
              activeTab === "dashboard" 
                ? "bg-[#fde047] text-[#09090b] shadow-[4px_4px_0px_0px_#09090b]" 
                : "bg-[#ffffff] text-[#18181b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#09090b]"
            }`}
          >
            <Activity className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab("downloader")}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 text-xs font-black transition-all duration-150 cursor-pointer border-2.5 border-[#09090b] ${
              activeTab === "downloader" 
                ? "bg-[#fde047] text-[#09090b] shadow-[4px_4px_0px_0px_#09090b]" 
                : "bg-[#ffffff] text-[#18181b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#09090b]"
            }`}
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Downloader</span>
          </button>

          <button
            onClick={() => setActiveTab("services")}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 text-xs font-black transition-all duration-150 cursor-pointer border-2.5 border-[#09090b] ${
              activeTab === "services" 
                ? "bg-[#fde047] text-[#09090b] shadow-[4px_4px_0px_0px_#09090b]" 
                : "bg-[#ffffff] text-[#18181b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#09090b]"
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>Service Panel</span>
          </button>

          <button
            onClick={() => setActiveTab("wizard")}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 text-xs font-black transition-all duration-150 cursor-pointer border-2.5 border-[#09090b] ${
              activeTab === "wizard" 
                ? "bg-[#fde047] text-[#09090b] shadow-[4px_4px_0px_0px_#09090b]" 
                : "bg-[#ffffff] text-[#18181b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#09090b]"
            }`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Project Wizard</span>
          </button>

          <button
            onClick={() => setActiveTab("php")}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 text-xs font-black transition-all duration-150 cursor-pointer border-2.5 border-[#09090b] ${
              activeTab === "php" 
                ? "bg-[#fde047] text-[#09090b] shadow-[4px_4px_0px_0px_#09090b]" 
                : "bg-[#ffffff] text-[#18181b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#09090b]"
            }`}
          >
            <Code className="w-4 h-4 shrink-0" />
            <span>PHP Switcher</span>
          </button>

          <button
            onClick={() => setActiveTab("node")}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 text-xs font-black transition-all duration-150 cursor-pointer border-2.5 border-[#09090b] ${
              activeTab === "node" 
                ? "bg-[#fde047] text-[#09090b] shadow-[4px_4px_0px_0px_#09090b]" 
                : "bg-[#ffffff] text-[#18181b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#09090b]"
            }`}
          >
            <Globe className="w-4 h-4 shrink-0" />
            <span>Node.js / NVM</span>
          </button>

          <button
            onClick={() => setActiveTab("support")}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 text-xs font-black transition-all duration-150 cursor-pointer border-2.5 border-[#09090b] ${
              activeTab === "support" 
                ? "bg-[#fde047] text-[#09090b] shadow-[4px_4px_0px_0px_#09090b]" 
                : "bg-[#ffffff] text-[#18181b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#09090b]"
            }`}
          >
            <Bug className="w-4 h-4 shrink-0" />
            <span>Lapor Bug & Star</span>
          </button>
        </nav>
      </div>

      <div className="space-y-4">
        {/* Environment Badge */}
        <div className="border-t-2 border-[#09090b] pt-4">
          <div className="bg-[#bbf7d0] border-2 border-[#09090b] p-2.5 shadow-[3px_3px_0px_0px_#09090b] flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-[#14532d] tracking-wider">Base Cream Theme</span>
            <span className="w-2.5 h-2.5 bg-[#14532d] border border-[#09090b] animate-pulse" />
          </div>
        </div>

        {/* Footer info */}
        <div className="border-t-2 border-[#09090b] pt-3 text-[11px] text-[#52525b] font-mono font-bold flex items-center justify-between">
          <span>Admin Elevated</span>
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full bg-[#14532d] opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 bg-[#14532d] border border-[#09090b]"></span>
          </span>
        </div>
      </div>
    </aside>
  );
}
