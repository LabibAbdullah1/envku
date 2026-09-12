import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Plus, Play, X, Edit, Check, FolderPlus, Sparkles } from "lucide-react";
import { formatFriendlyError } from "../utils/formatError";

interface VirtualHostInfo {
  domain: string;
  document_root: string;
  is_node: boolean;
  node_port: number | null;
  has_ssl: boolean;
}

interface ProjectWizardTabProps {
  virtualHosts: VirtualHostInfo[];
  fetchVirtualHosts: () => void;
  updateServiceStates: () => void;
  showToastMsg: (message: string, type?: "success" | "error") => void;
  handleLaunchHost: (domain: string, hasSsl: boolean) => void;
  handleDeleteHost: (domain: string) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  isLinux?: boolean;
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
  isLinux = false,
}: ProjectWizardTabProps) {
  const [wizardMode, setWizardMode] = useState<"register" | "create_laravel">("register");
  const [projectName, setProjectName] = useState<string>("");
  const [projectDomain, setProjectDomain] = useState<string>("");
  const [projectPath, setProjectPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string>("");
  const [projectType, setProjectType] = useState<"laravel" | "php" | "node">("laravel");
  const [isNodeProject, setIsNodeProject] = useState<boolean>(false);
  const [nodePort, setNodePort] = useState<number>(3000);
  const [enableSsl, setEnableSsl] = useState<boolean>(false);
  const [editingDomain, setEditingDomain] = useState<string | null>(null);

  const handleProjectNameChange = (name: string) => {
    setProjectName(name);
    // Auto format local domain if user hasn't typed a custom one or editing
    if (!editingDomain) {
      const cleanSlug = name.toLowerCase().trim().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
      if (cleanSlug) {
        setProjectDomain(`${cleanSlug}.test`);
      } else {
        setProjectDomain("");
      }
    }
  };

  const handleStartEdit = (vh: VirtualHostInfo) => {
    setWizardMode("register");
    setProjectName(vh.domain);
    setProjectDomain(vh.domain);
    setProjectPath(vh.document_root);
    setIsNodeProject(vh.is_node);
    setNodePort(vh.node_port || 3000);
    setEnableSsl(vh.has_ssl);
    setEditingDomain(vh.domain);

    const isLaravel = !vh.is_node && (vh.document_root.toLowerCase().endsWith("/public") || vh.document_root.toLowerCase().endsWith("\\public"));
    if (vh.is_node) {
      setProjectType("node");
    } else if (isLaravel) {
      setProjectType("laravel");
    } else {
      setProjectType("php");
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setProjectName("");
    setProjectDomain("");
    setProjectPath("");
    setParentPath("");
    setProjectType("laravel");
    setIsNodeProject(false);
    setNodePort(3000);
    setEnableSsl(false);
    setEditingDomain(null);
  };

  // Create new Laravel Project via Composer
  const handleCreateLaravelProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !projectDomain.trim() || !parentPath.trim()) {
      showToastMsg("Nama proyek, domain lokal, dan folder induk wajib diisi!", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await invoke<string>("create_laravel_project", {
        projectName: projectName.trim(),
        domain: projectDomain.trim(),
        parentDir: parentPath.trim(),
        enableSsl: enableSsl,
      });
      showToastMsg(res, "success");
      setProjectName("");
      setProjectDomain("");
      setParentPath("");
      setEnableSsl(false);
      fetchVirtualHosts();
    } catch (err) {
      showToastMsg(formatFriendlyError(err), "error");
    } finally {
      setLoading(false);
      updateServiceStates();
    }
  };

  // Add or Edit virtual host project
  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wizardMode === "create_laravel") {
      return handleCreateLaravelProject(e);
    }

    if (!projectName || !projectDomain || !projectPath) {
      showToastMsg("Semua field input proyek wajib diisi!", "error");
      return;
    }

    let finalDocRoot = projectPath.trim();
    if (projectType === "laravel" && !isNodeProject) {
      const lower = finalDocRoot.toLowerCase();
      if (!lower.endsWith("/public") && !lower.endsWith("\\public")) {
        finalDocRoot = finalDocRoot.endsWith("/") || finalDocRoot.endsWith("\\")
          ? `${finalDocRoot}public`
          : `${finalDocRoot}/public`;
      }
    }

    setLoading(true);
    try {
      if (editingDomain) {
        // Edit mode
        const res = await invoke<string>("edit_project", {
          oldDomain: editingDomain,
          newDomain: projectDomain,
          documentRoot: finalDocRoot,
          isNode: isNodeProject,
          nodePort: isNodeProject ? nodePort : null,
          enableSsl: enableSsl
        });
        showToastMsg(res, "success");
        handleCancelEdit();
      } else {
        // Add mode
        const res = await invoke<string>("add_project", {
          domain: projectDomain,
          documentRoot: finalDocRoot,
          isNode: isNodeProject,
          nodePort: isNodeProject ? nodePort : null,
          enableSsl: enableSsl
        });
        showToastMsg(res, "success");
        setProjectName("");
        setProjectDomain("");
        setProjectPath("");
        setEnableSsl(false);
      }
      fetchVirtualHosts();
    } catch (err) {
      showToastMsg(formatFriendlyError(err), "error");
    } finally {
      setLoading(false);
      updateServiceStates();
    }
  };

  // Select Folder dialog using Rust backend
  const handleSelectFolder = async (isParent: boolean = false) => {
    try {
      const selected = await invoke<string | null>("select_directory");
      if (selected) {
        if (isParent) {
          setParentPath(selected);
        } else {
          let path = selected;
          if (projectType === "laravel" && !path.toLowerCase().endsWith("/public") && !path.toLowerCase().endsWith("\\public")) {
            path = path.endsWith("/") || path.endsWith("\\") ? `${path}public` : `${path}/public`;
          }
          setProjectPath(path);
        }
      }
    } catch (err) {
      showToastMsg(formatFriendlyError(err), "error");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight">Project Wizard (DNS & VHost)</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Buat proyek Laravel baru versi terbaru via Composer atau daftarkan folder proyek lokal Anda secara instan.
          </p>
        </div>

        {/* Wizard Mode Tabs */}
        <div className="flex flex-wrap gap-2 p-1.5 bg-zinc-900 border border-zinc-800 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => {
              setWizardMode("register");
              handleCancelEdit();
            }}
            className={`px-3.5 py-2 text-xs font-black rounded-lg transition flex items-center justify-center space-x-2 cursor-pointer ${
              wizardMode === "register"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-zinc-850 text-zinc-300 hover:text-white"
            }`}
          >
            <FolderPlus className="w-4 h-4 shrink-0" />
            <span>Daftarkan Folder Ada</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setWizardMode("create_laravel");
              handleCancelEdit();
            }}
            className={`px-3.5 py-2 text-xs font-black rounded-lg transition flex items-center justify-center space-x-2 cursor-pointer ${
              wizardMode === "create_laravel"
                ? "bg-red-600 text-white shadow-md"
                : "bg-zinc-850 text-zinc-300 hover:text-white"
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0 text-yellow-300" />
            <span>Buat Laravel Baru (Composer)</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmitProject} className="p-5 sm:p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl space-y-5 shadow-xl">
        {wizardMode === "register" ? (
          <>
            {/* Preset Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Tipe / Preset Proyek</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setProjectType("laravel");
                    setIsNodeProject(false);
                    if (projectPath && !projectPath.toLowerCase().endsWith("/public") && !projectPath.toLowerCase().endsWith("\\public")) {
                      setProjectPath(projectPath.endsWith("/") || projectPath.endsWith("\\") ? `${projectPath}public` : `${projectPath}/public`);
                    }
                  }}
                  className={`py-3 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 border cursor-pointer ${
                    projectType === "laravel" && !isNodeProject
                      ? "bg-red-500/20 border-red-500/60 text-red-400 font-extrabold"
                      : "bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  <span>🔴 Laravel Framework</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProjectType("php");
                    setIsNodeProject(false);
                    if (projectPath.toLowerCase().endsWith("/public") || projectPath.toLowerCase().endsWith("\\public")) {
                      setProjectPath(projectPath.slice(0, -7));
                    }
                  }}
                  className={`py-3 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 border cursor-pointer ${
                    projectType === "php" && !isNodeProject
                      ? "bg-indigo-500/20 border-indigo-500/60 text-indigo-400 font-extrabold"
                      : "bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  <span>🌐 General (PHP / Static)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProjectType("node");
                    setIsNodeProject(true);
                  }}
                  className={`py-3 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 border cursor-pointer ${
                    isNodeProject
                      ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-400 font-extrabold"
                      : "bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  <span>⚡ Node.js Reverse Proxy</span>
                </button>
              </div>
              {projectType === "laravel" && !isNodeProject && (
                <p className="text-[11px] text-red-400/90 pt-1 font-semibold">
                  ✨ Preset Laravel: Menautkan DocumentRoot ke folder <code className="font-mono bg-red-950/40 px-1 py-0.5 rounded text-red-300">/public</code> dan mengaktifkan mod_rewrite secara otomatis.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Nama Proyek</label>
                <input 
                  type="text"
                  placeholder="Contoh: Toko Online"
                  value={projectName}
                  onChange={(e) => handleProjectNameChange(e.target.value)}
                  className="w-full bg-zinc-950/70 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 outline-none transition-all duration-200"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Domain Lokal</label>
                <input 
                  type="text"
                  placeholder="Contoh: toko.test"
                  value={projectDomain}
                  onChange={(e) => setProjectDomain(e.target.value)}
                  className="w-full bg-zinc-950/70 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 outline-none transition-all duration-200 font-mono text-indigo-400 font-extrabold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Folder Proyek (Rekomendasi Drive D:)</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="text"
                  placeholder={projectType === "laravel" ? "Contoh: D:\\projects\\toko\\public" : "Contoh: D:\\projects\\toko"}
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  className="flex-1 bg-zinc-950/70 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 outline-none transition-all duration-200 font-mono"
                />
                <button
                  type="button"
                  onClick={() => handleSelectFolder(false)}
                  className="py-2.5 px-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white rounded-xl text-xs font-extrabold uppercase tracking-wider transition cursor-pointer shrink-0"
                >
                  Pilih Folder...
                </button>
              </div>
            </div>

            {/* Node Proxy settings option */}
            {isNodeProject && (
              <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl space-y-4 animate-fade-in">
                <div className="flex items-center space-x-3.5">
                  <span className="text-sm text-zinc-400 shrink-0 font-bold">Port Server Node:</span>
                  <input 
                    type="number"
                    min="1"
                    max="65535"
                    value={nodePort}
                    onChange={(e) => setNodePort(parseInt(e.target.value) || 3000)}
                    className="w-32 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-2 text-sm text-zinc-100 outline-none font-mono"
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          /* Mode: Create New Laravel Project via Composer */
          <div className="space-y-5 animate-fade-in">
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <div className="flex items-start space-x-3">
                <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-amber-300">Generator Proyek Laravel Resmi Terbaru</h4>
                  <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                    Envku akan menjalankan <code className="font-mono bg-zinc-950 px-1 py-0.5 rounded text-amber-300 border border-zinc-800">composer create-project laravel/laravel</code> secara otomatis menggunakan versi PHP aktif & Composer lokal, mengatur DocumentRoot ke <code className="font-mono bg-zinc-950 px-1 py-0.5 rounded text-amber-300 border border-zinc-800">/public</code>, mendaftarkan VirtualHost Apache, serta menambahkan DNS <code className="font-mono bg-zinc-950 px-1 py-0.5 rounded text-amber-300 border border-zinc-800">.test</code> ke hosts file.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Nama Proyek Laravel</label>
                <input 
                  type="text"
                  placeholder="Contoh: toko-online"
                  value={projectName}
                  onChange={(e) => handleProjectNameChange(e.target.value)}
                  className="w-full bg-zinc-950/70 border border-zinc-800 focus:border-red-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 outline-none transition-all duration-200"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Domain Lokal (.test)</label>
                <input 
                  type="text"
                  placeholder="Contoh: toko-online.test"
                  value={projectDomain}
                  onChange={(e) => setProjectDomain(e.target.value)}
                  className="w-full bg-zinc-950/70 border border-zinc-800 focus:border-red-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 outline-none transition-all duration-200 font-mono text-red-400 font-extrabold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Folder Induk (Tempat Proyek Dibuat)</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="text"
                  placeholder="Contoh: D:\projects (akan dibuat folder D:\projects\toko-online)"
                  value={parentPath}
                  onChange={(e) => setParentPath(e.target.value)}
                  className="flex-1 bg-zinc-950/70 border border-zinc-800 focus:border-red-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 outline-none transition-all duration-200 font-mono"
                />
                <button
                  type="button"
                  onClick={() => handleSelectFolder(true)}
                  className="py-2.5 px-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white rounded-xl text-xs font-extrabold uppercase tracking-wider transition cursor-pointer shrink-0"
                >
                  Pilih Folder Induk...
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SSL / HTTPS option */}
        <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-sm font-bold block">Aktifkan SSL (HTTPS)</span>
              <span className="text-xs text-zinc-400 block">Buat sertifikat SSL self-signed lokal dan daftarkan ke trust store {isLinux ? "Linux" : "Windows"}.</span>
            </div>
            <input 
              type="checkbox"
              checked={enableSsl}
              onChange={(e) => setEnableSsl(e.target.checked)}
              className="h-5 w-5 bg-zinc-950 border border-zinc-800 rounded-lg text-indigo-600 outline-none cursor-pointer shrink-0"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 px-4 text-white rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center justify-center space-x-2 cursor-pointer shadow-lg leading-normal ${
              wizardMode === "create_laravel"
                ? "bg-red-600 hover:bg-red-550 disabled:bg-zinc-800 shadow-red-950/30"
                : "bg-indigo-600 hover:bg-indigo-550 disabled:bg-zinc-800 shadow-indigo-950/30"
            }`}
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                <span>{wizardMode === "create_laravel" ? "Membuat Proyek Laravel via Composer... Mohon Tunggu" : "Memproses..."}</span>
              </>
            ) : editingDomain ? (
              <>
                <Check className="w-4 h-4 shrink-0" />
                <span>Simpan Perubahan</span>
              </>
            ) : wizardMode === "create_laravel" ? (
              <>
                <Sparkles className="w-4 h-4 shrink-0 text-yellow-300" />
                <span>Buat Proyek Laravel Terbaru (Auto Composer)</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 shrink-0" />
                <span>Daftarkan Proyek Lokal</span>
              </>
            )}
          </button>

          {editingDomain && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="py-3.5 px-6 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer shrink-0"
            >
              Batal
            </button>
          )}
        </div>
      </form>

      {/* Active Hosts List */}
      <div className="space-y-4 pt-4">
        <h3 className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest">Daftar Host Lokal Aktif</h3>
        {virtualHosts.length === 0 ? (
          <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl text-center text-zinc-400 font-mono text-xs">
            Belum ada domain lokal yang terdaftar di Apache virtual hosts.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {virtualHosts.map(vh => {
              const isLaravelHost = !vh.is_node && (vh.document_root.toLowerCase().endsWith("/public") || vh.document_root.toLowerCase().endsWith("\\public"));
              return (
                <div 
                  key={vh.domain}
                  className="p-5 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex flex-col justify-between space-y-4 shadow-xl hover:border-zinc-700 transition"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded border font-mono ${
                        vh.is_node 
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" 
                          : isLaravelHost 
                            ? "bg-red-500/15 text-red-400 border-red-500/30" 
                            : "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
                      }`}>
                        {vh.is_node ? `NODE (PORT ${vh.node_port})` : isLaravelHost ? "LARAVEL" : "PHP / STATIC"}
                      </span>
                      {vh.has_ssl && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-mono flex items-center gap-1">
                          🔒 SSL
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-black font-mono select-text break-all">{vh.domain}</h4>
                    <p className="text-[11px] text-zinc-400 font-mono truncate" title={vh.document_root}>
                      Root: {vh.document_root || "Proxy Server"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleLaunchHost(vh.domain, vh.has_ssl)}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-550 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-md"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Buka</span>
                    </button>
                    <button
                      onClick={() => handleStartEdit(vh)}
                      className="py-2 px-3 bg-zinc-800 hover:bg-zinc-700 hover:text-white text-zinc-300 rounded-xl text-xs font-bold transition flex items-center justify-center cursor-pointer shadow-md shrink-0"
                      title="Edit Host"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteHost(vh.domain)}
                      className="py-2 px-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center cursor-pointer shadow-md shrink-0"
                      title="Hapus Host"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
