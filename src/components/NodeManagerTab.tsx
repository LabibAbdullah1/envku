import React from "react";
import { AlertTriangle, Download, Loader2, Terminal } from "lucide-react";

interface NodeManagerTabProps {
  nvmInstalled: boolean;
  installingNvm: boolean;
  handleInstallNvm: () => void;
  nvmVersions: string[];
  nodeDropdownOpen: boolean;
  setNodeDropdownOpen: (open: boolean) => void;
  selectedNodeVersion: string;
  setSelectedNodeVersion: (version: string) => void;
  handleSwitchNode: () => void;
  switchingNode: boolean;
  nodeVersionToInstall: string;
  setNodeVersionToInstall: (version: string) => void;
  handleInstallNode: (e: React.FormEvent) => void;
  installingNode: boolean;
  quickInstallingNode: string | null;
  handleQuickInstallNode: (ver: string) => void;
}

export default function NodeManagerTab({
  nvmInstalled,
  installingNvm,
  handleInstallNvm,
  nvmVersions,
  nodeDropdownOpen,
  setNodeDropdownOpen,
  selectedNodeVersion,
  setSelectedNodeVersion,
  handleSwitchNode,
  switchingNode,
  nodeVersionToInstall,
  setNodeVersionToInstall,
  handleInstallNode,
  installingNode,
  quickInstallingNode,
  handleQuickInstallNode,
}: NodeManagerTabProps) {
  return (
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
  );
}
