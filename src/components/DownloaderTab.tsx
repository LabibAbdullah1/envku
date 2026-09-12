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
    <div className="space-y-8 animate-fade-in text-[#18181b]">
      <div>
        <h2 className="text-2xl font-black text-[#09090b] tracking-tight">Katalog Komponen Server</h2>
        <p className="text-sm text-[#52525b] mt-1 font-semibold">
          Kelola, pasang ulang, atau hapus biner server portabel dengan mudah di folder <code className="font-mono text-[#09090b] bg-[#fffefb] px-1.5 py-0.5 border border-[#09090b] font-bold">{baseDir}</code>.
        </p>
      </div>

      <div className="space-y-8">
        {categories.map((cat) => {
          const categoryComponents = componentsList.filter((c) => c.category === cat.key);
          const CatIcon = cat.icon;

          return (
            <div key={cat.key} className="space-y-4">
              <div className="flex items-center space-x-2 border-b-2.5 border-[#09090b] pb-2">
                <CatIcon className="w-4 h-4 text-[#09090b]" />
                <h3 className="text-xs font-black text-[#09090b] uppercase tracking-wider">{cat.title}</h3>
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
                      className="p-5 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] flex flex-col space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-base font-black text-[#09090b]">{comp.name}</h4>
                            {comp.tag && (
                              <span className="text-[10px] font-black font-mono px-2 py-0.5 bg-[#fffefb] text-[#18181b] border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b]">
                                {comp.tag}
                              </span>
                            )}
                            {alreadyInstalled ? (
                              <span className="text-[11px] font-black px-2.5 py-0.5 bg-[#bbf7d0] text-[#14532d] border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] flex items-center gap-1 shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                TERPASANG
                              </span>
                            ) : (
                              <span className="text-[11px] font-black px-2.5 py-0.5 bg-[#fecaca] text-[#7f1d1d] border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] flex items-center gap-1 shrink-0">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                BELUM TERPASANG
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#52525b] leading-relaxed font-medium">{comp.description}</p>
                          <p className="text-[11px] text-[#52525b] font-mono truncate font-semibold" title={comp.installedPath}>
                            Folder: {comp.installedPath}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {!alreadyInstalled ? (
                            <button
                              disabled={isDownloading || isDeleting}
                              onClick={() => startDownload(comp.id)}
                              className="py-2.5 px-4 bg-[#fde047] text-[#09090b] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#fef08a] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] text-xs font-black transition cursor-pointer flex items-center space-x-2 uppercase"
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
                                className="py-2.5 px-3.5 bg-[#7dd3fc] text-[#09090b] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#38bdf8] text-xs font-black transition cursor-pointer flex items-center space-x-1.5 uppercase"
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
                                className="py-2.5 px-3.5 bg-[#fecaca] text-[#7f1d1d] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#fca5a5] text-xs font-black transition cursor-pointer flex items-center space-x-1.5 uppercase"
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
                        <div className="space-y-2 bg-[#fffefb] p-3.5 border-2.5 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b]">
                          <div className="flex justify-between text-xs text-[#09090b] font-mono font-bold">
                            <span>{progress.percentage}% Selesai</span>
                            <span>
                              {progress.bytes_total > 100
                                ? `${(progress.bytes_downloaded / (1024 * 1024)).toFixed(1)} MB / ${(progress.bytes_total / (1024 * 1024)).toFixed(1)} MB`
                                : "Menginstal paket sistem..."}
                            </span>
                          </div>
                          <div className="w-full bg-[#eae6df] h-3.5 border-2 border-[#09090b] overflow-hidden">
                            <div
                              className="bg-[#fde047] h-full border-r-2 border-[#09090b] transition-all duration-300"
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
