import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { 
  Folder, 
  FolderCheck, 
  CheckCircle2, 
  ShieldAlert, 
  RefreshCw, 
  Terminal, 
  X,
  Download,
  Activity,
  Plus,
  Layers,
  Code,
  Globe,
  Play,
  Square,
  AlertTriangle,
  Loader2
} from "lucide-react";
import "./App.css";
import envkuLogo from "./assets/envku-logo.svg";

// Interface definitions
interface ProgressPayload {
  component_id: string;
  percentage: number;
  bytes_downloaded: number;
  bytes_total: number;
}

interface ComponentStatus {
  id: string;
  name: string;
  description: string;
  installedPath: string;
}

interface VirtualHostInfo {
  domain: string;
  document_root: string;
  is_node: boolean;
  node_port: number | null;
}

export default function App() {
  // Check if this window instance is the splashscreen
  const isSplash = typeof window !== "undefined" && window.location.search.includes("splash=true");

  // Navigation
  const [activeTab, setActiveTab] = useState<"dashboard" | "downloader" | "services" | "wizard" | "php" | "node">("dashboard");

  // Splash screen state
  const [appReady, setAppReady] = useState<boolean>(false);

  // Make body background transparent on splashscreen window
  useEffect(() => {
    if (isSplash) {
      document.body.style.backgroundColor = "transparent";
      document.body.style.backgroundImage = "none";
    }
  }, [isSplash]);

  // Per-action loading states
  const [dirsLoading, setDirsLoading] = useState<boolean>(true);
  const [switchingPhp, setSwitchingPhp] = useState<string | null>(null);
  const [installingNvm, setInstallingNvm] = useState<boolean>(false);
  const [switchingNode, setSwitchingNode] = useState<boolean>(false);
  const [installingNode, setInstallingNode] = useState<boolean>(false);
  const [quickInstallingNode, setQuickInstallingNode] = useState<string | null>(null);

  // Global State
  const [loading, setLoading] = useState<boolean>(false);
  const [toast, setToast] = useState<{ show: boolean; type: "success" | "error"; message: string }>({
    show: false,
    type: "success",
    message: ""
  });

  // Modul 0 State (Dir check)
  const [dirsStatus, setDirsStatus] = useState<{ [key: string]: boolean }>({
    "C:\\server": false,
    "C:\\server\\www": false,
    "C:\\server\\Apache24": false,
    "C:\\server\\php83": false,
    "C:\\server\\php82": false,
    "C:\\server\\mysql": false,
    "C:\\server\\www\\phpmyadmin": false
  });

  // Modul 1 State (Downloader)
  const [downloadProgress, setDownloadProgress] = useState<{
    [key: string]: { percentage: number; bytes_downloaded: number; bytes_total: number }
  }>({});
  const [activeDownloads, setActiveDownloads] = useState<string[]>([]);

  // Modul 2 State (Services)
  const [services, setServices] = useState<{
    Apache: { installed: boolean; running: boolean; checking: boolean };
    MySQL: { installed: boolean; running: boolean; checking: boolean };
  }>({
    Apache: { installed: false, running: false, checking: true },
    MySQL: { installed: false, running: false, checking: true }
  });

  // Modul 3 State (Project Wizard)
  const [projectName, setProjectName] = useState<string>("");
  const [projectDomain, setProjectDomain] = useState<string>("");
  const [projectPath, setProjectPath] = useState<string>("");
  const [isNodeProject, setIsNodeProject] = useState<boolean>(false);
  const [nodePort, setNodePort] = useState<number>(3000);
  const [virtualHosts, setVirtualHosts] = useState<VirtualHostInfo[]>([]);

  // Modul 4 State (PHP Switcher)
  const [activePhpVersion, setActivePhpVersion] = useState<string>("unknown");

  // Modul 5 State (NVM / Node)
  const [nvmVersions, setNvmVersions] = useState<string[]>([]);
  const [selectedNodeVersion, setSelectedNodeVersion] = useState<string>("");
  const [nodeDropdownOpen, setNodeDropdownOpen] = useState<boolean>(false);
  const [nodeVersionToInstall, setNodeVersionToInstall] = useState<string>("");
  const [nvmInstalled, setNvmInstalled] = useState<boolean>(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [hostToDelete, setHostToDelete] = useState<string>("");

  const showToastMsg = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 6000);
  };

  // Check Directories
  const checkDirectories = async () => {
    const pathsToCheck = [
      "C:\\server",
      "C:\\server\\www",
      "C:\\server\\Apache24",
      "C:\\server\\php83",
      "C:\\server\\php82",
      "C:\\server\\mysql",
      "C:\\server\\www\\phpmyadmin"
    ];
    setDirsLoading(true);
    try {
      await invoke("check_and_init_environment");
      const results = await invoke<{ [key: string]: boolean }>("check_directories_exist", { paths: pathsToCheck });
      setDirsStatus(results);
    } catch (err) {
      console.warn("Gagal memeriksa direktori:", err);
    } finally {
      setDirsLoading(false);
    }
  };

  // Poll service ports & check registration status
  const updateServiceStates = async () => {
    try {
      const apacheInstalled = await invoke<boolean>("check_service_installed", { service: "Apache2.4" });
      const mysqlInstalled = await invoke<boolean>("check_service_installed", { service: "MySQL-Kustom" });

      const apacheRunning = await invoke<boolean>("ping_port", { port: 80 });
      const mysqlRunning = await invoke<boolean>("ping_port", { port: 3306 });

      setServices({
        Apache: { installed: apacheInstalled, running: apacheRunning, checking: false },
        MySQL: { installed: mysqlInstalled, running: mysqlRunning, checking: false }
      });
    } catch (err) {
      console.warn("Gagal memperbarui status layanan:", err);
    }
  };

  // Run Service control (Start/Stop)
  const toggleService = async (serviceKey: "Apache" | "MySQL") => {
    const currentStatus = services[serviceKey];
    const serviceWinName = serviceKey === "Apache" ? "Apache2.4" : "MySQL-Kustom";
    const action = currentStatus.running ? "stop" : "start";

    setServices(prev => ({
      ...prev,
      [serviceKey]: { ...prev[serviceKey], checking: true }
    }));
    setLoading(true);

    try {
      const res = await invoke<string>("control_service", { service: serviceWinName, action });
      showToastMsg(res, "success");
    } catch (err) {
      showToastMsg(String(err), "error");
    } finally {
      setLoading(false);
      updateServiceStates();
    }
  };

  // Install Windows Service
  const handleInstallService = async (serviceWinName: string, serviceKey: "Apache" | "MySQL") => {
    setServices(prev => ({
      ...prev,
      [serviceKey]: { ...prev[serviceKey], checking: true }
    }));
    setLoading(true);
    try {
      const res = await invoke<string>("install_service", { service: serviceWinName });
      showToastMsg(res, "success");
    } catch (err) {
      showToastMsg(String(err), "error");
    } finally {
      setLoading(false);
      updateServiceStates();
    }
  };

  // Trigger Download & Extract
  const startDownload = async (componentId: string) => {
    if (activeDownloads.includes(componentId)) return;
    
    setActiveDownloads(prev => [...prev, componentId]);
    setDownloadProgress(prev => ({
      ...prev,
      [componentId]: { percentage: 0, bytes_downloaded: 0, bytes_total: 0 }
    }));

    try {
      const res = await invoke<string>("download_and_extract", { componentId });
      showToastMsg(res, "success");
      checkDirectories();
      updateServiceStates();
      fetchVirtualHosts();
    } catch (err) {
      showToastMsg(String(err), "error");
    } finally {
      setActiveDownloads(prev => prev.filter(id => id !== componentId));
    }
  };

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

  // Switch PHP Version
  const handleSwitchPhp = async (versionId: string) => {
    setSwitchingPhp(versionId);
    try {
      const res = await invoke<string>("switch_php_version", { versionId });
      showToastMsg(res, "success");
      setActivePhpVersion(versionId);
    } catch (err) {
      showToastMsg(String(err), "error");
    } finally {
      setSwitchingPhp(null);
      updateServiceStates();
    }
  };

  // Fetch NVM versions
  const fetchNvm = async () => {
    try {
      const versions = await invoke<string[]>("get_nvm_versions");
      setNvmVersions(versions);
      setNvmInstalled(true);
      if (versions.length > 0 && !selectedNodeVersion) {
        setSelectedNodeVersion(versions[0]);
      }
    } catch (err) {
      console.warn("Failed fetching NVM versions", err);
      setNvmInstalled(false);
    }
  };

  // Install NVM (Node Version Manager)
  const handleInstallNvm = async () => {
    setInstallingNvm(true);
    try {
      const res = await invoke<string>("install_nvm");
      showToastMsg(res, "success");
      await fetchNvm();
    } catch (err) {
      showToastMsg(String(err), "error");
    } finally {
      setInstallingNvm(false);
    }
  };

  // Switch Node.js NVM version
  const handleSwitchNode = async () => {
    if (!selectedNodeVersion) return;
    setSwitchingNode(true);
    try {
      const res = await invoke<string>("switch_node_version", { version: selectedNodeVersion });
      showToastMsg(res, "success");
    } catch (err) {
      showToastMsg(String(err), "error");
    } finally {
      setSwitchingNode(false);
    }
  };

  // Install Node.js version via NVM
  const handleInstallNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeVersionToInstall.trim()) {
      showToastMsg("Masukkan versi Node.js yang ingin diunduh!", "error");
      return;
    }
    setInstallingNode(true);
    try {
      const res = await invoke<string>("install_node_version", { version: nodeVersionToInstall.trim() });
      showToastMsg(res, "success");
      setNodeVersionToInstall("");
      fetchNvm();
    } catch (err) {
      showToastMsg(String(err), "error");
    } finally {
      setInstallingNode(false);
    }
  };

  // Quick install specific Node.js LTS version
  const handleQuickInstallNode = async (version: string) => {
    setQuickInstallingNode(version);
    try {
      const res = await invoke<string>("install_node_version", { version });
      showToastMsg(res, "success");
      fetchNvm();
    } catch (err) {
      showToastMsg(String(err), "error");
    } finally {
      setQuickInstallingNode(null);
    }
  };

  // Fetch active PHP version configured in Apache
  const fetchActivePhpVersion = async () => {
    try {
      const active = await invoke<string>("get_active_php_version");
      setActivePhpVersion(active);
    } catch (err) {
      console.warn("Gagal mendeteksi versi PHP aktif:", err);
    }
  };

  // Fetch virtual hosts list
  const fetchVirtualHosts = async () => {
    try {
      const hosts = await invoke<VirtualHostInfo[]>("get_virtual_hosts");
      setVirtualHosts(hosts);
    } catch (err) {
      console.warn("Gagal mendeteksi virtual hosts:", err);
    }
  };

  // Launch virtual host in browser
  const handleLaunchHost = async (domain: string) => {
    try {
      await invoke("open_in_browser", { url: `http://${domain}` });
    } catch (err) {
      showToastMsg(String(err), "error");
    }
  };

  // Delete virtual host
  const handleDeleteHost = (domain: string) => {
    setHostToDelete(domain);
    setDeleteConfirmOpen(true);
  };

  // Confirm and proceed with host deletion
  const confirmDeleteHost = async () => {
    if (!hostToDelete) return;
    setDeleteConfirmOpen(false);
    setLoading(true);
    try {
      const res = await invoke<string>("delete_project", { domain: hostToDelete });
      showToastMsg(res, "success");
      fetchVirtualHosts();
    } catch (err) {
      showToastMsg(String(err), "error");
    } finally {
      setLoading(false);
      setHostToDelete("");
    }
  };

  // Run initialization
  useEffect(() => {
    if (isSplash) return;

    const initApp = async () => {
      // Run all init calls in parallel
      await Promise.allSettled([
        checkDirectories(),
        updateServiceStates(),
        fetchNvm(),
        fetchActivePhpVersion(),
        fetchVirtualHosts(),
      ]);

      // Minimum splash display time of 1.8s for better UX
      await new Promise(resolve => setTimeout(resolve, 1800));

      // Trigger main UI mounting
      setAppReady(true);

      // Give React a split second to mount the main UI
      await new Promise(resolve => setTimeout(resolve, 50));

      try {
        await invoke("close_splashscreen");
      } catch (err) {
        console.error("Failed to close splash screen:", err);
      }

      // Check for application updates
      try {
        const update = await check();
        if (update && update.available) {
          const yes = await ask(
            `Versi baru (${update.version}) telah tersedia!\n\nApakah Anda ingin mengunduh dan melakukan pembaruan sekarang?`,
            { title: "Update Tersedia", kind: "info" }
          );
          if (yes) {
            await update.downloadAndInstall();
            await relaunch();
          }
        }
      } catch (err) {
        console.error("Gagal melakukan pengecekan update:", err);
      }
    };

    initApp();

    // Listen to download progress events from Rust
    let unlistenProgress: (() => void) | undefined;
    const registerListener = async () => {
      unlistenProgress = await listen<ProgressPayload>("download_progress", (event) => {
        const { component_id, percentage, bytes_downloaded, bytes_total } = event.payload;
        setDownloadProgress(prev => ({
          ...prev,
          [component_id]: { percentage, bytes_downloaded, bytes_total }
        }));
      });
    };

    registerListener();

    // Poll services status every 5 seconds
    const interval = setInterval(updateServiceStates, 5000);

    return () => {
      clearInterval(interval);
      if (unlistenProgress) unlistenProgress();
    };
  }, [isSplash]);

  const componentsList: ComponentStatus[] = [
    { id: "apache", name: "Apache Web Server", description: "Biner utama HTTP server v2.4 Windows VS17.", installedPath: "C:\\server\\Apache24" },
    { id: "php83", name: "PHP 8.3 Engine", description: "PHP 8.3 x64 Thread Safe (TS) untuk modul Apache.", installedPath: "C:\\server\\php83" },
    { id: "php82", name: "PHP 8.2 Engine", description: "PHP 8.2 x64 Thread Safe (TS) versi stabil warisan.", installedPath: "C:\\server\\php82" },
    { id: "mysql", name: "MySQL Database Server", description: "Engine database relasional kustom v8.0.", installedPath: "C:\\server\\mysql" },
    { id: "phpmyadmin", name: "phpMyAdmin Interface", description: "Pengelola MySQL berbasis web di localhost.", installedPath: "C:\\server\\www\\phpmyadmin" }
  ];

  if (isSplash) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-transparent select-none font-sans overflow-hidden">
        {/* Centered Brutalist Panel */}
        <div 
          className="w-[360px] p-8 flex flex-col items-center gap-6 bg-[#16171d] border-[4px] border-black shadow-[8px_8px_0px_#000000] relative overflow-hidden"
          style={{ animation: "splashFadeUp 0.6s ease-out both" }}
        >
          {/* Brutalist Header bar */}
          <div className="w-[calc(100%+64px)] flex items-center justify-between border-b-[3px] border-black bg-[#FFE600] px-4 py-2 -mt-8 -mx-8">
            <span className="text-[10px] font-black text-black tracking-widest font-mono">ENVKU - INITIALIZING</span>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-black bg-white" />
              <span className="w-3 h-3 border-2 border-black bg-black" />
            </div>
          </div>

          {/* Logo box */}
          <div className="p-3 border-[3px] border-black bg-[#FFE600] shadow-[4px_4px_0px_#000000] mt-2">
            <img src={envkuLogo} alt="Envku" className="w-[56px] h-[56px]" />
          </div>

          {/* Brand text */}
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-wider text-white uppercase" style={{ textShadow: "2px 2px 0px #000" }}>
              Envku
            </h1>
            <span className="text-[9px] font-bold tracking-[0.35em] text-[#38BDF8] block font-mono mt-1" style={{ textShadow: "1px 1px 0px #000" }}>
              ORCHESTRATOR
            </span>
          </div>

          {/* Loading Indicator bar */}
          <div className="w-full flex flex-col items-center gap-4 mt-2">
            <div className="w-full h-4 border-[3px] border-black bg-black overflow-hidden relative">
              <div 
                className="h-full bg-[#FFE600] border-r-[3px] border-black transition-all duration-300"
                style={{ 
                  width: "100%",
                  background: "repeating-linear-gradient(45deg, #FFE600, #FFE600 10px, #e2cb00 10px, #e2cb00 20px)",
                  animation: "splashShimmer 2s linear infinite",
                  backgroundSize: "40px 40px"
                }} 
              />
            </div>

            {/* Status and Version Info */}
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-[11px] font-mono font-bold text-[#34D399] tracking-wider animate-pulse uppercase">
                {">> "}MEMPERSIAPKAN LINGKUNGAN...
              </p>
              <span className="text-[9px] font-mono text-zinc-500 font-bold uppercase">VERSION v1.1.0</span>
            </div>
          </div>

        </div>
      </div>
    );
  }

  if (!appReady) {
    return <div className="h-screen w-screen bg-[#0c0d10] bg-grid-glow" />;
  }

  return (
    <div className="relative h-screen w-screen flex bg-grid-glow overflow-hidden select-none font-sans text-zinc-100">
      
      {/* Sidebar Navigation */}
      <aside className="w-[240px] border-r border-zinc-800 bg-zinc-950/80 backdrop-blur-2xl flex flex-col justify-between p-6 z-20 shrink-0">
        <div className="space-y-8">
          
          {/* Brand header */}
          <div className="flex items-center space-x-3.5 px-2">
            <div className="p-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
              <img src={envkuLogo} alt="Envku Logo" className="w-7 h-7 rounded-lg object-contain shadow-md shadow-indigo-500/15" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-white tracking-wide uppercase">Envku</h1>
              <span className="text-xs text-zinc-500 font-mono tracking-widest block mt-0.5">ORCHESTRATOR</span>
            </div>
          </div>

          {/* Navigation Tab Links */}
          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
                activeTab === "dashboard" 
                  ? "bg-zinc-800/90 text-white font-bold border border-zinc-700/60 shadow-lg shadow-black/35" 
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
              }`}
            >
              <Activity className="w-5 h-5 shrink-0" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab("downloader")}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
                activeTab === "downloader" 
                  ? "bg-zinc-800/90 text-white font-bold border border-zinc-700/60 shadow-lg shadow-black/35" 
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
              }`}
            >
              <Download className="w-5 h-5 shrink-0" />
              <span>Downloader</span>
            </button>

            <button
              onClick={() => setActiveTab("services")}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
                activeTab === "services" 
                  ? "bg-zinc-800/90 text-white font-bold border border-zinc-700/60 shadow-lg shadow-black/35" 
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
              }`}
            >
              <Layers className="w-5 h-5 shrink-0" />
              <span>Service Panel</span>
            </button>

            <button
              onClick={() => setActiveTab("wizard")}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
                activeTab === "wizard" 
                  ? "bg-zinc-800/90 text-white font-bold border border-zinc-700/60 shadow-lg shadow-black/35" 
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
              }`}
            >
              <Plus className="w-5 h-5 shrink-0" />
              <span>Project Wizard</span>
            </button>

            <button
              onClick={() => setActiveTab("php")}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
                activeTab === "php" 
                  ? "bg-zinc-800/90 text-white font-bold border border-zinc-700/60 shadow-lg shadow-black/35" 
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
              }`}
            >
              <Code className="w-5 h-5 shrink-0" />
              <span>PHP Switcher</span>
            </button>

            <button
              onClick={() => setActiveTab("node")}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
                activeTab === "node" 
                  ? "bg-zinc-800/90 text-white font-bold border border-zinc-700/60 shadow-lg shadow-black/35" 
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
              }`}
            >
              <Globe className="w-5 h-5 shrink-0" />
              <span>Node.js / NVM</span>
            </button>
          </nav>
        </div>

        {/* Footer info */}
        <div className="border-t border-zinc-800/60 pt-4 text-xs text-zinc-500 font-mono flex items-center justify-between">
          <span>Admin Elevated</span>
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="flex-1 bg-transparent p-8 overflow-y-auto flex flex-col justify-between relative z-10">
        
        {/* Content View Container */}
        <div className="flex-1 max-w-3xl w-full mx-auto space-y-8">

          {/* TAB 1: DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Status Lingkungan</h2>
                  <p className="text-sm text-zinc-400 mt-1">Verifikasi integritas direktori sistem server Anda secara real-time.</p>
                </div>
                <button
                  onClick={checkDirectories}
                  className="flex items-center space-x-2 py-2 px-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/30 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Segarkan</span>
                </button>
              </div>

              {/* Status Directories Cards Grid */}
              <div className="grid grid-cols-2 gap-5">
                {dirsLoading
                  ? Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="p-5 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex items-center justify-between shadow-xl">
                        <div className="flex items-center space-x-4">
                          <div className="p-3 rounded-xl bg-zinc-800/60 animate-pulse">
                            <div className="w-6 h-6 rounded bg-zinc-700" />
                          </div>
                          <div className="space-y-2">
                            <div className="h-3.5 w-24 bg-zinc-700 rounded animate-pulse" />
                            <div className="h-2.5 w-36 bg-zinc-800 rounded animate-pulse" />
                          </div>
                        </div>
                        <div className="h-6 w-16 bg-zinc-800 rounded-full animate-pulse" />
                      </div>
                    ))
                  : Object.entries(dirsStatus).map(([path, exists]) => (
                    <div 
                      key={path} 
                      className="p-5 bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 rounded-2xl flex items-center justify-between shadow-xl"
                    >
                      <div className="flex items-center space-x-4">
                        <div className={`p-3 rounded-xl ${exists ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-850 text-zinc-500"}`}>
                          {exists ? <FolderCheck className="w-6 h-6" /> : <Folder className="w-6 h-6" />}
                        </div>
                        <div>
                          <span className="text-sm font-extrabold text-zinc-100 block font-mono">{path.split("\\").pop()}</span>
                          <span className="text-xs text-zinc-500 font-mono block mt-0.5">{path}</span>
                        </div>
                      </div>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                        exists ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                      }`}>
                        {exists ? "ADA" : "TDK ADA"}
                      </span>
                    </div>
                  ))
                }
              </div>

              {/* Services status brief */}
              <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl space-y-4 shadow-xl">
                <div className="flex items-center space-x-2.5 text-xs font-extrabold text-zinc-400 uppercase tracking-widest">
                  <Activity className="w-5 h-5 text-indigo-400" />
                  <span>Layanan Server Aktif</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-zinc-950/40 border border-zinc-850 p-4 rounded-xl">
                    <span className="text-sm font-medium text-zinc-200">Apache HTTP Server (Port 80)</span>
                    <span className="flex items-center space-x-2">
                      <span className={`text-xs font-semibold ${services.Apache.running ? "text-emerald-400" : "text-zinc-500"}`}>
                        {services.Apache.running ? "Running" : "Offline"}
                      </span>
                      <span className={`h-3 w-3 rounded-full ${services.Apache.running ? "bg-emerald-500" : "bg-zinc-700"}`} />
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-zinc-950/40 border border-zinc-850 p-4 rounded-xl">
                    <span className="text-sm font-medium text-zinc-200">MySQL Database Server (Port 3306)</span>
                    <span className="flex items-center space-x-2">
                      <span className={`text-xs font-semibold ${services.MySQL.running ? "text-emerald-400" : "text-zinc-500"}`}>
                        {services.MySQL.running ? "Running" : "Offline"}
                      </span>
                      <span className={`h-3 w-3 rounded-full ${services.MySQL.running ? "bg-emerald-500" : "bg-zinc-700"}`} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DOWNLOADER */}
          {activeTab === "downloader" && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Katalog Komponen Server</h2>
                <p className="text-sm text-zinc-400 mt-1">Unduh dan pasang biner server resmi secara portabel ke dalam C:\server.</p>
              </div>

              <div className="space-y-4">
                {componentsList.map(comp => {
                  const isDownloading = activeDownloads.includes(comp.id);
                  const progress = downloadProgress[comp.id];
                  const alreadyInstalled = dirsStatus[comp.installedPath] || false;

                  return (
                    <div 
                      key={comp.id}
                      className="p-5 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex flex-col space-y-4 shadow-xl hover:border-zinc-700 transition-all duration-150"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1 mr-4">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-base font-bold text-zinc-100">{comp.name}</h3>
                            {alreadyInstalled ? (
                              <span className="text-xs font-bold px-3 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center gap-1.5 shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                TERPASANG
                              </span>
                            ) : (
                              <span className="text-xs font-bold px-3 py-0.5 rounded-full bg-red-500/15 text-red-400 flex items-center gap-1.5 shrink-0">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                BELUM TERPASANG
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-zinc-400">{comp.description}</p>
                          <p className="text-[11px] text-zinc-500 font-mono">Folder: {comp.installedPath}</p>
                        </div>
                        <button
                          disabled={isDownloading}
                          onClick={() => startDownload(comp.id)}
                          className={`flex items-center space-x-2 py-2 px-4.5 rounded-xl text-sm font-bold transition duration-150 cursor-pointer ${
                            isDownloading 
                              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-750"
                              : alreadyInstalled 
                                ? "bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-400 border border-indigo-500/30"
                                : "bg-indigo-600 hover:bg-indigo-550 text-white shadow-md shadow-indigo-950/30"
                          }`}
                        >
                          {isDownloading
                            ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Mengunduh...</span></>
                            : <><Download className="w-4 h-4" /><span>{alreadyInstalled ? "Unduh Ulang" : "Unduh"}</span></>}
                        </button>
                      </div>

                      {/* Download Progress representation */}
                      {isDownloading && progress && (
                        <div className="space-y-2 bg-zinc-950/30 p-3 rounded-xl border border-zinc-900">
                          <div className="flex justify-between text-xs text-zinc-400 font-mono">
                            <span>{progress.percentage}% Selesai</span>
                            <span>
                              {(progress.bytes_downloaded / (1024 * 1024)).toFixed(1)} MB / {(progress.bytes_total / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          </div>
                          <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-850">
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
          )}

          {/* TAB 3: SERVICES */}
          {activeTab === "services" && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Service Control Panel</h2>
                <p className="text-sm text-zinc-400 mt-1">Daftarkan atau kelola status sakelar hidup/mati service Windows server lokal.</p>
              </div>

              <div className="grid grid-cols-2 gap-5">
                {/* Apache Card */}
                <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex flex-col justify-between space-y-6 shadow-xl">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest">Apache2.4</span>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                        services.Apache.checking ? "bg-zinc-800 text-zinc-400" : services.Apache.running ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                      }`}>
                        {services.Apache.checking && <Loader2 className="w-3 h-3 animate-spin" />}
                        {services.Apache.checking ? "MEMERIKSA" : services.Apache.running ? "RUNNING" : "STOPPED"}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-zinc-100">HTTP Web Server</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      Port aktif: 80. Bertanggung jawab melayani berkas HTML/PHP dan memproses routing virtual host domain.
                    </p>
                  </div>

                  <div className="space-y-2 pt-2">
                    {!services.Apache.installed ? (
                      <button
                        onClick={() => handleInstallService("Apache2.4", "Apache")}
                        disabled={services.Apache.checking}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition duration-150 cursor-pointer shadow-md shadow-indigo-950/20 flex items-center justify-center gap-2"
                      >
                        {services.Apache.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Register Apache Windows Service
                      </button>
                    ) : (
                      <button
                        disabled={services.Apache.checking}
                        onClick={() => toggleService("Apache")}
                        className={`w-full flex items-center justify-center space-x-2 py-3 border rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer ${
                          services.Apache.checking
                            ? "bg-zinc-900/50 border-zinc-700 text-zinc-500 cursor-wait"
                            : services.Apache.running 
                              ? "bg-red-950/25 border-red-500/30 hover:bg-red-900/40 text-red-400 hover:border-red-400" 
                              : "bg-emerald-950/25 border-emerald-500/30 hover:bg-emerald-900/40 text-emerald-400 hover:border-emerald-400"
                        }`}
                      >
                        {services.Apache.checking
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : services.Apache.running ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                        <span>{services.Apache.checking ? "Memproses..." : services.Apache.running ? "Matikan Service" : "Nyalakan Service"}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* MySQL Card */}
                <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex flex-col justify-between space-y-6 shadow-xl">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest">MySQL-Kustom</span>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                        services.MySQL.checking ? "bg-zinc-800 text-zinc-400" : services.MySQL.running ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                      }`}>
                        {services.MySQL.checking && <Loader2 className="w-3 h-3 animate-spin" />}
                        {services.MySQL.checking ? "MEMERIKSA" : services.MySQL.running ? "RUNNING" : "STOPPED"}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-zinc-100">Database Server</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      Port aktif: 3306. Engine database relasional terisolasi untuk menyimpan konfigurasi data proyek Anda.
                    </p>
                  </div>

                  <div className="space-y-2 pt-2">
                    {!services.MySQL.installed ? (
                      <button
                        onClick={() => handleInstallService("MySQL-Kustom", "MySQL")}
                        disabled={services.MySQL.checking}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition duration-150 cursor-pointer shadow-md shadow-indigo-950/20 flex items-center justify-center gap-2"
                      >
                        {services.MySQL.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Register MySQL Windows Service
                      </button>
                    ) : (
                      <button
                        disabled={services.MySQL.checking}
                        onClick={() => toggleService("MySQL")}
                        className={`w-full flex items-center justify-center space-x-2 py-3 border rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer ${
                          services.MySQL.checking
                            ? "bg-zinc-900/50 border-zinc-700 text-zinc-500 cursor-wait"
                            : services.MySQL.running 
                              ? "bg-red-950/25 border-red-500/30 hover:bg-red-900/40 text-red-400 hover:border-red-400" 
                              : "bg-emerald-950/25 border-emerald-500/30 hover:bg-emerald-900/40 text-emerald-400 hover:border-emerald-400"
                        }`}
                      >
                        {services.MySQL.checking
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : services.MySQL.running ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                        <span>{services.MySQL.checking ? "Memproses..." : services.MySQL.running ? "Matikan Service" : "Nyalakan Service"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PROJECT WIZARD */}
          {activeTab === "wizard" && (
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
          )}

          {/* TAB 5: PHP SWITCHER */}
          {activeTab === "php" && (
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

                {!(dirsStatus["C:\\server\\php83"] || dirsStatus["C:\\server\\php82"]) ? (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 flex items-start space-x-3 text-sm text-amber-400 font-bold uppercase tracking-wider">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span>Belum ada versi PHP yang terpasang. Silakan unduh PHP 8.3 atau PHP 8.2 terlebih dahulu di menu Downloader.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-5">
                    {dirsStatus["C:\\server\\php83"] && (
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
                          <p className="text-xs text-zinc-500 mt-1">Direktori: C:\server\php83</p>
                        </div>
                      </button>
                    )}

                    {dirsStatus["C:\\server\\php82"] && (
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
                          <p className="text-xs text-zinc-500 mt-1">Direktori: C:\server\php82</p>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: NODE / NVM */}
          {activeTab === "node" && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Node.js Version Swapper (NVM)</h2>
                <p className="text-sm text-zinc-400 mt-1">Kelola atau beralih versi Node.js yang aktif secara global melalui integrasi NVM.</p>
              </div>

              <div className="p-6 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl space-y-5 shadow-xl">
                {!nvmInstalled ? (
                  <div className="space-y-6">
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 flex items-start space-x-3 text-sm">
                      <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" />
                      <div className="space-y-1.5">
                        <span className="font-extrabold uppercase tracking-wider block">NVM (Node Version Manager) Tidak Terdeteksi</span>
                        <div className="normal-case font-medium leading-relaxed">
                          Aplikasi mendeteksi bahwa NVM belum terpasang di sistem ini. Anda perlu memasang NVM terlebih dahulu sebelum dapat menginstal dan beralih versi Node.js.
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={installingNvm}
                      onClick={handleInstallNvm}
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-550 text-white rounded-xl text-sm font-black transition duration-150 cursor-pointer shadow-md shadow-indigo-950/20 flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-wait"
                    >
                      {installingNvm ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                      <span>{installingNvm ? "Mengunduh & Memasang NVM..." : "Unduh & Pasang NVM (Node Version Manager)"}</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col space-y-3">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Versi Tersedia di NVM</label>
                      {nvmVersions.length === 0 ? (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start space-x-3 text-sm text-amber-400">
                          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                          <span className="leading-relaxed">
                            NVM terdeteksi, namun belum ada versi Node.js yang terinstal. Silakan pasang versi baru menggunakan opsi di bawah.
                          </span>
                        </div>
                      ) : (
                        <div className="flex space-x-3.5 relative">
                          <div className="relative flex-1">
                            <button
                              type="button"
                              onClick={() => setNodeDropdownOpen(!nodeDropdownOpen)}
                              className="w-full text-left bg-zinc-950/70 border border-zinc-800 hover:border-zinc-700 text-zinc-200 rounded-xl px-4 py-3.5 text-sm outline-none cursor-pointer flex justify-between items-center transition"
                            >
                              <span>{selectedNodeVersion || "Pilih versi Node.js..."}</span>
                              <span className="text-zinc-500 text-xs font-mono">▼</span>
                            </button>
                            
                            {nodeDropdownOpen && (
                              <div className="absolute left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-30 animate-fade-in max-h-60 overflow-y-auto">
                                {nvmVersions.map(v => (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => {
                                      setSelectedNodeVersion(v);
                                      setNodeDropdownOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-3 text-sm transition ${
                                      selectedNodeVersion === v
                                        ? "bg-indigo-600 text-white font-bold"
                                        : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                    }`}
                                  >
                                    {v}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={handleSwitchNode}
                            disabled={switchingNode}
                            className="py-3.5 px-6 bg-indigo-600 hover:bg-indigo-550 text-white rounded-xl text-sm font-bold transition duration-150 cursor-pointer shadow-md shadow-indigo-950/20 shrink-0 flex items-center gap-2 disabled:opacity-70 disabled:cursor-wait"
                          >
                            {switchingNode && <Loader2 className="w-4 h-4 animate-spin" />}
                            {switchingNode ? "Mengaktifkan..." : "Aktifkan Versi"}
                          </button>
                        </div>
                      )}
                    </div>

                <div className="h-px bg-zinc-850" />

                {/* Install New Node.js Version Form */}
                <div className="flex flex-col space-y-4">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Unduh & Pasang Versi Node.js Baru</label>
                  <form onSubmit={handleInstallNode} className="flex space-x-3.5">
                    <input 
                      type="text"
                      placeholder="Contoh: 18.16.0 atau lts"
                      value={nodeVersionToInstall}
                      onChange={(e) => setNodeVersionToInstall(e.target.value)}
                      className="flex-1 bg-zinc-950/70 border border-zinc-800 focus:border-indigo-500 focus:bg-zinc-950 rounded-xl px-4 py-3 text-sm text-zinc-100 outline-none transition-all duration-200 font-mono text-indigo-400"
                    />
                    <button
                      type="submit"
                      disabled={installingNode}
                      className="py-3.5 px-6 bg-indigo-600 hover:bg-indigo-550 text-white rounded-xl text-sm font-bold transition duration-150 cursor-pointer shadow-md shadow-indigo-950/20 shrink-0 flex items-center gap-1.5 disabled:opacity-70 disabled:cursor-wait"
                    >
                      {installingNode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      <span>{installingNode ? "Memasang..." : "Pasang Versi"}</span>
                    </button>
                  </form>

                  {/* Quick Select LTS Buttons */}
                  <div className="flex gap-4">
                    {(["24", "20", "18"] as const).map((ver) => (
                      <button
                        key={ver}
                        type="button"
                        disabled={quickInstallingNode !== null}
                        onClick={() => handleQuickInstallNode(ver)}
                        className="flex-1 py-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 cursor-pointer shadow-md disabled:opacity-60 disabled:cursor-wait"
                      >
                        {quickInstallingNode === ver
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Download className="w-4 h-4" />}
                        <span>{quickInstallingNode === ver ? `Memasang Node ${ver}...` : `Pasang Node ${ver} (LTS)`}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-zinc-850" />

                <div className="bg-zinc-950/40 border border-zinc-850 rounded-xl p-4 text-xs text-zinc-400 space-y-2">
                  <div className="flex items-center space-x-2 text-zinc-200 font-semibold mb-1 text-sm">
                    <Terminal className="w-5 h-5 text-indigo-400" />
                    <span>Catatan Integrasi NVM:</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1.5 leading-relaxed text-xs">
                    <li>Symlink Node.js dikelola di lokasi `C:\Program Files\nodejs` oleh NVM.</li>
                    <li>
                      Perintah pergantian versi memerlukan hak akses administrator yang telah didelegasikan saat aplikasi dijalankan.
                    </li>
                  </ul>
                </div>
                </>
              )}
              </div>
            </div>
          )}

        </div>

        {/* Global Footer */}
        <footer className="max-w-3xl w-full mx-auto border-t border-zinc-900/60 pt-5 text-xs text-zinc-500 font-mono flex justify-between relative z-10">
          <span>Envku Orchestrator</span>
          <span>v1.1.0</span>
        </footer>
      </main>

      {/* Global Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 max-w-sm w-full bg-zinc-900/95 border border-zinc-800 rounded-xl shadow-2xl p-4.5 flex items-start space-x-3.5 animate-slide-up z-50 overflow-hidden backdrop-blur-md">
          <div className={`absolute left-0 top-0 bottom-0 w-1 ${
            toast.type === "success" 
              ? "bg-gradient-to-b from-indigo-500 to-purple-500" 
              : "bg-red-500"
          }`} />
          
          <div className={`p-2 rounded-lg shrink-0 ${
            toast.type === "success" ? "bg-indigo-500/10 text-indigo-400" : "bg-red-500/10 text-red-400"
          }`}>
            {toast.type === "success" ? <CheckCircle2 className="w-5 h-5 animate-bounce" /> : <ShieldAlert className="w-5 h-5" />}
          </div>
          
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-100">
                {toast.type === "success" ? "Operasi Sukses" : "Terjadi Kesalahan"}
              </span>
              <button 
                onClick={() => setToast(prev => ({ ...prev, show: false }))}
                className="text-zinc-500 hover:text-zinc-300 rounded p-0.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
              {toast.message}
            </p>
          </div>
        </div>
      )}
      {/* Global Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border-4 border-black p-8 shadow-[8px_8px_0px_0px_#000000] flex flex-col items-center space-y-5 max-w-xs w-full text-center">
            <div className="w-12 h-12 border-4 border-black bg-yellow-400 shadow-[4px_4px_0px_0px_#000000] animate-spin" style={{ animationDuration: '1.2s' }} />
            <div>
              <h3 className="text-lg font-black text-yellow-400 uppercase tracking-wider text-shadow-none">MEMPROSES...</h3>
              <p className="text-xs text-zinc-300 mt-2 font-medium">Mohon tunggu sebentar, sistem sedang melakukan konfigurasi.</p>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-zinc-900 border-4 border-black p-8 shadow-[8px_8px_0px_0px_#000000] flex flex-col items-center space-y-6 max-w-sm w-full text-center">
            <div className="w-12 h-12 border-4 border-black bg-red-600 shadow-[4px_4px_0px_0px_#000000] flex items-center justify-center text-white font-black text-2xl">
              !
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-black text-red-600 uppercase tracking-wider">Hapus Host Lokal?</h3>
              <div className="text-xs text-zinc-300 font-semibold leading-relaxed">
                Apakah Anda yakin ingin menghapus host <span className="font-mono text-indigo-400 font-bold">{hostToDelete}</span>? Tindakan ini akan menghapusnya dari file hosts Windows dan httpd-vhosts.conf Apache.
              </div>
            </div>
            <div className="flex gap-4 w-full">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setHostToDelete("");
                }}
                className="flex-1 py-3 bg-zinc-900 text-zinc-300 text-xs font-bold uppercase tracking-wider"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteHost}
                className="flex-1 py-3 bg-red-600 text-white text-xs font-bold uppercase tracking-wider"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
