import { invoke } from "@tauri-apps/api/core";
import { Terminal, RefreshCw, FolderCheck, Folder, Activity } from "lucide-react";

interface DashboardTabProps {
  dirsLoading: boolean;
  dirsStatus: { [key: string]: boolean };
  checkDirectories: () => void;
  services: {
    Apache: { running: boolean };
    MySQL: { running: boolean };
    Redis: { running: boolean };
  };
}

export default function DashboardTab({
  dirsLoading,
  dirsStatus,
  checkDirectories,
  services,
}: DashboardTabProps) {
  const handleOpenTerminal = async () => {
    try {
      await invoke("open_terminal");
    } catch (err) {
      console.error("Gagal membuka terminal", err);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#09090b] tracking-tight">Status Lingkungan</h2>
          <p className="text-xs sm:text-sm text-[#52525b] mt-1 font-semibold">Verifikasi integritas direktori sistem server Anda secara real-time.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleOpenTerminal}
            className="flex items-center space-x-2 py-2.5 px-4 bg-[#fde047] text-[#09090b] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] hover:bg-[#fef08a] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#09090b] text-xs font-extrabold transition cursor-pointer uppercase"
          >
            <Terminal className="w-4 h-4 shrink-0" />
            <span>Terminal Envku</span>
          </button>
          <button
            onClick={checkDirectories}
            className="flex items-center space-x-2 py-2.5 px-4 bg-[#ffffff] text-[#18181b] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#09090b] text-xs font-extrabold transition cursor-pointer uppercase"
          >
            <RefreshCw className="w-4 h-4 shrink-0" />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Status Directories Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {dirsLoading
          ? Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="p-4 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] flex items-center justify-between min-w-0">
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  <div className="p-3 bg-[#eae6df] border-2 border-[#09090b] animate-pulse shrink-0">
                    <div className="w-5 h-5 bg-[#d6d1c7]" />
                  </div>
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="h-4 w-24 bg-[#eae6df] border border-[#09090b] animate-pulse" />
                    <div className="h-3 w-36 bg-[#eae6df] border border-[#09090b] animate-pulse" />
                  </div>
                </div>
                <div className="h-6 w-16 bg-[#eae6df] border border-[#09090b] animate-pulse shrink-0" />
              </div>
            ))
          : Object.entries(dirsStatus).map(([path, exists]) => (
            <div 
              key={path} 
              className="p-4 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] flex items-center justify-between min-w-0"
            >
              <div className="flex items-center space-x-3.5 min-w-0 flex-1 mr-2">
                <div className={`p-2.5 border-2 border-[#09090b] shrink-0 ${
                  exists ? "bg-[#bbf7d0] text-[#14532d]" : "bg-[#fecaca] text-[#7f1d1d]"
                }`}>
                  {exists ? <FolderCheck className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-black text-[#09090b] block font-mono truncate">{path.split(/[/\\]/).pop()}</span>
                  <span className="text-[11px] text-[#52525b] font-mono block mt-0.5 truncate font-semibold" title={path}>{path}</span>
                </div>
              </div>
              <span className={`text-[10px] font-black px-2.5 py-1 border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] shrink-0 ${
                exists ? "bg-[#bbf7d0] text-[#14532d]" : "bg-[#fecaca] text-[#7f1d1d]"
              }`}>
                {exists ? "ADA" : "TDK ADA"}
              </span>
            </div>
          ))
        }
      </div>

      {/* Services status brief */}
      <div className="p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] space-y-4">
        <div className="flex items-center space-x-2 text-xs font-black text-[#09090b] uppercase tracking-wider">
          <Activity className="w-4 h-4 text-[#09090b]" />
          <span>Layanan Server Aktif</span>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center bg-[#fffefb] border-2.5 border-[#09090b] p-3.5 shadow-[2px_2px_0px_0px_#09090b]">
            <span className="text-xs font-bold text-[#18181b]">Apache HTTP Server (Port 80)</span>
            <span className="flex items-center space-x-2">
              <span className={`text-[11px] font-black px-2.5 py-0.5 border-2 border-[#09090b] ${
                services.Apache.running ? "bg-[#bbf7d0] text-[#14532d]" : "bg-[#fecaca] text-[#7f1d1d]"
              }`}>
                {services.Apache.running ? "RUNNING" : "OFFLINE"}
              </span>
            </span>
          </div>
          <div className="flex justify-between items-center bg-[#fffefb] border-2.5 border-[#09090b] p-3.5 shadow-[2px_2px_0px_0px_#09090b]">
            <span className="text-xs font-bold text-[#18181b]">MySQL Database Server (Port 3306)</span>
            <span className="flex items-center space-x-2">
              <span className={`text-[11px] font-black px-2.5 py-0.5 border-2 border-[#09090b] ${
                services.MySQL.running ? "bg-[#bbf7d0] text-[#14532d]" : "bg-[#fecaca] text-[#7f1d1d]"
              }`}>
                {services.MySQL.running ? "RUNNING" : "OFFLINE"}
              </span>
            </span>
          </div>
          <div className="flex justify-between items-center bg-[#fffefb] border-2.5 border-[#09090b] p-3.5 shadow-[2px_2px_0px_0px_#09090b]">
            <span className="text-xs font-bold text-[#18181b]">Redis Cache Server (Port 6379)</span>
            <span className="flex items-center space-x-2">
              <span className={`text-[11px] font-black px-2.5 py-0.5 border-2 border-[#09090b] ${
                services.Redis.running ? "bg-[#bbf7d0] text-[#14532d]" : "bg-[#fecaca] text-[#7f1d1d]"
              }`}>
                {services.Redis.running ? "RUNNING" : "OFFLINE"}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
