import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { RefreshCw, Plus, Play, X, Edit, Check, FolderPlus, Sparkles, Terminal, Copy, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
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

  // Terminal log modal states
  const [showTerminalModal, setShowTerminalModal] = useState<boolean>(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [terminalStatus, setTerminalStatus] = useState<"running" | "success" | "error">("running");
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showTerminalModal) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalLogs, showTerminalModal]);

  const handleProjectNameChange = (name: string) => {
    setProjectName(name);
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

    setTerminalLogs([`[ENVKU] Memulai inisialisasi pembuatan proyek Laravel...`]);
    setTerminalStatus("running");
    setShowTerminalModal(true);

    let unlisten: (() => void) | undefined;

    try {
      unlisten = await listen<string>("laravel_creation_log", (event) => {
        setTerminalLogs((prev) => [...prev, event.payload]);
      });

      const res = await invoke<string>("create_laravel_project", {
        projectName: projectName.trim(),
        domain: projectDomain.trim(),
        parentDir: parentPath.trim(),
        enableSsl: enableSsl,
      });

      setTerminalStatus("success");
      showToastMsg(res, "success");
      setProjectName("");
      setProjectDomain("");
      setParentPath("");
      setEnableSsl(false);
      fetchVirtualHosts();
    } catch (err) {
      setTerminalStatus("error");
      showToastMsg(formatFriendlyError(err), "error");
    } finally {
      if (unlisten) unlisten();
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
    <div className="space-y-6 animate-fade-in text-[#18181b]">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-[#09090b]">Project Wizard (DNS & VHost)</h2>
          <p className="text-xs sm:text-sm text-[#52525b] mt-1 font-semibold">
            Buat proyek Laravel baru versi terbaru via Composer atau daftarkan folder proyek lokal Anda secara instan.
          </p>
        </div>

        {/* Wizard Mode Tabs */}
        <div className="flex flex-wrap gap-2 p-1.5 bg-[#eae6df] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] shrink-0">
          <button
            type="button"
            onClick={() => {
              setWizardMode("register");
              handleCancelEdit();
            }}
            className={`px-3.5 py-2 text-xs font-black transition flex items-center justify-center space-x-2 cursor-pointer border-2 border-[#09090b] ${
              wizardMode === "register"
                ? "bg-[#fde047] text-[#09090b] shadow-[2px_2px_0px_0px_#09090b]"
                : "bg-[#ffffff] text-[#18181b] hover:bg-[#7dd3fc]"
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
            className={`px-3.5 py-2 text-xs font-black transition flex items-center justify-center space-x-2 cursor-pointer border-2 border-[#09090b] ${
              wizardMode === "create_laravel"
                ? "bg-[#fecaca] text-[#7f1d1d] shadow-[2px_2px_0px_0px_#09090b]"
                : "bg-[#ffffff] text-[#18181b] hover:bg-[#fecaca]"
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0 text-[#7f1d1d]" />
            <span>Buat Laravel Baru (Composer)</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmitProject} className="p-5 sm:p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] space-y-5">
        {wizardMode === "register" ? (
          <>
            {/* Preset Selection */}
            <div className="space-y-2">
              <label className="text-xs font-black text-[#09090b] uppercase tracking-widest block">Tipe / Preset Proyek</label>
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
                  className={`py-3 px-3 text-xs font-black transition flex items-center justify-center space-x-2 border-2.5 border-[#09090b] cursor-pointer ${
                    projectType === "laravel" && !isNodeProject
                      ? "bg-[#fecaca] text-[#7f1d1d] shadow-[3px_3px_0px_0px_#09090b]"
                      : "bg-[#fffefb] text-[#18181b] hover:bg-[#eae6df]"
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
                  className={`py-3 px-3 text-xs font-black transition flex items-center justify-center space-x-2 border-2.5 border-[#09090b] cursor-pointer ${
                    projectType === "php" && !isNodeProject
                      ? "bg-[#7dd3fc] text-[#09090b] shadow-[3px_3px_0px_0px_#09090b]"
                      : "bg-[#fffefb] text-[#18181b] hover:bg-[#eae6df]"
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
                  className={`py-3 px-3 text-xs font-black transition flex items-center justify-center space-x-2 border-2.5 border-[#09090b] cursor-pointer ${
                    isNodeProject
                      ? "bg-[#bbf7d0] text-[#14532d] shadow-[3px_3px_0px_0px_#09090b]"
                      : "bg-[#fffefb] text-[#18181b] hover:bg-[#eae6df]"
                  }`}
                >
                  <span>⚡ Node.js Reverse Proxy</span>
                </button>
              </div>
              {projectType === "laravel" && !isNodeProject && (
                <p className="text-[11px] text-[#7f1d1d] pt-1 font-bold">
                  ✨ Preset Laravel: Menautkan DocumentRoot ke folder <code className="font-mono bg-[#fecaca] px-1 py-0.5 border border-[#09090b] text-[#7f1d1d]">/public</code> dan mengaktifkan mod_rewrite secara otomatis.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-black text-[#09090b] uppercase tracking-widest block">Nama Proyek</label>
                <input 
                  type="text"
                  placeholder="Contoh: Toko Online"
                  value={projectName}
                  onChange={(e) => handleProjectNameChange(e.target.value)}
                  className="w-full bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] px-4 py-2.5 text-xs font-bold text-[#18181b] outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-[#09090b] uppercase tracking-widest block">Domain Lokal</label>
                <input 
                  type="text"
                  placeholder="Contoh: toko.test"
                  value={projectDomain}
                  onChange={(e) => setProjectDomain(e.target.value)}
                  className="w-full bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] px-4 py-2.5 text-xs text-[#09090b] outline-none font-mono font-black"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-[#09090b] uppercase tracking-widest block">Folder Proyek (Rekomendasi Drive D:)</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="text"
                  placeholder={projectType === "laravel" ? "Contoh: D:\\projects\\toko\\public" : "Contoh: D:\\projects\\toko"}
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  className="flex-1 bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] px-4 py-2.5 text-xs text-[#18181b] outline-none font-mono font-semibold"
                />
                <button
                  type="button"
                  onClick={() => handleSelectFolder(false)}
                  className="py-2.5 px-4 bg-[#ffffff] text-[#18181b] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] text-xs font-black uppercase tracking-wider transition cursor-pointer shrink-0"
                >
                  Pilih Folder...
                </button>
              </div>
            </div>

            {/* Node Proxy settings option */}
            {isNodeProject && (
              <div className="p-4 bg-[#fffefb] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] space-y-4 animate-fade-in">
                <div className="flex items-center space-x-3.5">
                  <span className="text-xs text-[#09090b] shrink-0 font-black uppercase">Port Server Node:</span>
                  <input 
                    type="number"
                    min="1"
                    max="65535"
                    value={nodePort}
                    onChange={(e) => setNodePort(parseInt(e.target.value) || 3000)}
                    className="w-32 bg-[#ffffff] border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] px-3 py-1.5 text-xs text-[#09090b] outline-none font-mono font-bold"
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          /* Mode: Create New Laravel Project via Composer */
          <div className="space-y-5 animate-fade-in">
            <div className="p-4 bg-[#fef08a] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b]">
              <div className="flex items-start space-x-3">
                <Sparkles className="w-5 h-5 text-[#713f12] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-[#713f12] uppercase">Generator Proyek Laravel Resmi Terbaru</h4>
                  <p className="text-xs text-[#713f12] leading-relaxed font-semibold">
                    Envku akan menjalankan <code className="font-mono bg-[#ffffff] px-1 py-0.5 border border-[#09090b] text-[#09090b]">composer create-project laravel/laravel</code> secara otomatis menggunakan versi PHP aktif & Composer lokal, mengatur DocumentRoot ke <code className="font-mono bg-[#ffffff] px-1 py-0.5 border border-[#09090b] text-[#09090b]">/public</code>, mendaftarkan VirtualHost Apache, serta menambahkan DNS <code className="font-mono bg-[#ffffff] px-1 py-0.5 border border-[#09090b] text-[#09090b]">.test</code> ke hosts file.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-black text-[#09090b] uppercase tracking-widest block">Nama Proyek Laravel</label>
                <input 
                  type="text"
                  placeholder="Contoh: toko-online"
                  value={projectName}
                  onChange={(e) => handleProjectNameChange(e.target.value)}
                  className="w-full bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] px-4 py-2.5 text-xs font-bold text-[#18181b] outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-[#09090b] uppercase tracking-widest block">Domain Lokal (.test)</label>
                <input 
                  type="text"
                  placeholder="Contoh: toko-online.test"
                  value={projectDomain}
                  onChange={(e) => setProjectDomain(e.target.value)}
                  className="w-full bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] px-4 py-2.5 text-xs text-[#7f1d1d] outline-none font-mono font-black"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-[#09090b] uppercase tracking-widest block">Folder Induk (Tempat Proyek Dibuat)</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="text"
                  placeholder="Contoh: D:\projects (akan dibuat folder D:\projects\toko-online)"
                  value={parentPath}
                  onChange={(e) => setParentPath(e.target.value)}
                  className="flex-1 bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] px-4 py-2.5 text-xs text-[#18181b] outline-none font-mono font-semibold"
                />
                <button
                  type="button"
                  onClick={() => handleSelectFolder(true)}
                  className="py-2.5 px-4 bg-[#ffffff] text-[#18181b] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] text-xs font-black uppercase tracking-wider transition cursor-pointer shrink-0"
                >
                  Pilih Folder Induk...
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SSL / HTTPS option */}
        <div className="p-4 bg-[#fffefb] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-black text-[#09090b] block uppercase">Aktifkan SSL (HTTPS)</span>
              <span className="text-xs text-[#52525b] block font-medium">Buat sertifikat SSL self-signed lokal dan daftarkan ke trust store {isLinux ? "Linux" : "Windows"}.</span>
            </div>
            <input 
              type="checkbox"
              checked={enableSsl}
              onChange={(e) => setEnableSsl(e.target.checked)}
              className="h-5 w-5 bg-[#ffffff] border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] cursor-pointer shrink-0"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 px-4 text-[#09090b] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#09090b] text-xs font-black transition flex items-center justify-center space-x-2 cursor-pointer uppercase ${
              wizardMode === "create_laravel"
                ? "bg-[#fecaca] hover:bg-[#fca5a5] text-[#7f1d1d]"
                : "bg-[#fde047] hover:bg-[#fef08a]"
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
                <Sparkles className="w-4 h-4 shrink-0 text-[#7f1d1d]" />
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
              className="py-3.5 px-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] text-[#18181b] hover:bg-[#eae6df] text-xs font-black transition cursor-pointer shrink-0 uppercase"
            >
              Batal
            </button>
          )}
        </div>
      </form>

      {/* ─── INLINE LOG TERMINAL CONSOLE BOX ─── */}
      {showTerminalModal && (
        <div className="border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] bg-[#ffffff] rounded-[6px] overflow-hidden animate-fade-in my-3">
          {/* Header Bar */}
          <div className="bg-[#eae6df] border-b-3 border-[#09090b] px-4 py-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-[#09090b]" />
              <span className="font-black text-xs sm:text-sm uppercase text-[#09090b] tracking-wider">
                LOG TERMINAL ENVKU - PEMBUATAN LARAVEL
              </span>
            </div>
            <div className="flex items-center gap-2">
              {terminalStatus === "running" && (
                <span className="px-2.5 py-1 text-[11px] font-black uppercase bg-[#bbf7d0] text-[#14532d] border border-[#09090b] rounded-[6px] flex items-center gap-1.5 animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> BERJALAN
                </span>
              )}
              {terminalStatus === "success" && (
                <span className="px-2.5 py-1 text-[11px] font-black uppercase bg-[#bbf7d0] text-[#14532d] border border-[#09090b] rounded-[6px] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> SELESAI
                </span>
              )}
              {terminalStatus === "error" && (
                <span className="px-2.5 py-1 text-[11px] font-black uppercase bg-[#fecaca] text-[#7f1d1d] border border-[#09090b] rounded-[6px] flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> GAGAL
                </span>
              )}
              {terminalStatus !== "running" && (
                <button
                  type="button"
                  onClick={() => setShowTerminalModal(false)}
                  className="p-1 hover:bg-[#fffefb] border border-[#09090b] rounded-[6px] cursor-pointer"
                  title="Tutup Log Terminal"
                >
                  <X className="w-4 h-4 text-[#09090b]" />
                </button>
              )}
            </div>
          </div>

          {/* Log Output Console */}
          <div className="bg-[#18181b] p-4 font-mono text-xs overflow-y-auto max-h-[360px] flex flex-col gap-1 text-[#f4f4f5] select-text">
            {terminalLogs.length === 0 ? (
              <div className="text-[#a1a1aa] italic">Menunggu proses Composer dimulai...</div>
            ) : (
              terminalLogs.map((log, index) => {
                const cleanLog = log
                  .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
                  .replace(/\[[0-9;]+m/g, "")
                  .replace(/\[[0-9;]+[a-zA-Z]/g, "");

                let textColor = "text-[#f4f4f5]";
                if (cleanLog.startsWith("🚀") || cleanLog.startsWith("📂") || cleanLog.startsWith("⚙️")) textColor = "text-[#7dd3fc]";
                else if (cleanLog.startsWith("📦") || cleanLog.startsWith("🌐")) textColor = "text-[#fde047]";
                else if (cleanLog.startsWith("✅") || cleanLog.startsWith("🎉") || cleanLog.includes("DONE")) textColor = "text-[#4ade80]";
                else if (cleanLog.startsWith("❌") || cleanLog.toLowerCase().includes("error") || cleanLog.toLowerCase().includes("failed")) textColor = "text-[#f87171]";

                return (
                  <div key={index} className={`whitespace-pre-wrap break-all ${textColor}`}>
                    {cleanLog}
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>

          {/* Footer Bar */}
          <div className="bg-[#fffefb] border-t-3 border-[#09090b] p-3 flex items-center justify-between flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(terminalLogs.join("\n"));
                setCopiedLogs(true);
                setTimeout(() => setCopiedLogs(false), 2000);
              }}
              className="px-3 py-1.5 text-xs font-bold uppercase bg-[#ffffff] hover:bg-[#f4f1ea] border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] rounded-[6px] flex items-center gap-1.5 cursor-pointer active:translate-x-[1px] active:translate-y-[1px]"
            >
              {copiedLogs ? <Check className="w-3.5 h-3.5 text-[#14532d]" /> : <Copy className="w-3.5 h-3.5 text-[#09090b]" />}
              {copiedLogs ? "TERSALIN!" : "SALIN LOG"}
            </button>

            <div className="flex items-center gap-2">
              {terminalStatus === "running" ? (
                <span className="text-xs font-semibold text-[#52525b] italic">
                  Composer sedang mengunduh dependensi... Anda bebas berpindah tab!
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTerminalModal(false)}
                  className="px-4 py-1.5 text-xs font-black uppercase bg-[#fde047] hover:bg-[#fef08a] border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] rounded-[6px] cursor-pointer active:translate-x-[1px] active:translate-y-[1px]"
                >
                  TUTUP TERMINAL LOG
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active Hosts List */}
      <div className="space-y-4 pt-4">
        <h3 className="text-xs font-black text-[#09090b] uppercase tracking-widest">Daftar Host Lokal Aktif</h3>
        {virtualHosts.length === 0 ? (
          <div className="p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] text-center text-[#52525b] font-mono text-xs font-semibold">
            Belum ada domain lokal yang terdaftar di Apache virtual hosts.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {virtualHosts.map(vh => {
              const isLaravelHost = !vh.is_node && (vh.document_root.toLowerCase().endsWith("/public") || vh.document_root.toLowerCase().endsWith("\\public"));
              return (
                <div 
                  key={vh.domain}
                  className="p-5 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className={`text-[10px] font-black px-2 py-0.5 border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] font-mono ${
                        vh.is_node 
                          ? "bg-[#bbf7d0] text-[#14532d]" 
                          : isLaravelHost 
                            ? "bg-[#fecaca] text-[#7f1d1d]" 
                            : "bg-[#7dd3fc] text-[#09090b]"
                      }`}>
                        {vh.is_node ? `NODE (PORT ${vh.node_port})` : isLaravelHost ? "LARAVEL" : "PHP / STATIC"}
                      </span>
                      {vh.has_ssl && (
                        <span className="text-[10px] font-black px-2 py-0.5 bg-[#bbf7d0] text-[#14532d] border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] font-mono flex items-center gap-1">
                          🔒 SSL
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-black font-mono select-text break-all text-[#09090b]">{vh.domain}</h4>
                    <p className="text-[11px] text-[#52525b] font-mono truncate font-semibold" title={vh.document_root}>
                      Root: {vh.document_root || "Proxy Server"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleLaunchHost(vh.domain, vh.has_ssl)}
                      className="flex-1 py-2 bg-[#fde047] text-[#09090b] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#fef08a] text-xs font-black transition flex items-center justify-center space-x-1.5 cursor-pointer uppercase"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Buka</span>
                    </button>
                    <button
                      onClick={() => handleStartEdit(vh)}
                      className="py-2 px-3 bg-[#ffffff] text-[#18181b] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] text-xs font-black transition flex items-center justify-center cursor-pointer shrink-0"
                      title="Edit Host"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteHost(vh.domain)}
                      className="py-2 px-3 bg-[#fecaca] text-[#7f1d1d] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#fca5a5] text-xs font-black transition flex items-center justify-center cursor-pointer shrink-0"
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
