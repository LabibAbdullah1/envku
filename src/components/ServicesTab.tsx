import { invoke } from "@tauri-apps/api/core";
import { Loader2, Square, Play, Trash2 } from "lucide-react";

interface ServiceState {
  installed: boolean;
  running: boolean;
  checking: boolean;
  conflict?: boolean;
  conflictMessage?: string;
}

interface ServicesTabProps {
  services: {
    Apache: ServiceState;
    MySQL: ServiceState;
    Redis: ServiceState;
    Mailpit: ServiceState;
  };
  handleInstallService: (winServiceName: string, key: "Apache" | "MySQL" | "Redis") => void;
  toggleService: (key: "Apache" | "MySQL" | "Redis" | "Mailpit") => void;
  handleClearRedis: () => void;
  isLinux?: boolean;
}

export default function ServicesTab({
  services,
  handleInstallService,
  toggleService,
  handleClearRedis,
  isLinux = false,
}: ServicesTabProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Service Control Panel</h2>
        <p className="text-sm text-zinc-400 mt-1">Daftarkan atau kelola status sakelar hidup/mati service {isLinux ? "systemd" : "Windows"} server lokal.</p>
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
                  : services.Apache.conflict
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                    : services.Apache.running 
                      ? "bg-emerald-500/15 text-emerald-400" 
                      : "bg-red-500/15 text-red-400"
              }`}>
                {services.Apache.checking && <Loader2 className="w-3 h-3 animate-spin" />}
                {services.Apache.checking ? "MEMERIKSA" : services.Apache.conflict ? "KONFLIK" : services.Apache.running ? "RUNNING" : "STOPPED"}
              </span>
            </div>
            <h3 className="text-lg font-bold text-zinc-100">HTTP Web Server</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Port aktif: 80. Bertanggung jawab melayani berkas HTML/PHP dan memproses routing virtual host domain.
            </p>
            {services.Apache.conflict && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs p-3.5 rounded-xl flex flex-col gap-1">
                <span className="font-extrabold uppercase tracking-wider text-[10px]">Konflik Terdeteksi</span>
                <p className="text-zinc-300 font-medium leading-relaxed font-mono text-[11px]">{services.Apache.conflictMessage}</p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            {!services.Apache.installed ? (
              <button
                onClick={() => handleInstallService("Apache2.4", "Apache")}
                disabled={services.Apache.checking}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition duration-150 cursor-pointer shadow-md shadow-indigo-950/20 flex items-center justify-center gap-2"
              >
                {services.Apache.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Register Apache {isLinux ? "systemd" : "Windows"} Service
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
              <span className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest">mysql-server</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                services.MySQL.checking 
                  ? "bg-zinc-800 text-zinc-400" 
                  : services.MySQL.conflict
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                    : services.MySQL.running 
                      ? "bg-emerald-500/15 text-emerald-400" 
                      : "bg-red-500/15 text-red-400"
              }`}>
                {services.MySQL.checking && <Loader2 className="w-3 h-3 animate-spin" />}
                {services.MySQL.checking ? "MEMERIKSA" : services.MySQL.conflict ? "KONFLIK" : services.MySQL.running ? "RUNNING" : "STOPPED"}
              </span>
            </div>
            <h3 className="text-lg font-bold text-zinc-100">Database Server</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Port aktif: 3306. Engine database relasional terisolasi untuk menyimpan konfigurasi data proyek Anda.
            </p>
            {services.MySQL.conflict && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs p-3.5 rounded-xl flex flex-col gap-1">
                <span className="font-extrabold uppercase tracking-wider text-[10px]">Konflik Terdeteksi</span>
                <p className="text-zinc-300 font-medium leading-relaxed font-mono text-[11px]">{services.MySQL.conflictMessage}</p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            {!services.MySQL.installed ? (
              <button
                onClick={() => handleInstallService("mysql-server", "MySQL")}
                disabled={services.MySQL.checking}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition duration-150 cursor-pointer shadow-md shadow-indigo-950/20 flex items-center justify-center gap-2"
              >
                {services.MySQL.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Register MySQL {isLinux ? "systemd" : "Windows"} Service
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

        {/* Redis Card */}
        <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex flex-col justify-between space-y-6 shadow-xl">
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest">redis-server</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                services.Redis.checking 
                  ? "bg-zinc-800 text-zinc-400" 
                  : services.Redis.conflict
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                    : services.Redis.running 
                      ? "bg-emerald-500/15 text-emerald-400" 
                      : "bg-red-500/15 text-red-400"
              }`}>
                {services.Redis.checking && <Loader2 className="w-3 h-3 animate-spin" />}
                {services.Redis.checking ? "MEMERIKSA" : services.Redis.conflict ? "KONFLIK" : services.Redis.running ? "RUNNING" : "STOPPED"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-zinc-100">Redis Cache Server</h3>
              {services.Redis.installed && services.Redis.running && (
                <button
                  onClick={handleClearRedis}
                  className="flex items-center space-x-1.5 py-1.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:border-amber-400 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition duration-150 cursor-pointer shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Flush</span>
                </button>
              )}
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Port aktif: 6379. Struktur data memori (in-memory) berkecepatan tinggi untuk caching performa aplikasi Anda.
            </p>
            {services.Redis.conflict && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs p-3.5 rounded-xl flex flex-col gap-1">
                <span className="font-extrabold uppercase tracking-wider text-[10px]">Konflik Terdeteksi</span>
                <p className="text-zinc-300 font-medium leading-relaxed font-mono text-[11px]">{services.Redis.conflictMessage}</p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            {!services.Redis.installed ? (
              <button
                onClick={() => handleInstallService("redis-server", "Redis")}
                disabled={services.Redis.checking}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition duration-150 cursor-pointer shadow-md shadow-indigo-950/20 flex items-center justify-center gap-2"
              >
                {services.Redis.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Register Redis {isLinux ? "systemd" : "Windows"} Service
              </button>
            ) : (
              <button
                disabled={services.Redis.checking}
                onClick={() => toggleService("Redis")}
                className={`w-full flex items-center justify-center space-x-2 py-3 border rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer ${
                  services.Redis.checking
                    ? "bg-zinc-900/50 border-zinc-700 text-zinc-500 cursor-wait"
                    : services.Redis.running 
                      ? "bg-red-950/25 border-red-500/30 hover:bg-red-900/40 text-red-400 hover:border-red-400" 
                      : "bg-emerald-950/25 border-emerald-500/30 hover:bg-emerald-900/40 text-emerald-400 hover:border-emerald-400"
                }`}
              >
                {services.Redis.checking
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : services.Redis.running ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                <span>{services.Redis.checking ? "Memproses..." : services.Redis.running ? "Matikan Service" : "Nyalakan Service"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Mail Sandbox Card */}
        <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex flex-col justify-between space-y-6 shadow-xl">
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest">Mail Sandbox (Mailpit)</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                services.Mailpit.checking 
                  ? "bg-zinc-800 text-zinc-400" 
                  : services.Mailpit.conflict
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                    : services.Mailpit.running 
                      ? "bg-emerald-500/15 text-emerald-400" 
                      : "bg-red-500/15 text-red-400"
              }`}>
                {services.Mailpit.checking && <Loader2 className="w-3 h-3 animate-spin" />}
                {services.Mailpit.checking ? "MEMERIKSA" : services.Mailpit.conflict ? "KONFLIK" : services.Mailpit.running ? "RUNNING" : "STOPPED"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-zinc-100">Mail Sandbox</h3>
              {services.Mailpit.installed && services.Mailpit.running && (
                <button
                  onClick={() => invoke("open_in_browser", { url: "http://localhost:8025" })}
                  className="flex items-center space-x-1.5 py-1.5 px-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:border-indigo-400 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition duration-150 cursor-pointer shadow-sm"
                >
                  <span>Buka Webmail</span>
                </button>
              )}
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">
              SMTP Port: 1025, Webmail: 8025. Menangkap semua email keluar dari aplikasi lokal Anda dan menampilkannya di dashboard webmail.
            </p>
            {services.Mailpit.conflict && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs p-3.5 rounded-xl flex flex-col gap-1">
                <span className="font-extrabold uppercase tracking-wider text-[10px]">Konflik Terdeteksi</span>
                <p className="text-zinc-300 font-medium leading-relaxed font-mono text-[11px]">{services.Mailpit.conflictMessage}</p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            {!services.Mailpit.installed ? (
              <div className="w-full py-3 bg-zinc-950/40 border border-zinc-850 text-zinc-500 rounded-xl text-xs font-bold text-center">
                Silakan pasang Mail Sandbox di menu Downloader
              </div>
            ) : (
              <button
                disabled={services.Mailpit.checking}
                onClick={() => toggleService("Mailpit")}
                className={`w-full flex items-center justify-center space-x-2 py-3 border rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer ${
                  services.Mailpit.checking
                    ? "bg-zinc-900/50 border-zinc-700 text-zinc-500 cursor-wait"
                    : services.Mailpit.running 
                      ? "bg-red-950/25 border-red-500/30 hover:bg-red-900/40 text-red-400 hover:border-red-400" 
                      : "bg-emerald-950/25 border-emerald-500/30 hover:bg-emerald-900/40 text-emerald-400 hover:border-emerald-400"
                }`}
              >
                {services.Mailpit.checking
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : services.Mailpit.running ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                <span>{services.Mailpit.checking ? "Memproses..." : services.Mailpit.running ? "Matikan Sandbox" : "Nyalakan Sandbox"}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
