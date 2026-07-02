import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";

interface PhpSwitcherTabProps {
  dirsStatus: { [key: string]: boolean };
  activePhpVersion: string;
  switchingPhp: string | null;
  handleSwitchPhp: (versionId: string) => void;
  baseDir: string;
}

export default function PhpSwitcherTab({
  dirsStatus,
  activePhpVersion,
  switchingPhp,
  handleSwitchPhp,
  baseDir,
}: PhpSwitcherTabProps) {
  const php83Path = `${baseDir}\\php83`;
  const php82Path = `${baseDir}\\php82`;

  const [extensions, setExtensions] = useState<{ name: string; enabled: boolean }[]>([]);
  const [loadingExts, setLoadingExts] = useState<boolean>(false);
  const [togglingExt, setTogglingExt] = useState<string | null>(null);

  const fetchExtensions = async () => {
    if (activePhpVersion === "unknown") {
      setExtensions([]);
      return;
    }
    setLoadingExts(true);
    try {
      const list = await invoke<{ name: string; enabled: boolean }[]>("get_php_extensions", {
        versionId: activePhpVersion,
      });
      setExtensions(list);
    } catch (err) {
      console.warn("Gagal mengambil ekstensi PHP:", err);
    } finally {
      setLoadingExts(false);
    }
  };

  useEffect(() => {
    fetchExtensions();
  }, [activePhpVersion]);

  const handleToggleExtension = async (extName: string, currentlyEnabled: boolean) => {
    setTogglingExt(extName);
    try {
      await invoke("toggle_php_extension", {
        versionId: activePhpVersion,
        extensionName: extName,
        enable: !currentlyEnabled,
      });
      await fetchExtensions();
    } catch (err) {
      console.error("Gagal mengubah ekstensi:", err);
    } finally {
      setTogglingExt(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">PHP Version Switcher</h2>
        <p className="text-sm text-zinc-400 mt-1">Ubah versi modul PHP yang dimuat oleh Apache server dan CLI terminal Anda secara instan.</p>
      </div>

      <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl space-y-6 shadow-xl">
        <div className="space-y-4">
          <div className="flex items-center space-x-3 text-sm text-zinc-200 bg-zinc-950/30 p-3 rounded-xl border border-zinc-850 w-fit">
            <span className="font-bold text-zinc-400">Versi PHP Aktif:</span>
            <span className="font-mono bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-xl text-indigo-400 font-extrabold">
              {activePhpVersion === "unknown" ? "TERINTEGRASI DI APACHE" : activePhpVersion.toUpperCase()}
            </span>
          </div>

          <p className="text-sm text-zinc-400 leading-relaxed">
            Pilih salah satu versi PHP terpasang di bawah. Proses ini akan mengotomatiskan update konfigurasi dynamic link library 
            di file `httpd.conf` Apache, mengubah variabel PATH system di registry Windows, lalu me-restart Apache service.
          </p>
        </div>

        {!(dirsStatus[php83Path] || dirsStatus[php82Path]) ? (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 flex items-start space-x-3 text-sm text-amber-400 font-bold uppercase tracking-wider">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>Belum ada versi PHP yang terpasang. Silakan unduh PHP 8.3 atau PHP 8.2 terlebih dahulu di menu Downloader.</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5">
            {dirsStatus[php83Path] && (
              <button
                onClick={() => handleSwitchPhp("php83")}
                disabled={switchingPhp !== null}
                className={`p-5 border rounded-2xl text-left transition-all duration-200 cursor-pointer flex flex-col justify-between h-32 shadow-md ${
                  switchingPhp === "php83"
                    ? "bg-indigo-950/20 border-indigo-500/40 cursor-wait"
                    : activePhpVersion === "php83"
                      ? "bg-indigo-950/35 border-indigo-500/60 text-indigo-300 shadow-indigo-950/20"
                      : "bg-zinc-950/30 border-zinc-850 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                <div className="flex justify-between items-start w-full">
                  <span className="text-xs font-extrabold uppercase tracking-widest text-zinc-500">Stable Thread-Safe</span>
                  {switchingPhp === "php83"
                    ? <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    : activePhpVersion === "php83" && <CheckCircle2 className="w-5 h-5 text-indigo-400" />}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-zinc-100">{switchingPhp === "php83" ? "Mengganti..." : "PHP 8.3"}</h4>
                  <p className="text-xs text-zinc-500 mt-1">Direktori: {php83Path}</p>
                </div>
              </button>
            )}

            {dirsStatus[php82Path] && (
              <button
                onClick={() => handleSwitchPhp("php82")}
                disabled={switchingPhp !== null}
                className={`p-5 border rounded-2xl text-left transition-all duration-200 cursor-pointer flex flex-col justify-between h-32 shadow-md ${
                  switchingPhp === "php82"
                    ? "bg-indigo-950/20 border-indigo-500/40 cursor-wait"
                    : activePhpVersion === "php82"
                      ? "bg-indigo-950/35 border-indigo-500/60 text-indigo-300 shadow-indigo-950/20"
                      : "bg-zinc-950/30 border-zinc-850 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                <div className="flex justify-between items-start w-full">
                  <span className="text-xs font-extrabold uppercase tracking-widest text-zinc-500">Legacy Thread-Safe</span>
                  {switchingPhp === "php82"
                    ? <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    : activePhpVersion === "php82" && <CheckCircle2 className="w-5 h-5 text-indigo-400" />}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-zinc-100">{switchingPhp === "php82" ? "Mengganti..." : "PHP 8.2"}</h4>
                  <p className="text-xs text-zinc-500 mt-1">Direktori: {php82Path}</p>
                </div>
              </button>
            )}
          </div>
        )}
      </div>

      {activePhpVersion !== "unknown" && (
        <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-zinc-100">Ekstensi PHP (php.ini)</h3>
              <p className="text-xs text-zinc-400 mt-1">Aktifkan atau nonaktifkan modul ekstensi PHP secara instan. Apache akan otomatis di-restart setelah perubahan.</p>
            </div>
            {loadingExts && <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />}
          </div>

          {loadingExts && extensions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          ) : (
            <div className="php-ext-grid">
              {extensions.map(ext => (
                <div 
                  key={ext.name}
                  className="php-ext-card"
                >
                  <span className="php-ext-name">{ext.name}</span>
                  <button
                    disabled={togglingExt !== null}
                    onClick={() => handleToggleExtension(ext.name, ext.enabled)}
                    className={`php-ext-btn ${
                      togglingExt === ext.name
                        ? "bg-zinc-800 text-zinc-500 cursor-wait"
                        : ext.enabled
                          ? "php-ext-btn-active"
                          : "php-ext-btn-inactive"
                    }`}
                  >
                    {togglingExt === ext.name && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                    <span>{togglingExt === ext.name ? "Proses" : ext.enabled ? "Aktif" : "Nonaktif"}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
