import { invoke } from "@tauri-apps/api/core";
import { Loader2, Square, Play, Trash2, RefreshCw } from "lucide-react";

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
  dirsStatus: { [key: string]: boolean };
  baseDir: string;
}

export default function ServicesTab({
  services,
  handleInstallService,
  toggleService,
  handleClearRedis,
  isLinux = false,
  dirsStatus,
  baseDir,
}: ServicesTabProps) {
  const getPath = (pWin: string, pLinux: string) => {
    return isLinux ? `${baseDir}/${pLinux}` : `${baseDir}\\${pWin}`;
  };

  const isApacheDownloaded = dirsStatus[getPath("Apache24", "Apache24")] || false;
  const isMySQLDownloaded = dirsStatus[getPath("mysql", "mysql")] || false;
  const isRedisDownloaded = dirsStatus[getPath("redis", "redis")] || false;

  return (
    <div className="space-y-6 animate-fade-in text-[#18181b]">
      <div>
        <h2 className="text-2xl font-black tracking-tight text-[#09090b]">Service Control Panel</h2>
        <p className="text-sm text-[#52525b] mt-1 font-semibold">Daftarkan atau kelola status sakelar hidup/mati service {isLinux ? "systemd" : "Windows"} server lokal.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Apache Card */}
        <div className="p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-xs font-black text-[#52525b] uppercase tracking-widest">Apache2.4</span>
              <span className={`text-[11px] font-black px-2.5 py-1 border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] flex items-center gap-1.5 ${
                services.Apache.checking 
                  ? "bg-[#eae6df] text-[#52525b]" 
                  : services.Apache.conflict
                    ? "bg-[#fef08a] text-[#713f12]"
                    : services.Apache.running 
                      ? "bg-[#bbf7d0] text-[#14532d]" 
                      : "bg-[#fecaca] text-[#7f1d1d]"
              }`}>
                {services.Apache.checking && <Loader2 className="w-3 h-3 animate-spin" />}
                {services.Apache.checking ? "MEMERIKSA" : services.Apache.conflict ? "KONFLIK" : services.Apache.running ? "RUNNING" : "STOPPED"}
              </span>
            </div>
            <h3 className="text-lg font-black text-[#09090b]">HTTP Web Server</h3>
            <p className="text-xs text-[#52525b] font-medium leading-relaxed">
              Port aktif: 80. Bertanggung jawab melayani berkas HTML/PHP dan memproses routing virtual host domain.
            </p>
            {services.Apache.conflict && (
              <div className="bg-[#fef08a] border-2.5 border-[#09090b] text-[#713f12] text-xs p-3.5 shadow-[2px_2px_0px_0px_#09090b] flex flex-col gap-1">
                <span className="font-black uppercase tracking-wider text-[10px]">Konflik Terdeteksi</span>
                <p className="font-semibold leading-relaxed font-mono text-[11px]">{services.Apache.conflictMessage}</p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            {!isApacheDownloaded ? (
              <div className="w-full py-3 bg-[#eae6df] border-2.5 border-[#09090b] text-[#52525b] text-xs font-bold text-center">
                Silakan pasang Apache di menu Downloader
              </div>
            ) : !services.Apache.installed ? (
              <button
                onClick={() => handleInstallService("Apache24", "Apache")}
                disabled={services.Apache.checking}
                className="w-full py-3 bg-[#fde047] text-[#09090b] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] hover:bg-[#fef08a] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#09090b] text-xs font-black uppercase transition cursor-pointer flex items-center justify-center gap-2"
              >
                {services.Apache.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Register Apache {isLinux ? "systemd" : "Windows"} Service
              </button>
            ) : (
              <div className="flex flex-wrap sm:flex-nowrap gap-2">
                <button
                  disabled={services.Apache.checking}
                  onClick={() => toggleService("Apache")}
                  className={`flex-1 min-w-[120px] flex items-center justify-center space-x-2 py-3 border-3 border-[#09090b] text-xs font-black transition-all duration-150 cursor-pointer uppercase shadow-[3px_3px_0px_0px_#09090b] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] ${
                    services.Apache.checking
                      ? "bg-[#eae6df] text-[#52525b] cursor-wait"
                      : services.Apache.running 
                        ? "bg-[#fecaca] text-[#7f1d1d] hover:bg-[#fca5a5]" 
                        : "bg-[#fde047] text-[#09090b] hover:bg-[#fef08a]"
                  }`}
                >
                  {services.Apache.checking
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : services.Apache.running ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>{services.Apache.checking ? "Memproses..." : services.Apache.running ? "Matikan" : "Nyalakan"}</span>
                </button>
                <button
                  disabled={services.Apache.checking}
                  onClick={() => handleInstallService("Apache24", "Apache")}
                  className="py-3 px-3.5 bg-[#ffffff] text-[#18181b] border-3 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] text-xs font-black transition flex items-center justify-center space-x-1.5 cursor-pointer shrink-0 uppercase"
                  title="Reinstall / Register Ulang Service"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reinstall</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* MySQL Card */}
        <div className="p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-xs font-black text-[#52525b] uppercase tracking-widest">mysql-server</span>
              <span className={`text-[11px] font-black px-2.5 py-1 border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] flex items-center gap-1.5 ${
                services.MySQL.checking 
                  ? "bg-[#eae6df] text-[#52525b]" 
                  : services.MySQL.conflict
                    ? "bg-[#fef08a] text-[#713f12]"
                    : services.MySQL.running 
                      ? "bg-[#bbf7d0] text-[#14532d]" 
                      : "bg-[#fecaca] text-[#7f1d1d]"
              }`}>
                {services.MySQL.checking && <Loader2 className="w-3 h-3 animate-spin" />}
                {services.MySQL.checking ? "MEMERIKSA" : services.MySQL.conflict ? "KONFLIK" : services.MySQL.running ? "RUNNING" : "STOPPED"}
              </span>
            </div>
            <h3 className="text-lg font-black text-[#09090b]">Database Server</h3>
            <p className="text-xs text-[#52525b] font-medium leading-relaxed">
              Port aktif: 3306. Engine database relasional terisolasi untuk menyimpan konfigurasi data proyek Anda.
            </p>
            {services.MySQL.conflict && (
              <div className="bg-[#fef08a] border-2.5 border-[#09090b] text-[#713f12] text-xs p-3.5 shadow-[2px_2px_0px_0px_#09090b] flex flex-col gap-1">
                <span className="font-black uppercase tracking-wider text-[10px]">Konflik Terdeteksi</span>
                <p className="font-semibold leading-relaxed font-mono text-[11px]">{services.MySQL.conflictMessage}</p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            {!isMySQLDownloaded ? (
              <div className="w-full py-3 bg-[#eae6df] border-2.5 border-[#09090b] text-[#52525b] text-xs font-bold text-center">
                Silakan pasang MySQL di menu Downloader
              </div>
            ) : !services.MySQL.installed ? (
              <button
                onClick={() => handleInstallService("mysql-server", "MySQL")}
                disabled={services.MySQL.checking}
                className="w-full py-3 bg-[#fde047] text-[#09090b] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] hover:bg-[#fef08a] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#09090b] text-xs font-black uppercase transition cursor-pointer flex items-center justify-center gap-2"
              >
                {services.MySQL.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Register MySQL {isLinux ? "systemd" : "Windows"} Service
              </button>
            ) : (
              <div className="flex flex-wrap sm:flex-nowrap gap-2">
                <button
                  disabled={services.MySQL.checking}
                  onClick={() => toggleService("MySQL")}
                  className={`flex-1 min-w-[120px] flex items-center justify-center space-x-2 py-3 border-3 border-[#09090b] text-xs font-black transition-all duration-150 cursor-pointer uppercase shadow-[3px_3px_0px_0px_#09090b] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] ${
                    services.MySQL.checking
                      ? "bg-[#eae6df] text-[#52525b] cursor-wait"
                      : services.MySQL.running 
                        ? "bg-[#fecaca] text-[#7f1d1d] hover:bg-[#fca5a5]" 
                        : "bg-[#fde047] text-[#09090b] hover:bg-[#fef08a]"
                  }`}
                >
                  {services.MySQL.checking
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : services.MySQL.running ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>{services.MySQL.checking ? "Memproses..." : services.MySQL.running ? "Matikan" : "Nyalakan"}</span>
                </button>
                <button
                  disabled={services.MySQL.checking}
                  onClick={() => handleInstallService("mysql-server", "MySQL")}
                  className="py-3 px-3.5 bg-[#ffffff] text-[#18181b] border-3 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] text-xs font-black transition flex items-center justify-center space-x-1.5 cursor-pointer shrink-0 uppercase"
                  title="Reinstall / Register Ulang Service"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reinstall</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Redis Card */}
        <div className="p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-xs font-black text-[#52525b] uppercase tracking-widest">redis-server</span>
              <span className={`text-[11px] font-black px-2.5 py-1 border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] flex items-center gap-1.5 ${
                services.Redis.checking 
                  ? "bg-[#eae6df] text-[#52525b]" 
                  : services.Redis.conflict
                    ? "bg-[#fef08a] text-[#713f12]"
                    : services.Redis.running 
                      ? "bg-[#bbf7d0] text-[#14532d]" 
                      : "bg-[#fecaca] text-[#7f1d1d]"
              }`}>
                {services.Redis.checking && <Loader2 className="w-3 h-3 animate-spin" />}
                {services.Redis.checking ? "MEMERIKSA" : services.Redis.conflict ? "KONFLIK" : services.Redis.running ? "RUNNING" : "STOPPED"}
              </span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <h3 className="text-lg font-black text-[#09090b]">Redis Cache Server</h3>
              {services.Redis.installed && services.Redis.running && (
                <button
                  onClick={handleClearRedis}
                  className="flex items-center space-x-1.5 py-1.5 px-3 bg-[#fef08a] hover:bg-[#fde047] text-[#713f12] border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] text-[10px] font-black uppercase tracking-wider transition cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Flush</span>
                </button>
              )}
            </div>
            <p className="text-xs text-[#52525b] font-medium leading-relaxed">
              Port aktif: 6379. Struktur data memori (in-memory) berkecepatan tinggi untuk caching performa aplikasi Anda.
            </p>
            {services.Redis.conflict && (
              <div className="bg-[#fef08a] border-2.5 border-[#09090b] text-[#713f12] text-xs p-3.5 shadow-[2px_2px_0px_0px_#09090b] flex flex-col gap-1">
                <span className="font-black uppercase tracking-wider text-[10px]">Konflik Terdeteksi</span>
                <p className="font-semibold leading-relaxed font-mono text-[11px]">{services.Redis.conflictMessage}</p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            {!isRedisDownloaded ? (
              <div className="w-full py-3 bg-[#eae6df] border-2.5 border-[#09090b] text-[#52525b] text-xs font-bold text-center">
                Silakan pasang Redis di menu Downloader
              </div>
            ) : !services.Redis.installed ? (
              <button
                onClick={() => handleInstallService("redis-server", "Redis")}
                disabled={services.Redis.checking}
                className="w-full py-3 bg-[#fde047] text-[#09090b] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] hover:bg-[#fef08a] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#09090b] text-xs font-black uppercase transition cursor-pointer flex items-center justify-center gap-2"
              >
                {services.Redis.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Register Redis {isLinux ? "systemd" : "Windows"} Service
              </button>
            ) : (
              <div className="flex flex-wrap sm:flex-nowrap gap-2">
                <button
                  disabled={services.Redis.checking}
                  onClick={() => toggleService("Redis")}
                  className={`flex-1 min-w-[120px] flex items-center justify-center space-x-2 py-3 border-3 border-[#09090b] text-xs font-black transition-all duration-150 cursor-pointer uppercase shadow-[3px_3px_0px_0px_#09090b] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] ${
                    services.Redis.checking
                      ? "bg-[#eae6df] text-[#52525b] cursor-wait"
                      : services.Redis.running 
                        ? "bg-[#fecaca] text-[#7f1d1d] hover:bg-[#fca5a5]" 
                        : "bg-[#fde047] text-[#09090b] hover:bg-[#fef08a]"
                  }`}
                >
                  {services.Redis.checking
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : services.Redis.running ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>{services.Redis.checking ? "Memproses..." : services.Redis.running ? "Matikan" : "Nyalakan"}</span>
                </button>
                <button
                  disabled={services.Redis.checking}
                  onClick={() => handleInstallService("redis-server", "Redis")}
                  className="py-3 px-3.5 bg-[#ffffff] text-[#18181b] border-3 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] text-xs font-black transition flex items-center justify-center space-x-1.5 cursor-pointer shrink-0 uppercase"
                  title="Reinstall / Register Ulang Service"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reinstall</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mail Sandbox Card */}
        <div className="p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-xs font-black text-[#52525b] uppercase tracking-widest">Mail Sandbox (Mailpit)</span>
              <span className={`text-[11px] font-black px-2.5 py-1 border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] flex items-center gap-1.5 ${
                services.Mailpit.checking 
                  ? "bg-[#eae6df] text-[#52525b]" 
                  : services.Mailpit.conflict
                    ? "bg-[#fef08a] text-[#713f12]"
                    : services.Mailpit.running 
                      ? "bg-[#bbf7d0] text-[#14532d]" 
                      : "bg-[#fecaca] text-[#7f1d1d]"
              }`}>
                {services.Mailpit.checking && <Loader2 className="w-3 h-3 animate-spin" />}
                {services.Mailpit.checking ? "MEMERIKSA" : services.Mailpit.conflict ? "KONFLIK" : services.Mailpit.running ? "RUNNING" : "STOPPED"}
              </span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <h3 className="text-lg font-black text-[#09090b]">Mail Sandbox</h3>
              {services.Mailpit.installed && services.Mailpit.running && (
                <button
                  onClick={() => invoke("open_in_browser", { url: "http://localhost:8025" })}
                  className="flex items-center space-x-1.5 py-1.5 px-3 bg-[#7dd3fc] hover:bg-[#38bdf8] text-[#09090b] border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] text-[10px] font-black uppercase tracking-wider transition cursor-pointer shrink-0"
                >
                  <span>Buka Webmail</span>
                </button>
              )}
            </div>
            <p className="text-xs text-[#52525b] font-medium leading-relaxed">
              SMTP Port: 1025, Webmail: 8025. Menangkap semua email keluar dari aplikasi lokal Anda dan menampilkannya di dashboard webmail.
            </p>
            {services.Mailpit.conflict && (
              <div className="bg-[#fef08a] border-2.5 border-[#09090b] text-[#713f12] text-xs p-3.5 shadow-[2px_2px_0px_0px_#09090b] flex flex-col gap-1">
                <span className="font-black uppercase tracking-wider text-[10px]">Konflik Terdeteksi</span>
                <p className="font-semibold leading-relaxed font-mono text-[11px]">{services.Mailpit.conflictMessage}</p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            {!services.Mailpit.installed ? (
              <div className="w-full py-3 bg-[#eae6df] border-2.5 border-[#09090b] text-[#52525b] text-xs font-bold text-center">
                Silakan pasang Mail Sandbox di menu Downloader
              </div>
            ) : (
              <button
                disabled={services.Mailpit.checking}
                onClick={() => toggleService("Mailpit")}
                className={`w-full flex items-center justify-center space-x-2 py-3 border-3 border-[#09090b] text-xs font-black transition-all duration-150 cursor-pointer uppercase shadow-[3px_3px_0px_0px_#09090b] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] ${
                  services.Mailpit.checking
                    ? "bg-[#eae6df] text-[#52525b] cursor-wait"
                    : services.Mailpit.running 
                      ? "bg-[#fecaca] text-[#7f1d1d] hover:bg-[#fca5a5]" 
                      : "bg-[#fde047] text-[#09090b] hover:bg-[#fef08a]"
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
