import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

import "./App.css";
import packageJson from "../package.json";

// Subcomponents
import Sidebar from "./components/Sidebar";
import Splashscreen from "./components/Splashscreen";
import Toast from "./components/Toast";
import DashboardTab from "./components/DashboardTab";
import DownloaderTab from "./components/DownloaderTab";
import ServicesTab from "./components/ServicesTab";
import ProjectWizardTab from "./components/ProjectWizardTab";
import PhpSwitcherTab from "./components/PhpSwitcherTab";
import NodeManagerTab from "./components/NodeManagerTab";
import SupportTab from "./components/SupportTab";

// Interface definitions
interface ProgressPayload {
  component_id: string;
  percentage: number;
  bytes_downloaded: number;
  bytes_total: number;
}

interface VirtualHostInfo {
  domain: string;
  document_root: string;
  is_node: boolean;
  node_port: number | null;
  has_ssl: boolean;
}

export default function App() {
  // Check if this window instance is the splashscreen
  const isSplash = typeof window !== "undefined" && window.location.search.includes("splash=true");

  // Navigation
  const [activeTab, setActiveTab] = useState<"dashboard" | "downloader" | "services" | "wizard" | "php" | "node" | "support">("dashboard");

  // Splash screen state
  const [appReady, setAppReady] = useState<boolean>(false);

  // Dynamic server path resolved from backend
  const [baseDir, setBaseDir] = useState<string>("C:\\server");
  const isLinux = baseDir.startsWith("/") || !baseDir.includes("\\");

  const getSubPaths = (dir: string) => {
    const isL = dir.startsWith("/") || !dir.includes("\\");
    const sep = isL ? "/" : "\\";
    const mailpitFile = isL ? "mailpit" : "mailpit.exe";
    return [
      dir,
      `${dir}${sep}www`,
      `${dir}${sep}Apache24`,
      `${dir}${sep}php83`,
      `${dir}${sep}php82`,
      `${dir}${sep}mysql`,
      `${dir}${sep}www${sep}phpmyadmin`,
      `${dir}${sep}composer${sep}composer.phar`,
      `${dir}${sep}redis`,
      `${dir}${sep}mailpit${sep}${mailpitFile}`
    ];
  };

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

  // Modul 0 State (Dir check status)
  const [dirsStatus, setDirsStatus] = useState<{ [key: string]: boolean }>({});

  // Modul 1 State (Downloader progress)
  const [downloadProgress, setDownloadProgress] = useState<{
    [key: string]: { percentage: number; bytes_downloaded: number; bytes_total: number }
  }>({});
  const [activeDownloads, setActiveDownloads] = useState<string[]>([]);

  // Modul 2 State (Services status)
  const [services, setServices] = useState<{
    Apache: { installed: boolean; running: boolean; checking: boolean; conflict?: boolean; conflictMessage?: string };
    MySQL: { installed: boolean; running: boolean; checking: boolean; conflict?: boolean; conflictMessage?: string };
    Redis: { installed: boolean; running: boolean; checking: boolean; conflict?: boolean; conflictMessage?: string };
    Mailpit: { installed: boolean; running: boolean; checking: boolean; conflict?: boolean; conflictMessage?: string };
  }>({
    Apache: { installed: false, running: false, checking: true },
    MySQL: { installed: false, running: false, checking: true },
    Redis: { installed: false, running: false, checking: true },
    Mailpit: { installed: false, running: false, checking: true }
  });

  // Modul 3 State (Project Virtual Hosts)
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

  // Make body background transparent on splashscreen window
  useEffect(() => {
    if (isSplash) {
      document.body.style.backgroundColor = "transparent";
      document.body.style.backgroundImage = "none";
    }
  }, [isSplash]);

  const showToastMsg = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 6000);
  };

  // Check Directories using baseDir dynamically
  const checkDirectories = async () => {
    const pathsToCheck = getSubPaths(baseDir);
    setDirsLoading(true);
    try {
      await invoke("check_and_init_environment");
      const results = await invoke<{ [key: string]: boolean }>("check_directories_exist", { paths: pathsToCheck });
      setDirsStatus(results);
    } catch (err) {
      console.warn("Gagal memeriksa direktori:", err);
    } finally {
      document.body.style.backgroundColor = ""; // keep existing format
      setDirsLoading(false);
    }
  };

  // Poll service ports & check registration status
  const updateServiceStates = async () => {
    try {
      const details = await invoke<any[]>("get_detailed_services_status");
      const newServices = { ...services };
      
      details.forEach((item) => {
        let key: "Apache" | "MySQL" | "Redis" | "Mailpit" = "Apache";
        if (item.name === "MySQL") key = "MySQL";
        else if (item.name === "Redis") key = "Redis";
        else if (item.name === "Mailpit") key = "Mailpit";

        let conflictMessage = "";
        if (item.path_conflict) {
          conflictMessage = `Service terdaftar di luar Envku: ${item.conflict_process}`;
        } else if (item.port_conflict) {
          conflictMessage = `Port ${item.port} digunakan oleh PID ${item.conflict_pid} (${item.conflict_process})`;
        }

        newServices[key] = {
          installed: item.installed,
          running: item.running,
          checking: false,
          conflict: item.path_conflict || item.port_conflict,
          conflictMessage: conflictMessage || undefined
        };
      });

      setServices(newServices);
    } catch (err) {
      console.warn("Gagal memperbarui status layanan:", err);
    }
  };

  // Run Service control (Start/Stop)
  const toggleService = async (serviceKey: "Apache" | "MySQL" | "Redis" | "Mailpit") => {
    const currentStatus = services[serviceKey];
    let serviceWinName = "Apache2.4";
    if (serviceKey === "MySQL") serviceWinName = "mysql-server";
    else if (serviceKey === "Redis") serviceWinName = "redis-server";
    else if (serviceKey === "Mailpit") serviceWinName = "mailpit";
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
  const handleInstallService = async (serviceWinName: string, serviceKey: "Apache" | "MySQL" | "Redis") => {
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

  // Clear Redis Cache
  const handleClearRedisCache = async () => {
    setLoading(true);
    try {
      const res = await invoke<string>("clear_redis_cache");
      showToastMsg(res, "success");
    } catch (err) {
      showToastMsg(String(err), "error");
    } finally {
      setLoading(false);
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
  const handleLaunchHost = async (domain: string, hasSsl: boolean) => {
    try {
      const protocol = hasSsl ? "https" : "http";
      await invoke("open_in_browser", { url: `${protocol}://${domain}` });
    } catch (err) {
      showToastMsg(String(err), "error");
    }
  };

  // Delete virtual host (opens modal)
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
      // 1. Fetch backend dynamically resolved base directory
      let resolvedBaseDir = "C:\\server";
      try {
        resolvedBaseDir = await invoke<string>("get_server_dir");
        setBaseDir(resolvedBaseDir);
      } catch (err) {
        console.warn("Gagal mengambil folder server dinamis, fallback ke C:\\server", err);
      }

      // 2. Scan directories based on resolved base directory
      const pathsToCheck = getSubPaths(resolvedBaseDir);
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

      // 3. Parallel fetch app status
      await Promise.allSettled([
        updateServiceStates(),
        fetchNvm(),
        fetchActivePhpVersion(),
        fetchVirtualHosts(),
      ]);

      // Minimum splash display time of 5.0s for better UX
      await new Promise(resolve => setTimeout(resolve, 5000));

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

  if (isSplash) {
    return <Splashscreen isSplash={isSplash} />;
  }

  if (!appReady) {
    return <div className="h-screen w-screen bg-[#0c0d10] bg-grid-glow" />;
  }

  return (
    <div className="relative h-screen w-screen flex bg-grid-glow overflow-hidden select-none font-sans text-zinc-100">
      
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main View Area */}
      <main className="flex-1 bg-transparent p-8 overflow-y-auto flex flex-col justify-between relative z-10">
        
        {/* Content View Container */}
        <div className="flex-1 max-w-3xl w-full mx-auto space-y-8">

          {activeTab === "dashboard" && (
            <DashboardTab
              dirsLoading={dirsLoading}
              dirsStatus={dirsStatus}
              checkDirectories={checkDirectories}
              services={services}
            />
          )}

          {activeTab === "downloader" && (
            <DownloaderTab
              dirsStatus={dirsStatus}
              baseDir={baseDir}
              activeDownloads={activeDownloads}
              downloadProgress={downloadProgress}
              startDownload={startDownload}
            />
          )}

          {activeTab === "services" && (
            <ServicesTab
              services={services}
              handleInstallService={handleInstallService}
              toggleService={toggleService}
              handleClearRedis={handleClearRedisCache}
              isLinux={isLinux}
              dirsStatus={dirsStatus}
              baseDir={baseDir}
            />
          )}

          {activeTab === "wizard" && (
            <ProjectWizardTab
              virtualHosts={virtualHosts}
              fetchVirtualHosts={fetchVirtualHosts}
              updateServiceStates={updateServiceStates}
              showToastMsg={showToastMsg}
              handleLaunchHost={handleLaunchHost}
              handleDeleteHost={handleDeleteHost}
              loading={loading}
              setLoading={setLoading}
              isLinux={isLinux}
            />
          )}

          {activeTab === "php" && (
            <PhpSwitcherTab
              dirsStatus={dirsStatus}
              activePhpVersion={activePhpVersion}
              switchingPhp={switchingPhp}
              handleSwitchPhp={handleSwitchPhp}
              baseDir={baseDir}
            />
          )}

          {activeTab === "node" && (
            <NodeManagerTab
              nvmInstalled={nvmInstalled}
              installingNvm={installingNvm}
              handleInstallNvm={handleInstallNvm}
              nvmVersions={nvmVersions}
              nodeDropdownOpen={nodeDropdownOpen}
              setNodeDropdownOpen={setNodeDropdownOpen}
              selectedNodeVersion={selectedNodeVersion}
              setSelectedNodeVersion={setSelectedNodeVersion}
              handleSwitchNode={handleSwitchNode}
              switchingNode={switchingNode}
              nodeVersionToInstall={nodeVersionToInstall}
              setNodeVersionToInstall={setNodeVersionToInstall}
              handleInstallNode={handleInstallNode}
              installingNode={installingNode}
              quickInstallingNode={quickInstallingNode}
              handleQuickInstallNode={handleQuickInstallNode}
              baseDir={baseDir}
            />
          )}

          {activeTab === "support" && (
            <SupportTab
              services={services}
              activePhpVersion={activePhpVersion}
              dirsStatus={dirsStatus}
              baseDir={baseDir}
            />
          )}

        </div>

        {/* Global Footer */}
        <footer className="max-w-3xl w-full mx-auto border-t border-zinc-900/60 pt-5 text-xs text-zinc-500 font-mono flex justify-between relative z-10">
          <span>Envku Orchestrator</span>
          <span>v{packageJson.version}</span>
        </footer>
      </main>

      {/* Global Toast Notification */}
      <Toast toast={toast} onClose={() => setToast(prev => ({ ...prev, show: false }))} />

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
                Apakah Anda yakin ingin menghapus host <span className="font-mono text-indigo-400 font-bold">{hostToDelete}</span>? Tindakan ini akan menghapusnya dari file hosts {isLinux ? "Linux" : "Windows"} dan httpd-vhosts.conf Apache.
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
