import { 
  Activity, 
  Download, 
  Layers, 
  Plus, 
  Code, 
  Globe,
  Bug,
  Sun,
  Moon
} from "lucide-react";
import envkuLogo from "../assets/envku-logo.svg";

interface SidebarProps {
  activeTab: "dashboard" | "downloader" | "services" | "wizard" | "php" | "node" | "support";
  setActiveTab: (tab: "dashboard" | "downloader" | "services" | "wizard" | "php" | "node" | "support") => void;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
}

export default function Sidebar({ activeTab, setActiveTab, theme, setTheme }: SidebarProps) {
  return (
    <aside className="w-[240px] border-r border-zinc-800 bg-zinc-950/80 backdrop-blur-2xl flex flex-col justify-between p-6 z-20 shrink-0">
      <div className="space-y-8">
        
        {/* Brand header */}
        <div className="flex items-center space-x-3.5 px-2">
          <div className="p-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
            <img src={envkuLogo} alt="Envku Logo" className="w-7 h-7 rounded-lg object-contain shadow-md shadow-indigo-500/15" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-white tracking-wide uppercase">Envku</h1>
            <span className="text-xs text-zinc-500 font-mono tracking-widest block mt-0.5">ORCHESTRATOR</span>
          </div>
        </div>

        {/* Navigation Tab Links */}
        <nav className="space-y-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
              activeTab === "dashboard" 
                ? "bg-zinc-800/90 text-white font-bold border border-zinc-700/60 shadow-lg shadow-black/35" 
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
            }`}
          >
            <Activity className="w-5 h-5 shrink-0" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab("downloader")}
            className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
              activeTab === "downloader" 
                ? "bg-zinc-800/90 text-white font-bold border border-zinc-700/60 shadow-lg shadow-black/35" 
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
            }`}
          >
            <Download className="w-5 h-5 shrink-0" />
            <span>Downloader</span>
          </button>

          <button
            onClick={() => setActiveTab("services")}
            className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
              activeTab === "services" 
                ? "bg-zinc-800/90 text-white font-bold border border-zinc-700/60 shadow-lg shadow-black/35" 
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
            }`}
          >
            <Layers className="w-5 h-5 shrink-0" />
            <span>Service Panel</span>
          </button>

          <button
            onClick={() => setActiveTab("wizard")}
            className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
              activeTab === "wizard" 
                ? "bg-zinc-800/90 text-white font-bold border border-zinc-700/60 shadow-lg shadow-black/35" 
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
            }`}
          >
            <Plus className="w-5 h-5 shrink-0" />
            <span>Project Wizard</span>
          </button>

          <button
            onClick={() => setActiveTab("php")}
            className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
              activeTab === "php" 
                ? "bg-zinc-800/90 text-white font-bold border border-zinc-700/60 shadow-lg shadow-black/35" 
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
            }`}
          >
            <Code className="w-5 h-5 shrink-0" />
            <span>PHP Switcher</span>
          </button>

          <button
            onClick={() => setActiveTab("node")}
            className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
              activeTab === "node" 
                ? "bg-zinc-800/90 text-white font-bold border border-zinc-700/60 shadow-lg shadow-black/35" 
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
            }`}
          >
            <Globe className="w-5 h-5 shrink-0" />
            <span>Node.js / NVM</span>
          </button>

          <button
            onClick={() => setActiveTab("support")}
            className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
              activeTab === "support" 
                ? "bg-zinc-800/90 text-white font-bold border border-zinc-700/60 shadow-lg shadow-black/35" 
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
            }`}
          >
            <Bug className="w-5 h-5 shrink-0" />
            <span>Lapor Bug & Star</span>
          </button>
        </nav>
      </div>

      <div className="space-y-4">
        {/* Theme Toggle */}
        <div className="border-t border-zinc-850 pt-4">
          <label className="text-[10px] font-black uppercase tracking-wider block mb-2 text-center">
            Tampilan / Mode
          </label>
          <div className="flex items-center justify-between bg-black/15 border-2 border-black p-0.5 rounded">
            <button
              onClick={() => setTheme("light")}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 text-xs font-black uppercase transition-all cursor-pointer ${
                theme === "light"
                  ? "bg-[#FFE600] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000000]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Sun className="w-3.5 h-3.5 shrink-0" />
              <span>Terang</span>
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 text-xs font-black uppercase transition-all cursor-pointer ${
                theme === "dark"
                  ? "bg-[#8B5CF6] text-white border-2 border-black shadow-[2px_2px_0px_0px_#000000]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Moon className="w-3.5 h-3.5 shrink-0" />
              <span>Gelap</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="border-t border-zinc-800/60 pt-4 text-xs text-zinc-500 font-mono flex items-center justify-between">
          <span>Admin Elevated</span>
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
        </div>
      </div>
    </aside>
  );
}
