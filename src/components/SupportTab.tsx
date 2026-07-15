import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Star, Bug, Info, ExternalLink } from "lucide-react";

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
  const [bugTitle, setBugTitle] = useState("");
  const [bugDesc, setBugDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
- **OS**: Windows
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
      
      // Clear inputs
      setBugTitle("");
      setBugDesc("");
    } catch (err) {
      console.error("Gagal membuka halaman bug report:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-zinc-100">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Dukungan & Laporan Kendala</h2>
        <p className="text-sm text-zinc-400 mt-1">Dukung proyek open-source Envku dengan memberikan bintang atau laporkan kendala sistem secara instan.</p>
      </div>

      {/* GitHub Star Card */}
      <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl space-y-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 opacity-5">
          <Star className="w-48 h-48 text-yellow-400 fill-current" />
        </div>
        <div className="space-y-3 relative z-10">
          <div className="flex items-center space-x-2 text-yellow-400">
            <Star className="w-6 h-6 fill-current" />
            <h3 className="text-lg font-bold text-zinc-100">Beri Star di GitHub</h3>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
            Suka dengan kemudahan yang ditawarkan oleh Envku Orchestrator? Bintang (Star) Anda di GitHub sangatlah berarti untuk mendukung kelangsungan pengembangan proyek open-source ini dan membantu developer lain menemukan Envku!
          </p>
        </div>
        <div className="pt-2">
          <button
            onClick={handleStarGithub}
            className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl text-sm font-black transition duration-150 cursor-pointer shadow-md shadow-yellow-950/20 flex items-center justify-center gap-2.5"
          >
            <Star className="w-4.5 h-4.5 fill-current" />
            <span>Star Envku di GitHub</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bug Report Form */}
      <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl space-y-6 shadow-xl">
        <div className="flex items-center space-x-2 text-indigo-400">
          <Bug className="w-6 h-6" />
          <h3 className="text-lg font-bold text-zinc-100">Laporkan Bug / Masalah</h3>
        </div>

        <form onSubmit={handleSubmitBug} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Judul Masalah</label>
            <input
              type="text"
              placeholder="Contoh: Apache gagal start setelah ubah PHP version"
              value={bugTitle}
              onChange={(e) => setBugTitle(e.target.value)}
              className="w-full bg-zinc-950/70 border border-zinc-800 focus:border-indigo-500 focus:bg-zinc-950 rounded-xl px-4 py-3 text-sm text-zinc-100 outline-none transition-all duration-200"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Deskripsi & Langkah Reproduksi</label>
            <textarea
              placeholder="Jelaskan apa yang Anda lakukan sebelum error muncul, rincian pesan error, atau perilaku sistem yang tidak sesuai."
              value={bugDesc}
              onChange={(e) => setBugDesc(e.target.value)}
              rows={4}
              className="w-full bg-zinc-950/70 border border-zinc-800 focus:border-indigo-500 focus:bg-zinc-950 rounded-xl px-4 py-3 text-sm text-zinc-100 outline-none transition-all duration-200 resize-none"
            />
          </div>

          {/* Diagnostics Preview Info box */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-zinc-400 uppercase tracking-widest">
              <Info className="w-3.5 h-3.5" />
              <span>Info Diagnostik yang akan Dikirim secara Otomatis</span>
            </div>
            <div className="p-4 bg-zinc-950/60 border border-zinc-850 rounded-xl space-y-3 font-mono text-[11px] text-zinc-400 max-h-48 overflow-y-auto">
              <div>
                <span className="text-indigo-400 font-bold"># Rincian Diagnostik Sistem</span>
                <br />OS: Windows
                <br />Server Base Dir: {baseDir}
                <br />Versi PHP Aktif: {activePhpVersion.toUpperCase()}
              </div>

              <div>
                <span className="text-indigo-400 font-bold"># Status Layanan (Services)</span>
                {Object.entries(services).map(([name, status]) => (
                  <div key={name} className="flex flex-col gap-0.5 mt-1">
                    <span>
                      - {name}: {status.installed ? "Terinstal" : "Belum Terinstal"} | {status.running ? "Aktif" : "Nonaktif"}
                      {status.conflict && <span className="text-amber-400 ml-1">⚠️ Konflik</span>}
                    </span>
                    {status.conflict && <span className="text-zinc-500 text-[10px] pl-4">{status.conflictMessage}</span>}
                  </div>
                ))}
              </div>

              <div>
                <span className="text-indigo-400 font-bold"># Cek Direktori Server</span>
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
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-black transition duration-150 cursor-pointer shadow-md shadow-indigo-950/20 flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-wait"
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
