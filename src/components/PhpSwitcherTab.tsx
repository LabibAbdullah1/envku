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
    <div className="space-y-6 animate-fade-in text-[#18181b]">
      <div>
        <h2 className="text-2xl font-black text-[#09090b] tracking-tight flex items-center gap-2">
          <Cpu className="w-6 h-6 text-[#09090b]" />
          <span>PHP Version Switcher</span>
        </h2>
        <p className="text-sm text-[#52525b] mt-1 font-semibold">
          Ubah versi modul PHP yang dimuat oleh Apache server dan CLI terminal Anda secara instan.
        </p>
      </div>

      <div className="p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2.5 border-[#09090b] pb-5">
          <div className="flex items-center space-x-3 text-xs text-[#09090b] bg-[#fffefb] px-4 py-2.5 border-2.5 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] w-fit">
            <span className="font-black text-[#52525b] uppercase">Versi PHP Aktif:</span>
            <span className="font-mono bg-[#fde047] border-2 border-[#09090b] px-3 py-1 text-[#09090b] font-black flex items-center gap-1.5 shadow-[2px_2px_0px_0px_#09090b]">
              <span className="w-2 h-2 rounded-full bg-[#09090b] animate-pulse" />
              {activePhpVersion === "unknown"
                ? "BELUM DIPILIH"
                : activePhpVersion.toUpperCase()}
            </span>
          </div>

          {installedVersions.length > 0 && (
            <div className="flex items-center space-x-3 shrink-0">
              <label htmlFor="php-dropdown" className="text-xs font-black text-[#09090b] uppercase tracking-wider">
                Pilih PHP:
              </label>
              <select
                id="php-dropdown"
                value={activePhpVersion !== "unknown" ? activePhpVersion : installedVersions[0]?.id || ""}
                onChange={(e) => handleSwitchPhp(e.target.value)}
                disabled={switchingPhp !== null}
                className="bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] px-4 py-2 text-xs font-black text-[#09090b] outline-none cursor-pointer font-mono"
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

        <p className="text-xs text-[#52525b] font-medium leading-relaxed">
          Pilih versi PHP terpasang untuk memperbarui modul DLL di Apache <code className="font-mono text-xs bg-[#fffefb] px-1.5 py-0.5 border border-[#09090b] text-[#09090b]">httpd.conf</code>, 
          {isLinux ? " memperbarui tautan symlink biner" : " memperbarui variabel PATH system di registry Windows"}, dan me-restart layanan Apache secara otomatis.
        </p>

        {installedVersions.length === 0 ? (
          <div className="bg-[#fef08a] border-2.5 border-[#09090b] p-5 shadow-[3px_3px_0px_0px_#09090b] flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 text-[#713f12]">
            <div className="p-2.5 bg-[#ffffff] border-2 border-[#09090b] shrink-0">
              <AlertTriangle className="w-5 h-5 text-[#713f12]" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-[#713f12]">
                Belum ada versi PHP yang terpasang
              </h4>
              <p className="text-xs text-[#713f12] font-semibold leading-relaxed">
                Silakan unduh salah satu modul versi PHP (PHP 8.5, PHP 8.4, PHP 8.3, atau PHP 8.2) terlebih dahulu pada tab Katalog Komponen Server.
              </p>
            </div>
          </div>
        ) : (
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
                  className={`p-4 border-3 border-[#09090b] text-left transition-all duration-150 cursor-pointer flex flex-col justify-between min-h-[130px] ${
                    isSwitchingThis
                      ? "bg-[#7dd3fc] text-[#09090b] shadow-[4px_4px_0px_0px_#09090b] animate-pulse"
                      : isActive
                        ? "bg-[#fde047] text-[#09090b] shadow-[4px_4px_0px_0px_#09090b]"
                        : "bg-[#ffffff] text-[#18181b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#eae6df] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b]"
                  }`}
                >
                  <div className="flex justify-between items-start w-full gap-2 mb-3">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border-2 border-[#09090b] ${
                      isActive ? "bg-[#ffffff] text-[#09090b]" : "bg-[#eae6df] text-[#52525b]"
                    }`}>
                      {ver.badge}
                    </span>
                    {isSwitchingThis ? (
                      <Loader2 className="w-4 h-4 text-[#09090b] animate-spin shrink-0" />
                    ) : (
                      isActive && <CheckCircle2 className="w-4 h-4 text-[#09090b] shrink-0" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-lg font-black font-mono tracking-tight text-[#09090b]">
                      {isSwitchingThis ? "Mengganti..." : ver.name}
                    </h4>
                    <p className="text-[11px] text-[#52525b] font-mono mt-1 truncate font-semibold" title={versionPath}>
                      Path: {ver.id}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {installedVersions.length > 0 && activePhpVersion !== "unknown" && (
        <div className="p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b-2.5 border-[#09090b] pb-4 gap-4">
            <div>
              <h3 className="text-base font-black flex items-center gap-2 text-[#09090b]">
                <Layers className="w-5 h-5 text-[#09090b] shrink-0" />
                <span>Ekstensi PHP (php.ini - {activePhpVersion.toUpperCase()})</span>
              </h3>
              <p className="text-xs text-[#52525b] mt-1 font-semibold">
                Aktifkan atau nonaktifkan modul ekstensi PHP secara instan. Apache akan otomatis di-restart setelah perubahan.
              </p>
            </div>
            <div className="flex items-center space-x-3 shrink-0">
              <input
                type="text"
                placeholder="Cari ekstensi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] px-4 py-2 text-xs text-[#18181b] outline-none w-full sm:w-48 font-mono font-bold"
              />
            </div>
          </div>

          {loadingExts && extensions.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-8 h-8 text-[#09090b] animate-spin" />
            </div>
          ) : filteredExtensions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-[#52525b] text-xs font-semibold">
              Tidak ada ekstensi yang cocok dengan "{searchQuery}"
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredExtensions.map((ext) => (
                <div
                  key={ext.name}
                  className="p-3 bg-[#fffefb] border-2.5 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] flex items-center justify-between"
                >
                  <span className="text-xs font-mono font-bold text-[#18181b] truncate mr-2" title={ext.name}>
                    {ext.name}
                  </span>
                  <button
                    disabled={togglingExt !== null}
                    onClick={() => handleToggleExtension(ext.name, ext.enabled)}
                    className={`py-1 px-2.5 text-[11px] font-black transition flex items-center space-x-1 cursor-pointer shrink-0 border-2 border-[#09090b] ${
                      togglingExt === ext.name
                        ? "bg-[#eae6df] text-[#52525b] cursor-wait"
                        : ext.enabled
                          ? "bg-[#bbf7d0] text-[#14532d] hover:bg-[#86efac]"
                          : "bg-[#ffffff] text-[#52525b] hover:bg-[#eae6df]"
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
