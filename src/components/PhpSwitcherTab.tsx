import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Loader2, CheckCircle2, Cpu, Layers } from "lucide-react";
import { formatFriendlyError } from "../utils/formatError";

interface PhpSwitcherTabProps {
  dirsStatus: { [key: string]: boolean };
  activePhpVersion: string;
  switchingPhp: string | null;
  handleSwitchPhp: (versionId: string) => void;
  baseDir: string;
  showToastMsg?: (message: string, type?: "success" | "error") => void;
}

interface PhpVersionMeta {
  id: string;
  name: string;
  label: string;
  badge: string;
}

export default function PhpSwitcherTab({
  dirsStatus,
  activePhpVersion,
  switchingPhp,
  handleSwitchPhp,
  baseDir,
  showToastMsg,
}: PhpSwitcherTabProps) {
  const isLinux = baseDir.startsWith("/") || !baseDir.includes("\\");

  const allPhpVersions: PhpVersionMeta[] = [
    { id: "php85", name: "PHP 8.5", label: "PHP 8.5 Engine", badge: "Rilis Terbaru" },
    { id: "php84", name: "PHP 8.4", label: "PHP 8.4 Engine", badge: "Standar Modern" },
    { id: "php83", name: "PHP 8.3", label: "PHP 8.3 Engine", badge: "Stable Thread-Safe" },
    { id: "php82", name: "PHP 8.2", label: "PHP 8.2 Engine", badge: "Legacy Thread-Safe" },
  ];

  // Dynamically filter ONLY PHP versions that are currently installed on disk
  const installedVersions = allPhpVersions.filter((ver) => {
    const fullPath = isLinux ? `${baseDir}/${ver.id}` : `${baseDir}\\${ver.id}`;
    return dirsStatus[fullPath] === true;
  });

  const [extensions, setExtensions] = useState<{ name: string; enabled: boolean }[]>([]);
  const [loadingExts, setLoadingExts] = useState<boolean>(false);
  const [togglingExt, setTogglingExt] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredExtensions = extensions.filter((ext) =>
    ext.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fetchExtensions = async () => {
    if (activePhpVersion === "unknown" || installedVersions.length === 0) {
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
      const msg = formatFriendlyError(err);
      if (showToastMsg) showToastMsg(msg, "error");
    } finally {
      setLoadingExts(false);
    }
  };

  useEffect(() => {
    fetchExtensions();
  }, [activePhpVersion, installedVersions.length]);

  const handleToggleExtension = async (extName: string, currentlyEnabled: boolean) => {
    setTogglingExt(extName);
    try {
      await invoke("toggle_php_extension", {
        versionId: activePhpVersion,
        extensionName: extName,
        enable: !currentlyEnabled,
      });
      await fetchExtensions();
      if (showToastMsg) {
        showToastMsg(
          `Ekstensi ${extName} berhasil di-${!currentlyEnabled ? "aktifkan" : "nonaktifkan"}.`,
          "success"
        );
      }
    } catch (err) {
      const msg = formatFriendlyError(err);
      if (showToastMsg) showToastMsg(msg, "error");
    } finally {
      setTogglingExt(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Cpu className="w-6 h-6 text-indigo-400" />
          <span>PHP Version Switcher</span>
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Ubah versi modul PHP yang dimuat oleh Apache server dan CLI terminal Anda secara instan.
        </p>
      </div>

      <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl space-y-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
          <div className="flex items-center space-x-3 text-sm text-zinc-200 bg-zinc-950/50 px-4 py-2.5 rounded-xl border border-zinc-800 w-fit shadow-inner">
            <span className="font-bold text-zinc-400">Versi PHP Aktif:</span>
            <span className="font-mono bg-indigo-500/15 border border-indigo-500/30 px-3 py-1 rounded-lg text-indigo-400 font-extrabold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              {activePhpVersion === "unknown"
                ? "BELUM DIPILIH"
                : activePhpVersion.toUpperCase()}
            </span>
          </div>

          {/* Render Dropdown ONLY if there are installed PHP versions */}
          {installedVersions.length > 0 && (
            <div className="flex items-center space-x-3 shrink-0">
              <label htmlFor="php-dropdown" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Pilih PHP:
              </label>
              <select
                id="php-dropdown"
                value={activePhpVersion !== "unknown" ? activePhpVersion : installedVersions[0]?.id || ""}
                onChange={(e) => handleSwitchPhp(e.target.value)}
                disabled={switchingPhp !== null}
                className="bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-2 text-xs font-bold text-zinc-100 outline-none cursor-pointer transition shadow-sm font-mono"
              >
                {installedVersions.map((ver) => (
                  <option key={ver.id} value={ver.id}>
                    {ver.name} ({ver.badge})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <p className="text-sm text-zinc-400 leading-relaxed">
          Pilih versi PHP terpasang untuk memperbarui modul DLL di Apache <code className="font-mono text-xs bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-300">httpd.conf</code>, 
          {isLinux ? " memperbarui tautan symlink biner" : " memperbarui variabel PATH system di registry Windows"}, dan me-restart layanan Apache secara otomatis.
        </p>

        {/* Empty State: If NO PHP version is installed */}
        {installedVersions.length === 0 ? (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 text-amber-300">
            <div className="p-3 bg-amber-500/20 rounded-xl shrink-0">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold uppercase tracking-wider text-amber-400">
                Belum ada versi PHP yang terpasang
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Silakan unduh salah satu modul versi PHP (PHP 8.5, PHP 8.4, PHP 8.3, atau PHP 8.2) terlebih dahulu pada tab Katalog Komponen Server.
              </p>
            </div>
          </div>
        ) : (
          /* Grid Card Selector for Installed PHP Versions */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {installedVersions.map((ver) => {
              const versionPath = isLinux ? `${baseDir}/${ver.id}` : `${baseDir}\\${ver.id}`;
              const isActive = activePhpVersion === ver.id;
              const isSwitchingThis = switchingPhp === ver.id;

              return (
                <button
                  key={ver.id}
                  onClick={() => handleSwitchPhp(ver.id)}
                  disabled={switchingPhp !== null}
                  className={`p-5 border rounded-2xl text-left transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[135px] shadow-lg ${
                    isSwitchingThis
                      ? "bg-indigo-950/40 border-indigo-500/70 cursor-wait animate-pulse"
                      : isActive
                        ? "bg-indigo-900/40 border-indigo-500 text-indigo-300 shadow-indigo-950/30 ring-2 ring-indigo-500/50"
                        : "bg-zinc-950/40 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white"
                  }`}
                >
                  <div className="flex justify-between items-start w-full gap-2 mb-3">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded border ${
                      isActive ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50" : "bg-zinc-900 text-zinc-400 border-zinc-800"
                    }`}>
                      {ver.badge}
                    </span>
                    {isSwitchingThis ? (
                      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
                    ) : (
                      isActive && <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-xl font-black font-mono tracking-tight">
                      {isSwitchingThis ? "Mengganti..." : ver.name}
                    </h4>
                    <p className="text-[11px] text-zinc-400 font-mono mt-1 truncate" title={versionPath}>
                      Path: {ver.id}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Extensions Manager (Only displayed if at least one PHP is installed and active) */}
      {installedVersions.length > 0 && activePhpVersion !== "unknown" && (
        <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl space-y-6 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-800/80 pb-4 gap-4">
            <div>
              <h3 className="text-lg font-black flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400 shrink-0" />
                <span>Ekstensi PHP (php.ini - {activePhpVersion.toUpperCase()})</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Aktifkan atau nonaktifkan modul ekstensi PHP secara instan. Apache akan otomatis di-restart setelah perubahan.
              </p>
            </div>
            <div className="flex items-center space-x-3 shrink-0">
              <input
                type="text"
                placeholder="Cari ekstensi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-zinc-950/70 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-2 text-xs text-zinc-100 outline-none transition-all duration-200 w-full sm:w-48 font-mono"
              />
            </div>
          </div>

          {loadingExts && extensions.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          ) : filteredExtensions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-500 text-xs">
              Tidak ada ekstensi yang cocok dengan "{searchQuery}"
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredExtensions.map((ext) => (
                <div
                  key={ext.name}
                  className="p-3 bg-zinc-950/40 border border-zinc-850 rounded-xl flex items-center justify-between hover:border-zinc-750 transition"
                >
                  <span className="text-xs font-mono font-bold text-zinc-200 truncate mr-2" title={ext.name}>
                    {ext.name}
                  </span>
                  <button
                    disabled={togglingExt !== null}
                    onClick={() => handleToggleExtension(ext.name, ext.enabled)}
                    className={`py-1 px-3 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer shrink-0 border ${
                      togglingExt === ext.name
                        ? "bg-zinc-800 border-zinc-700 text-zinc-500 cursor-wait"
                        : ext.enabled
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
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
