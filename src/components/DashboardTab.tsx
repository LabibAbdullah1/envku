import { RefreshCw, FolderCheck, Folder, Activity } from "lucide-react";

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
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Status Lingkungan</h2>
          <p className="text-sm text-zinc-400 mt-1">Verifikasi integritas direktori sistem server Anda secara real-time.</p>
        </div>
        <button
          onClick={checkDirectories}
          className="flex items-center space-x-2 py-2 px-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/30 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Segarkan</span>
        </button>
      </div>

      {/* Status Directories Cards Grid */}
      <div className="grid grid-cols-2 gap-5">
        {dirsLoading
          ? Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="p-5 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex items-center justify-between shadow-xl min-w-0">
                <div className="flex items-center space-x-4 min-w-0 flex-1">
                  <div className="p-3 rounded-xl bg-zinc-800/60 animate-pulse shrink-0">
                    <div className="w-6 h-6 rounded bg-zinc-700" />
                  </div>
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="h-3.5 w-24 bg-zinc-700 rounded animate-pulse" />
                    <div className="h-2.5 w-36 bg-zinc-800 rounded animate-pulse" />
                  </div>
                </div>
                <div className="h-6 w-16 bg-zinc-800 rounded-full animate-pulse shrink-0" />
              </div>
            ))
          : Object.entries(dirsStatus).map(([path, exists]) => (
            <div 
              key={path} 
              className="p-5 bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 rounded-2xl flex items-center justify-between shadow-xl min-w-0"
            >
              <div className="flex items-center space-x-4 min-w-0 flex-1 mr-2">
                <div className={`p-3 rounded-xl shrink-0 ${exists ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-850 text-zinc-500"}`}>
                  {exists ? <FolderCheck className="w-6 h-6" /> : <Folder className="w-6 h-6" />}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-extrabold text-zinc-100 block font-mono truncate">{path.split("\\").pop()}</span>
                  <span className="text-xs text-zinc-500 font-mono block mt-0.5 truncate" title={path}>{path}</span>
                </div>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 shrink-0">
                {exists ? "ADA" : "TDK ADA"}
              </span>
            </div>
          ))
        }
      </div>

      {/* Services status brief */}
      <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl space-y-4 shadow-xl">
        <div className="flex items-center space-x-2.5 text-xs font-extrabold text-zinc-400 uppercase tracking-widest">
          <Activity className="w-5 h-5 text-indigo-400" />
          <span>Layanan Server Aktif</span>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center bg-zinc-950/40 border border-zinc-850 p-4 rounded-xl">
            <span className="text-sm font-medium text-zinc-200">Apache HTTP Server (Port 80)</span>
            <span className="flex items-center space-x-2">
              <span className={`text-xs font-semibold ${services.Apache.running ? "text-emerald-400" : "text-zinc-500"}`}>
                {services.Apache.running ? "Running" : "Offline"}
              </span>
              <span className={`h-3 w-3 rounded-full ${services.Apache.running ? "bg-emerald-500" : "bg-zinc-700"}`} />
            </span>
          </div>
          <div className="flex justify-between items-center bg-zinc-950/40 border border-zinc-850 p-4 rounded-xl">
            <span className="text-sm font-medium text-zinc-200">MySQL Database Server (Port 3306)</span>
            <span className="flex items-center space-x-2">
              <span className={`text-xs font-semibold ${services.MySQL.running ? "text-emerald-400" : "text-zinc-500"}`}>
                {services.MySQL.running ? "Running" : "Offline"}
              </span>
              <span className={`h-3 w-3 rounded-full ${services.MySQL.running ? "bg-emerald-500" : "bg-zinc-700"}`} />
            </span>
          </div>
          <div className="flex justify-between items-center bg-zinc-950/40 border border-zinc-850 p-4 rounded-xl">
            <span className="text-sm font-medium text-zinc-200">Redis Cache Server (Port 6379)</span>
            <span className="flex items-center space-x-2">
              <span className={`text-xs font-semibold ${services.Redis.running ? "text-emerald-400" : "text-zinc-500"}`}>
                {services.Redis.running ? "Running" : "Offline"}
              </span>
              <span className={`h-3 w-3 rounded-full ${services.Redis.running ? "bg-emerald-500" : "bg-zinc-700"}`} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
