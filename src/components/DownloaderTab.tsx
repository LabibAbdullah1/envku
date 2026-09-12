import { useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2, Download, Trash2, RefreshCw, Server, Database, Wrench } from "lucide-react";

interface ComponentStatus {
  id: string;
  name: string;
  category: "server" | "database" | "tools";
  description: string;
  installedPath: string;
  tag?: string;
}

interface DownloaderTabProps {
  dirsStatus: { [key: string]: boolean };
  baseDir: string;
  activeDownloads: string[];
  downloadProgress: {
    [key: string]: { percentage: number; bytes_downloaded: number; bytes_total: number };
  };
  startDownload: (componentId: string) => void;
  deleteComponent: (componentId: string) => void;
}

export default function DownloaderTab({
  dirsStatus,
  baseDir,
  activeDownloads,
  downloadProgress,
  startDownload,
  deleteComponent,
}: DownloaderTabProps) {
  const isLinux = baseDir.startsWith("/") || !baseDir.includes("\\");
  const getPath = (pWin: string, pLinux: string) => {
    return isLinux ? `${baseDir}/${pLinux}` : `${baseDir}\\${pWin}`;
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const componentsList: ComponentStatus[] = [
    {
      id: "apache",
      name: "Apache Web Server",
      category: "server",
      description: isLinux ? "Biner utama HTTP server v2.4 Linux." : "Biner utama HTTP server v2.4 Windows VS18.",
      installedPath: getPath("Apache24", "Apache24"),
      tag: "HTTP v2.4",
    },
    {
      id: "php85",
      name: "PHP 8.5 Engine",
      category: "server",
      description: isLinux ? "PHP 8.5 x64 Engine rilis terbaru untuk modul Apache." : "PHP 8.5 x64 Thread Safe (TS) rilis terbaru.",
      installedPath: getPath("php85", "php85"),
      tag: "Latest Rilis",
    },
    {
      id: "php84",
      name: "PHP 8.4 Engine",
      category: "server",
      description: isLinux ? "PHP 8.4 x64 Engine standar modern." : "PHP 8.4 x64 Thread Safe (TS) standar modern.",
      installedPath: getPath("php84", "php84"),
      tag: "Modern",
    },
    {
      id: "php83",
      name: "PHP 8.3 Engine",
      category: "server",
      description: isLinux ? "PHP 8.3 x64 Engine untuk modul Apache." : "PHP 8.3 x64 Thread Safe (TS) untuk modul Apache.",
      installedPath: getPath("php83", "php83"),
      tag: "Stable",
    },
    {
      id: "php82",
      name: "PHP 8.2 Engine",
      category: "server",
      description: isLinux ? "PHP 8.2 x64 Engine versi stabil." : "PHP 8.2 x64 Thread Safe (TS) versi stabil warisan.",
      installedPath: getPath("php82", "php82"),
      tag: "Legacy",
    },
    {
      id: "mysql",
      name: "MySQL Database Server",
      category: "database",
      description: "Engine database relasional v8.0.",
      installedPath: getPath("mysql", "mysql"),
      tag: "MySQL 8.0",
    },
    {
      id: "redis",
      name: "Redis Cache Server",
      category: "database",
      description: isLinux ? "Database memori berkinerja tinggi (redis-server) v5.0." : "Database memori berkinerja tinggi (redis-server.exe) v5.0.",
      installedPath: getPath("redis", "redis"),
      tag: "In-Memory",
    },
    {
      id: "phpmyadmin",
      name: "phpMyAdmin Interface",
      category: "tools",
      description: "Pengelola MySQL berbasis web di localhost (phpmyadmin.test).",
      installedPath: getPath("www\\phpmyadmin", "www/phpmyadmin"),
      tag: "Web GUI",
    },
    {
      id: "composer",
      name: "PHP Composer",
      category: "tools",
      description: "Manajer ketergantungan PHP portabel (composer.phar).",
      installedPath: getPath("composer\\composer.phar", "composer/composer.phar"),
      tag: "CLI Tool",
    },
    {
      id: "mailpit",
      name: "Mail Sandbox (Mailpit)",
      category: "tools",
      description: "Server SMTP lokal portabel dan antarmuka web pencatat email.",
      installedPath: getPath("mailpit\\mailpit.exe", "mailpit/mailpit"),
      tag: "SMTP / Mail",
    },
  ];

  const categories = [
    { key: "server", title: "Web Server & Engine PHP", icon: Server },
    { key: "database", title: "Database & Cache Memori", icon: Database },
    { key: "tools", title: "Peralatan Web & Mail Sandbox", icon: Wrench },
  ];

  const handleDelete = async (comp: ComponentStatus) => {
    if (confirm(`Apakah Anda yakin ingin menghapus komponen ${comp.name}?\nFolder di ${comp.installedPath} akan dihapus.`)) {
      setDeletingId(comp.id);
      try {
        await deleteComponent(comp.id);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handleReinstall = async (comp: ComponentStatus) => {
    if (confirm(`Apakah Anda yakin ingin memasang ulang ${comp.name}? Komponen lama akan dibersihkan dan diunduh ulang.`)) {
      setDeletingId(comp.id);
      try {
        await deleteComponent(comp.id);
        await startDownload(comp.id);
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Katalog Komponen Server</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Kelola, pasang ulang, atau hapus biner server portabel dengan mudah di folder <code className="font-mono text-zinc-300 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">{baseDir}</code>.
        </p>
      </div>

      <div className="space-y-8">
        {categories.map((cat) => {
          const categoryComponents = componentsList.filter((c) => c.category === cat.key);
          const CatIcon = cat.icon;

          return (
            <div key={cat.key} className="space-y-4">
              <div className="flex items-center space-x-2 border-b border-zinc-800/80 pb-2">
                <CatIcon className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">{cat.title}</h3>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {categoryComponents.map((comp) => {
                  const isDownloading = activeDownloads.includes(comp.id);
                  const isDeleting = deletingId === comp.id;
                  const progress = downloadProgress[comp.id];
                  const alreadyInstalled = dirsStatus[comp.installedPath] || false;

                  return (
                    <div
                      key={comp.id}
                      className={`p-5 rounded-2xl border transition-all duration-150 shadow-xl flex flex-col space-y-4 ${
                        alreadyInstalled
                          ? "bg-zinc-900/60 border-zinc-800/90 hover:border-zinc-700"
                          : "bg-zinc-950/40 border-zinc-850 hover:border-zinc-800"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-base font-black">{comp.name}</h4>
                            {comp.tag && (
                              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                                {comp.tag}
                              </span>
                            )}
                            {alreadyInstalled ? (
                              <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center gap-1 shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                TERPASANG
                              </span>
                            ) : (
                              <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center gap-1 shrink-0">
                                <AlertTriangle className="w-3.5 h-3.5 text-zinc-400" />
                                BELUM TERPASANG
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400 leading-relaxed font-medium">{comp.description}</p>
                          <p className="text-[11px] text-zinc-400 font-mono truncate" title={comp.installedPath}>
                            Folder: {comp.installedPath}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {!alreadyInstalled ? (
                            <button
                              disabled={isDownloading || isDeleting}
                              onClick={() => startDownload(comp.id)}
                              className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-550 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl text-xs font-black transition duration-150 cursor-pointer shadow-md flex items-center space-x-2"
                            >
                              {isDownloading ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                                  <span>Mengunduh...</span>
                                </>
                              ) : (
                                <>
                                  <Download className="w-4 h-4 shrink-0" />
                                  <span>Unduh & Pasang</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <>
                              {/* Reinstall Button */}
                              <button
                                disabled={isDownloading || isDeleting}
                                onClick={() => handleReinstall(comp)}
                                className="py-2.5 px-3.5 bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/40 text-indigo-300 rounded-xl text-xs font-black transition duration-150 cursor-pointer flex items-center space-x-1.5 shadow-sm"
                                title="Pasang Ulang Komponen"
                              >
                                {isDownloading ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                ) : (
                                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span>Pasang Ulang</span>
                              </button>

                              {/* Delete Button */}
                              <button
                                disabled={isDownloading || isDeleting}
                                onClick={() => handleDelete(comp)}
                                className="py-2.5 px-3.5 bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 hover:border-red-400 text-red-400 rounded-xl text-xs font-black transition duration-150 cursor-pointer flex items-center space-x-1.5 shadow-sm"
                                title="Hapus Komponen"
                              >
                                {isDeleting ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span>Hapus</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Download Progress Bar */}
                      {isDownloading && progress && (
                        <div className="space-y-2 bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800/80">
                          <div className="flex justify-between text-xs text-zinc-300 font-mono">
                            <span>{progress.percentage}% Selesai</span>
                            <span>
                              {progress.bytes_total > 100
                                ? `${(progress.bytes_downloaded / (1024 * 1024)).toFixed(1)} MB / ${(progress.bytes_total / (1024 * 1024)).toFixed(1)} MB`
                                : "Menginstal paket sistem..."}
                            </span>
                          </div>
                          <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800">
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
        })}
      </div>
    </div>
  );
}
