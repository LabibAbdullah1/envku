import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Star, Bug, Info, ExternalLink, RefreshCw, Download, Trash2 } from "lucide-react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

interface SupportTabProps {
  services: {
    [key: string]: {
      installed: boolean;
      running: boolean;
      conflict?: boolean;
      conflictMessage?: string;
    };
  };
  activePhpVersion: string;
  dirsStatus: { [key: string]: boolean };
  baseDir: string;
}

export default function SupportTab({
  services,
  activePhpVersion,
  dirsStatus,
  baseDir,
}: SupportTabProps) {
  const isLinux = baseDir.startsWith("/") || !baseDir.includes("\\");
  const [bugTitle, setBugTitle] = useState("");
  const [bugDesc, setBugDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [currentVersion, setCurrentVersion] = useState("1.3.7");
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    available: boolean;
    version?: string;
    body?: string;
  } | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updateObj, setUpdateObj] = useState<any>(null);

  useEffect(() => {
    getVersion().then(setCurrentVersion).catch(console.error);
  }, []);

  const handleCheckForUpdates = async () => {
    setChecking(true);
    setUpdateError(null);
    setUpdateInfo(null);
    setUpdateObj(null);
    try {
      const update = await check();
      if (update) {
        setUpdateInfo({
          available: true,
          version: update.version,
          body: update.body,
        });
        setUpdateObj(update);
      } else {
        setUpdateInfo({ available: false });
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = err?.message || String(err);
      if (isLinux && (errMsg.includes("fallback platforms") || errMsg.includes("platforms"))) {
        setUpdateError("Pembaluan otomatis belum tersedia untuk platform Linux di server update. Silakan periksa rilis versi Linux secara manual di GitHub.");
      } else {
        setUpdateError(errMsg);
      }
    } finally {
      setChecking(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateObj) return;
    setInstalling(true);
    try {
      let downloaded = 0;
      let contentLength = 0;
      await updateObj.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case 'Finished':
            break;
        }
      });
      alert("Pembaruan berhasil dipasang. Aplikasi akan dimuat ulang!");
      await relaunch();
    } catch (err: any) {
      console.error(err);
      alert(`Gagal memasang pembaruan: ${err?.message || String(err)}`);
      setDownloadProgress(null);
    } finally {
      setInstalling(false);
    }
  };

  // Generate markdown diagnostics report
  const generateDiagnosticsReport = () => {
    const serviceDetails = Object.entries(services)
      .map(([name, status]) => {
        let text = `- **${name}**: ${status.installed ? "Terinstal" : "Belum Terinstal"} | ${
          status.running ? "Aktif (Running)" : "Nonaktif (Stopped)"
        }`;
        if (status.conflict) {
          text += ` | ⚠️ Konflik: ${status.conflictMessage}`;
        }
        return text;
      })
      .join("\n");

    const folderDetails = Object.entries(dirsStatus)
      .map(([path, exists]) => `- \`${path}\`: ${exists ? "Ada" : "Tidak Ada"}`)
      .join("\n");

    return `### Deskripsi Kendala
${bugDesc || "Tidak ada deskripsi rinci yang dimasukkan."}

### Rincian Diagnostik Sistem (Otomatis)
- **OS**: ${isLinux ? "Linux" : "Windows"}
- **Server Base Dir**: \`${baseDir}\`
- **Versi PHP Aktif**: ${activePhpVersion.toUpperCase()}

#### Status Layanan (Services)
${serviceDetails}

#### Pemeriksaan Direktori
${folderDetails}`;
  };

  const handleStarGithub = async () => {
    try {
      await invoke("open_in_browser", { url: "https://github.com/LabibAbdullah1/envku" });
    } catch (err) {
      console.error("Gagal membuka browser:", err);
    }
  };

  const handleSubmitBug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugTitle.trim()) {
      alert("Silakan masukkan judul bug!");
      return;
    }
    setSubmitting(true);
    try {
      const bodyMarkdown = generateDiagnosticsReport();
      const encodedTitle = encodeURIComponent(`[BUG] ${bugTitle.trim()}`);
      const encodedBody = encodeURIComponent(bodyMarkdown);
      const url = `https://github.com/LabibAbdullah1/envku/issues/new?title=${encodedTitle}&body=${encodedBody}`;
      
      await invoke("open_in_browser", { url });
      
      setBugTitle("");
      setBugDesc("");
    } catch (err) {
      console.error("Gagal membuka halaman bug report:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-[#18181b]">
      <div>
        <h2 className="text-2xl font-black tracking-tight text-[#09090b]">Dukungan & Laporan Kendala</h2>
        <p className="text-sm text-[#52525b] mt-1 font-semibold">Dukung proyek open-source Envku dengan memberikan bintang atau laporkan kendala sistem secara instan.</p>
      </div>

      {/* Control Panel Uninstallation Information */}
      <div className="p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] space-y-3">
        <div className="flex items-center space-x-2.5 text-[#09090b]">
          <Trash2 className="w-5 h-5 text-[#09090b] shrink-0" />
          <h3 className="text-base font-black text-[#09090b]">Informasi Penghapusan Aplikasi (Uninstall)</h3>
        </div>
        <p className="text-xs text-[#52525b] font-medium leading-relaxed">
          Sesuai standar sistem operasi Windows, penghapusan aplikasi Envku Orchestrator dilakukan secara default melalui <strong className="text-[#09090b] font-extrabold">Control Panel Windows (Add or Remove Programs / Program dan Fitur)</strong>. Uninstaller resmi Windows akan secara otomatis menghentikan service, membersihkan registry, entri DNS hosts, dan biner server.
        </p>
      </div>

      {/* GitHub Star Card */}
      <div className="p-6 bg-[#fde047] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] space-y-6 relative overflow-hidden">
        <div className="space-y-3 relative z-10">
          <div className="flex items-center space-x-2 text-[#09090b]">
            <Star className="w-6 h-6 fill-current text-[#09090b]" />
            <h3 className="text-lg font-black text-[#09090b]">Beri Star di GitHub</h3>
          </div>
          <p className="text-xs text-[#09090b] font-semibold leading-relaxed max-w-2xl">
            Suka dengan kemudahan yang ditawarkan oleh Envku Orchestrator? Bintang (Star) Anda di GitHub sangatlah berarti untuk mendukung kelangsungan pengembangan proyek open-source ini dan membantu developer lain menemukan Envku!
          </p>
        </div>
        <div className="pt-2">
          <button
            onClick={handleStarGithub}
            className="px-6 py-3 bg-[#ffffff] text-[#09090b] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] text-xs font-black uppercase transition cursor-pointer flex items-center justify-center gap-2.5"
          >
            <Star className="w-4.5 h-4.5 fill-current" />
            <span>Star Envku di GitHub</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Check for Updates Card */}
      <div className="p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] space-y-6">
        <div className="space-y-3 relative z-10">
          <div className="flex items-center space-x-2 text-[#09090b]">
            <RefreshCw className={`w-6 h-6 ${checking ? "animate-spin" : ""}`} />
            <h3 className="text-lg font-black text-[#09090b]">Pembaruan Aplikasi</h3>
          </div>
          <p className="text-xs text-[#52525b] font-semibold leading-relaxed max-w-2xl">
            Periksa versi terbaru Envku Orchestrator secara manual. Versi Anda saat ini: <span className="font-mono font-black text-[#09090b] bg-[#fffefb] px-1.5 py-0.5 border border-[#09090b]">v{currentVersion}</span>.
          </p>
        </div>

        {/* Update Status / Info */}
        {updateError && (
          <div className="p-4 bg-[#fecaca] border-2.5 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] text-xs text-[#7f1d1d] font-bold">
            <strong>Gagal memeriksa pembaruan:</strong> {updateError}
          </div>
        )}

        {updateInfo && !updateInfo.available && (
          <div className="p-4 bg-[#bbf7d0] border-2.5 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] text-xs text-[#14532d] font-bold">
            Envku Orchestrator sudah menggunakan versi terbaru (v{currentVersion}).
          </div>
        )}

        {updateInfo && updateInfo.available && (
          <div className="p-4 bg-[#7dd3fc] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] space-y-3">
            <div className="text-xs text-[#09090b] font-black uppercase flex items-center gap-2">
              <Info className="w-4 h-4" />
              <span>Versi Baru Tersedia: v{updateInfo.version}</span>
            </div>
            {updateInfo.body && (
              <p className="text-xs text-[#18181b] line-clamp-3 p-2.5 bg-[#ffffff] border-2 border-[#09090b] font-mono font-semibold">
                {updateInfo.body}
              </p>
            )}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleInstallUpdate}
                disabled={installing}
                className="px-5 py-2.5 bg-[#fde047] text-[#09090b] border-2.5 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] hover:bg-[#fef08a] text-xs font-black uppercase transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>{installing ? `Mengunduh... ${downloadProgress !== null ? `${downloadProgress}%` : ""}` : "Unduh & Pasang Pembaruan"}</span>
              </button>
            </div>
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={handleCheckForUpdates}
            disabled={checking || installing}
            className="px-6 py-3 bg-[#ffffff] text-[#18181b] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] text-xs font-black uppercase transition cursor-pointer flex items-center justify-center gap-2.5"
          >
            <RefreshCw className={`w-4.5 h-4.5 ${checking ? "animate-spin" : ""}`} />
            <span>{checking ? "Memeriksa..." : "Cek Pembaruan Sekarang"}</span>
          </button>
        </div>
      </div>

      {/* Bug Report Form */}
      <div className="p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] space-y-6">
        <div className="flex items-center space-x-2 text-[#09090b]">
          <Bug className="w-6 h-6" />
          <h3 className="text-lg font-black text-[#09090b]">Laporkan Bug / Masalah</h3>
        </div>

        <form onSubmit={handleSubmitBug} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-black text-[#09090b] uppercase tracking-wider block">Judul Masalah</label>
            <input
              type="text"
              placeholder="Contoh: Apache gagal start setelah ubah PHP version"
              value={bugTitle}
              onChange={(e) => setBugTitle(e.target.value)}
              className="w-full bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] px-4 py-3 text-xs text-[#18181b] outline-none font-semibold"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-[#09090b] uppercase tracking-wider block">Deskripsi & Langkah Reproduksi</label>
            <textarea
              placeholder="Jelaskan apa yang Anda lakukan sebelum error muncul, rincian pesan error, atau perilaku sistem yang tidak sesuai."
              value={bugDesc}
              onChange={(e) => setBugDesc(e.target.value)}
              rows={4}
              className="w-full bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] px-4 py-3 text-xs text-[#18181b] outline-none resize-none font-semibold"
            />
          </div>

          {/* Diagnostics Preview Info box */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-xs font-black text-[#09090b] uppercase tracking-wider">
              <Info className="w-3.5 h-3.5" />
              <span>Info Diagnostik yang akan Dikirim secara Otomatis</span>
            </div>
            <div className="p-4 bg-[#fffefb] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] space-y-3 font-mono text-[11px] text-[#18181b] max-h-48 overflow-y-auto font-semibold">
              <div>
                <span className="text-[#09090b] font-black uppercase"># Rincian Diagnostik Sistem</span>
                <br />OS: {isLinux ? "Linux" : "Windows"}
                <br />Server Base Dir: {baseDir}
                <br />Versi PHP Aktif: {activePhpVersion.toUpperCase()}
              </div>

              <div>
                <span className="text-[#09090b] font-black uppercase"># Status Layanan (Services)</span>
                {Object.entries(services).map(([name, status]) => (
                  <div key={name} className="flex flex-col gap-0.5 mt-1">
                    <span>
                      - {name}: {status.installed ? "Terinstal" : "Belum Terinstal"} | {status.running ? "Aktif" : "Nonaktif"}
                      {status.conflict && <span className="text-[#713f12] bg-[#fef08a] px-1 border border-[#09090b] ml-1 font-bold">⚠️ Konflik</span>}
                    </span>
                    {status.conflict && <span className="text-[#713f12] text-[10px] pl-4">{status.conflictMessage}</span>}
                  </div>
                ))}
              </div>

              <div>
                <span className="text-[#09090b] font-black uppercase"># Cek Direktori Server</span>
                {Object.entries(dirsStatus).map(([path, exists]) => (
                  <div key={path}>
                    - {path.replace(baseDir, "") || "\\"}: {exists ? "Ada" : "Tidak Ada"}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3.5 bg-[#fde047] text-[#09090b] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] hover:bg-[#fef08a] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#09090b] text-xs font-black uppercase transition cursor-pointer flex items-center justify-center gap-2"
            >
              <Bug className="w-4.5 h-4.5" />
              <span>{submitting ? "Membuka Browser..." : "Laporkan ke GitHub Issues"}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
