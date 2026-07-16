import { CheckCircle2, AlertTriangle, Loader2, Download } from "lucide-react";

interface ComponentStatus {
  id: string;
  name: string;
  description: string;
  installedPath: string;
}

interface DownloaderTabProps {
  dirsStatus: { [key: string]: boolean };
  baseDir: string;
  activeDownloads: string[];
  downloadProgress: {
    [key: string]: { percentage: number; bytes_downloaded: number; bytes_total: number }
  };
  startDownload: (componentId: string) => void;
}

export default function DownloaderTab({
  dirsStatus,
  baseDir,
  activeDownloads,
  downloadProgress,
  startDownload,
}: DownloaderTabProps) {
  const isLinux = baseDir.startsWith("/") || !baseDir.includes("\\");
  const getPath = (pWin: string, pLinux: string) => {
    return isLinux ? `${baseDir}/${pLinux}` : `${baseDir}\\${pWin}`;
  };

  const componentsList: ComponentStatus[] = [
    { 
      id: "apache", 
      name: "Apache Web Server", 
      description: isLinux ? "Biner utama HTTP server v2.4 Linux." : "Biner utama HTTP server v2.4 Windows VS17.", 
      installedPath: getPath("Apache24", "Apache24") 
    },
    { 
      id: "php83", 
      name: "PHP 8.3 Engine", 
      description: isLinux ? "PHP 8.3 x64 Engine untuk modul Apache." : "PHP 8.3 x64 Thread Safe (TS) untuk modul Apache.", 
      installedPath: getPath("php83", "php83") 
    },
    { 
      id: "php82", 
      name: "PHP 8.2 Engine", 
      description: isLinux ? "PHP 8.2 x64 Engine versi stabil." : "PHP 8.2 x64 Thread Safe (TS) versi stabil warisan.", 
      installedPath: getPath("php82", "php82") 
    },
    { 
      id: "mysql", 
      name: "MySQL Database Server", 
      description: "Engine database relasional kustom v8.0.", 
      installedPath: getPath("mysql", "mysql") 
    },
    { 
      id: "phpmyadmin", 
      name: "phpMyAdmin Interface", 
      description: "Pengelola MySQL berbasis web di localhost.", 
      installedPath: getPath("www\\phpmyadmin", "www/phpmyadmin") 
    },
    { 
      id: "composer", 
      name: "PHP Composer", 
      description: "Manajer ketergantungan PHP portabel (composer.phar).", 
      installedPath: getPath("composer\\composer.phar", "composer/composer.phar") 
    },
    { 
      id: "redis", 
      name: "Redis Cache Server", 
      description: isLinux ? "Database memori berkinerja tinggi (redis-server) v5.0." : "Database memori berkinerja tinggi (redis-server.exe) v5.0.", 
      installedPath: getPath("redis", "redis") 
    },
    { 
      id: "mailpit", 
      name: "Mail Sandbox (Mailpit)", 
      description: "Server SMTP lokal portabel dan antarmuka web pencatat email.", 
      installedPath: getPath("mailpit\\mailpit.exe", "mailpit/mailpit") 
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Katalog Komponen Server</h2>
        <p className="text-sm text-zinc-400 mt-1">Unduh dan pasang biner server resmi secara portabel ke dalam {baseDir}.</p>
      </div>

      <div className="space-y-4">
        {componentsList.map(comp => {
          const isDownloading = activeDownloads.includes(comp.id);
          const progress = downloadProgress[comp.id];
          const alreadyInstalled = dirsStatus[comp.installedPath] || false;

          return (
            <div 
              key={comp.id}
              className="p-5 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex flex-col space-y-4 shadow-xl hover:border-zinc-700 transition-all duration-150"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1 mr-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-base font-bold text-zinc-100">{comp.name}</h3>
                    {alreadyInstalled ? (
                      <span className="text-xs font-bold px-3 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center gap-1.5 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        TERPASANG
                      </span>
                    ) : (
                      <span className="text-xs font-bold px-3 py-0.5 rounded-full bg-red-500/15 text-red-400 flex items-center gap-1.5 shrink-0">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        BELUM TERPASANG
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400">{comp.description}</p>
                  <p className="text-[11px] text-zinc-500 font-mono">Folder: {comp.installedPath}</p>
                </div>
                <button
                  disabled={isDownloading}
                  onClick={() => startDownload(comp.id)}
                  className={`flex items-center space-x-2 py-2 px-4.5 rounded-xl text-sm font-bold transition duration-150 cursor-pointer ${
                    isDownloading 
                      ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-750"
                      : alreadyInstalled 
                        ? "bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-400 border border-indigo-500/30"
                        : "bg-indigo-600 hover:bg-indigo-550 text-white shadow-md shadow-indigo-950/30"
                  }`}
                >
                  {isDownloading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Mengunduh...</span></>
                    : <><Download className="w-4 h-4" /><span>{alreadyInstalled ? "Unduh Ulang" : "Unduh"}</span></>}
                </button>
              </div>

              {/* Download Progress representation */}
              {isDownloading && progress && (
                <div className="space-y-2 bg-zinc-950/30 p-3 rounded-xl border border-zinc-900">
                  <div className="flex justify-between text-xs text-zinc-400 font-mono">
                    <span>{progress.percentage}% Selesai</span>
                    <span>
                      {(progress.bytes_downloaded / (1024 * 1024)).toFixed(1)} MB / {(progress.bytes_total / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                  <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-850">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
