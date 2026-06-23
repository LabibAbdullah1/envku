import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Plus, Play, X } from "lucide-react";

interface VirtualHostInfo {
  domain: string;
  document_root: string;
  is_node: boolean;
  node_port: number | null;
}

interface ProjectWizardTabProps {
  virtualHosts: VirtualHostInfo[];
  fetchVirtualHosts: () => void;
  updateServiceStates: () => void;
  showToastMsg: (message: string, type?: "success" | "error") => void;
  handleLaunchHost: (domain: string) => void;
  handleDeleteHost: (domain: string) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

export default function ProjectWizardTab({
  virtualHosts,
  fetchVirtualHosts,
  updateServiceStates,
  showToastMsg,
  handleLaunchHost,
  handleDeleteHost,
  loading,
  setLoading,
}: ProjectWizardTabProps) {
  const [projectName, setProjectName] = useState<string>("");
  const [projectDomain, setProjectDomain] = useState<string>("");
  const [projectPath, setProjectPath] = useState<string>("");
  const [isNodeProject, setIsNodeProject] = useState<boolean>(false);
  const [nodePort, setNodePort] = useState<number>(3000);

  // Add virtual host project
  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName || !projectDomain || !projectPath) {
      showToastMsg("Semua field input proyek wajib diisi!", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await invoke<string>("add_project", {
        domain: projectDomain,
        documentRoot: projectPath,
        isNode: isNodeProject,
        nodePort: isNodeProject ? nodePort : null
      });
      showToastMsg(res, "success");
      setProjectName("");
      setProjectDomain("");
      setProjectPath("");
      fetchVirtualHosts();
    } catch (err) {
      showToastMsg(String(err), "error");
    } finally {
      setLoading(false);
      updateServiceStates();
    }
  };

  // Select Folder dialog using Rust backend
  const handleSelectFolder = async () => {
    try {
      const selected = await invoke<string | null>("select_directory");
      if (selected) {
        setProjectPath(selected);
      }
    } catch (err) {
      showToastMsg(String(err), "error");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Project Wizard (DNS & VHost)</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Tambahkan proyek baru dan daftarkan domain lokal secara instan tanpa menyentuh konfigurasi sistem manual.
        </p>
      </div>

      <form onSubmit={handleAddProject} className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl space-y-5 shadow-xl">
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Nama Proyek</label>
            <input 
              type="text"
              placeholder="Contoh: Toko Online"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full bg-zinc-950/70 border border-zinc-800 focus:border-indigo-500 focus:bg-zinc-950 rounded-xl px-4 py-3 text-sm text-zinc-100 outline-none transition-all duration-200"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Domain Lokal</label>
            <input 
              type="text"
              placeholder="Contoh: toko.test"
              value={projectDomain}
              onChange={(e) => setProjectDomain(e.target.value)}
              className="w-full bg-zinc-950/70 border border-zinc-800 focus:border-indigo-500 focus:bg-zinc-950 rounded-xl px-4 py-3 text-sm text-zinc-100 outline-none transition-all duration-200 font-mono text-indigo-400"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Folder Proyek (Rekomendasi Drive D:)</label>
          <div className="flex space-x-3">
            <input 
              type="text"
              placeholder="Contoh: D:\projects\toko"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              className="flex-1 bg-zinc-950/70 border border-zinc-800 focus:border-indigo-500 focus:bg-zinc-950 rounded-xl px-4 py-3 text-sm text-zinc-100 outline-none transition-all duration-200 font-mono"
            />
            <button
              type="button"
              onClick={handleSelectFolder}
              className="py-3.5 px-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/30 text-zinc-300 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer shrink-0"
            >
              Pilih Folder...
            </button>
          </div>
        </div>

        {/* Node Proxy settings option */}
        <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-sm font-bold text-zinc-200 block">Aktifkan Node.js Reverse Proxy</span>
              <span className="text-xs text-zinc-500 block">Daftarkan domain untuk proyek backend/frontend berbasis Node.js.</span>
            </div>
            <input 
              type="checkbox"
              checked={isNodeProject}
              onChange={(e) => setIsNodeProject(e.target.checked)}
              className="h-5 w-5 bg-zinc-950 border border-zinc-800 rounded-lg text-indigo-600 outline-none cursor-pointer"
            />
          </div>

          {isNodeProject && (
            <div className="flex items-center space-x-3.5 pt-2 animate-fade-in">
              <span className="text-sm text-zinc-400 shrink-0">Port Server Node:</span>
              <input 
                type="number"
                min="1"
                max="65535"
                value={nodePort}
                onChange={(e) => setNodePort(parseInt(e.target.value) || 3000)}
                className="w-32 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-2 text-sm text-zinc-100 outline-none font-mono"
              />
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-550 disabled:bg-zinc-800 text-white rounded-xl text-sm font-bold transition flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-indigo-950/30"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          <span>Buat & Daftarkan Proyek</span>
        </button>
      </form>

      {/* Active Hosts List */}
      <div className="space-y-4 pt-4">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Daftar Host Lokal Aktif</h3>
        {virtualHosts.length === 0 ? (
          <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl text-center text-zinc-400 font-mono text-xs">
            Belum ada domain lokal yang terdaftar di Apache virtual hosts.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5">
            {virtualHosts.map(vh => (
              <div 
                key={vh.domain}
                className="p-5 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex flex-col justify-between space-y-4 shadow-xl hover:border-zinc-700 transition"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-mono">
                      {vh.is_node ? `NODE (PORT ${vh.node_port})` : "PHP / STATIC"}
                    </span>
                  </div>
                  <h4 className="text-sm font-black text-zinc-100 font-mono select-text">{vh.domain}</h4>
                  <p className="text-[11px] text-zinc-400 font-mono truncate" title={vh.document_root}>
                    Root: {vh.document_root || "Proxy Server"}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleLaunchHost(vh.domain)}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-550 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 cursor-pointer shadow-md"
                  >
                    <Play className="w-4 h-4" />
                    <span>Buka</span>
                  </button>
                  <button
                    onClick={() => handleDeleteHost(vh.domain)}
                    className="py-2.5 px-3.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center cursor-pointer shadow-md shrink-0"
                    title="Hapus Host"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
