import { Loader2, Square, Play } from "lucide-react";

interface ServiceState {
  installed: boolean;
  running: boolean;
  checking: boolean;
}

interface ServicesTabProps {
  services: {
    Apache: ServiceState;
    MySQL: ServiceState;
  };
  handleInstallService: (winServiceName: string, key: "Apache" | "MySQL") => void;
  toggleService: (key: "Apache" | "MySQL") => void;
}

export default function ServicesTab({
  services,
  handleInstallService,
  toggleService,
}: ServicesTabProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Service Control Panel</h2>
        <p className="text-sm text-zinc-400 mt-1">Daftarkan atau kelola status sakelar hidup/mati service Windows server lokal.</p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Apache Card */}
        <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex flex-col justify-between space-y-6 shadow-xl">
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest">Apache2.4</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                services.Apache.checking 
                  ? "bg-zinc-800 text-zinc-400" 
                  : services.Apache.running 
                    ? "bg-emerald-500/15 text-emerald-400" 
                    : "bg-red-500/15 text-red-400"
              }`}>
                {services.Apache.checking && <Loader2 className="w-3 h-3 animate-spin" />}
                {services.Apache.checking ? "MEMERIKSA" : services.Apache.running ? "RUNNING" : "STOPPED"}
              </span>
            </div>
            <h3 className="text-lg font-bold text-zinc-100">HTTP Web Server</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Port aktif: 80. Bertanggung jawab melayani berkas HTML/PHP dan memproses routing virtual host domain.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            {!services.Apache.installed ? (
              <button
                onClick={() => handleInstallService("Apache2.4", "Apache")}
                disabled={services.Apache.checking}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition duration-150 cursor-pointer shadow-md shadow-indigo-950/20 flex items-center justify-center gap-2"
              >
                {services.Apache.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Register Apache Windows Service
              </button>
            ) : (
              <button
                disabled={services.Apache.checking}
                onClick={() => toggleService("Apache")}
                className={`w-full flex items-center justify-center space-x-2 py-3 border rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer ${
                  services.Apache.checking
                    ? "bg-zinc-900/50 border-zinc-700 text-zinc-500 cursor-wait"
                    : services.Apache.running 
                      ? "bg-red-950/25 border-red-500/30 hover:bg-red-900/40 text-red-400 hover:border-red-400" 
                      : "bg-emerald-950/25 border-emerald-500/30 hover:bg-emerald-900/40 text-emerald-400 hover:border-emerald-400"
                }`}
              >
                {services.Apache.checking
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : services.Apache.running ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                <span>{services.Apache.checking ? "Memproses..." : services.Apache.running ? "Matikan Service" : "Nyalakan Service"}</span>
              </button>
            )}
          </div>
        </div>

        {/* MySQL Card */}
        <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex flex-col justify-between space-y-6 shadow-xl">
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest">MySQL-Kustom</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                services.MySQL.checking 
                  ? "bg-zinc-800 text-zinc-400" 
                  : services.MySQL.running 
                    ? "bg-emerald-500/15 text-emerald-400" 
                    : "bg-red-500/15 text-red-400"
              }`}>
                {services.MySQL.checking && <Loader2 className="w-3 h-3 animate-spin" />}
                {services.MySQL.checking ? "MEMERIKSA" : services.MySQL.running ? "RUNNING" : "STOPPED"}
              </span>
            </div>
            <h3 className="text-lg font-bold text-zinc-100">Database Server</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Port aktif: 3306. Engine database relasional terisolasi untuk menyimpan konfigurasi data proyek Anda.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            {!services.MySQL.installed ? (
              <button
                onClick={() => handleInstallService("MySQL-Kustom", "MySQL")}
                disabled={services.MySQL.checking}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition duration-150 cursor-pointer shadow-md shadow-indigo-950/20 flex items-center justify-center gap-2"
              >
                {services.MySQL.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Register MySQL Windows Service
              </button>
            ) : (
              <button
                disabled={services.MySQL.checking}
                onClick={() => toggleService("MySQL")}
                className={`w-full flex items-center justify-center space-x-2 py-3 border rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer ${
                  services.MySQL.checking
                    ? "bg-zinc-900/50 border-zinc-700 text-zinc-500 cursor-wait"
                    : services.MySQL.running 
                      ? "bg-red-950/25 border-red-500/30 hover:bg-red-900/40 text-red-400 hover:border-red-400" 
                      : "bg-emerald-950/25 border-emerald-500/30 hover:bg-emerald-900/40 text-emerald-400 hover:border-emerald-400"
                }`}
              >
                {services.MySQL.checking
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : services.MySQL.running ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                <span>{services.MySQL.checking ? "Memproses..." : services.MySQL.running ? "Matikan Service" : "Nyalakan Service"}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
