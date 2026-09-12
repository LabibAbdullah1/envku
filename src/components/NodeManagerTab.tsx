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
  baseDir: string;
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
  baseDir,
}: NodeManagerTabProps) {
  const isLinux = baseDir.startsWith("/") || !baseDir.includes("\\");
  return (
    <div className="space-y-6 animate-fade-in text-[#18181b]">
      <div>
        <h2 className="text-2xl font-black text-[#09090b] tracking-tight">Node.js Version Swapper (NVM)</h2>
        <p className="text-sm text-[#52525b] mt-1 font-semibold">Kelola atau beralih versi Node.js yang aktif secara global melalui integrasi NVM.</p>
      </div>

      <div className="p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] space-y-5">
        {!nvmInstalled ? (
          <div className="space-y-6">
            <div className="bg-[#fef08a] border-2.5 border-[#09090b] p-5 shadow-[3px_3px_0px_0px_#09090b] flex items-start space-x-3 text-xs text-[#713f12]">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <span className="font-black uppercase tracking-wider block">NVM (Node Version Manager) Tidak Terdeteksi</span>
                <div className="normal-case font-semibold leading-relaxed">
                  Aplikasi mendeteksi bahwa NVM belum terpasang di sistem ini. Anda perlu memasang NVM terlebih dahulu sebelum dapat menginstal dan beralih versi Node.js.
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={installingNvm}
              onClick={handleInstallNvm}
              className="w-full py-4 bg-[#fde047] hover:bg-[#fef08a] text-[#09090b] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] text-xs font-black uppercase tracking-wider transition duration-150 cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-70"
            >
              {installingNvm ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              <span>{installingNvm ? "Mengunduh & Memasang NVM..." : "Unduh & Pasang NVM (Node Version Manager)"}</span>
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col space-y-3">
              <label className="text-xs font-black text-[#09090b] uppercase tracking-widest block">Versi Tersedia di NVM</label>
              {nvmVersions.length === 0 ? (
                <div className="bg-[#fef08a] border-2.5 border-[#09090b] p-4 shadow-[3px_3px_0px_0px_#09090b] flex items-start space-x-3 text-xs text-[#713f12]">
                  <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                  <span className="leading-relaxed font-semibold">
                    NVM terdeteksi, namun belum ada versi Node.js yang terinstal. Silakan pasang versi baru menggunakan opsi di bawah.
                  </span>
                </div>
              ) : (
                <div className="flex space-x-3.5 relative">
                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={() => setNodeDropdownOpen(!nodeDropdownOpen)}
                      className="w-full text-left bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] text-[#18181b] px-4 py-3 text-xs font-bold outline-none cursor-pointer flex justify-between items-center transition"
                    >
                      <span>{selectedNodeVersion || "Pilih versi Node.js..."}</span>
                      <span className="text-[#09090b] text-xs font-mono font-black">▼</span>
                    </button>
                    
                    {nodeDropdownOpen && (
                      <div className="absolute left-0 right-0 mt-2 bg-[#ffffff] border-3 border-[#09090b] shadow-[6px_6px_0px_0px_#09090b] overflow-hidden z-30 animate-fade-in max-h-60 overflow-y-auto">
                        {nvmVersions.map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              setSelectedNodeVersion(v);
                              setNodeDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-3 text-xs font-bold transition border-b border-[#09090b] ${
                              selectedNodeVersion === v
                                ? "bg-[#fde047] text-[#09090b] font-black"
                                : "text-[#18181b] hover:bg-[#7dd3fc]"
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
                    className="py-3 px-6 bg-[#fde047] text-[#09090b] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#fef08a] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] text-xs font-black uppercase transition cursor-pointer shrink-0 flex items-center gap-2"
                  >
                    {switchingNode && <Loader2 className="w-4 h-4 animate-spin" />}
                    {switchingNode ? "Mengaktifkan..." : "Aktifkan Versi"}
                  </button>
                </div>
              )}
            </div>

            <div className="h-0.5 bg-[#09090b] my-4" />

            {/* Install New Node.js Version Form */}
            <div className="flex flex-col space-y-4">
              <label className="text-xs font-black text-[#09090b] uppercase tracking-widest block">Unduh & Pasang Versi Node.js Baru</label>
              <form onSubmit={handleInstallNode} className="flex space-x-3.5">
                <input 
                  type="text"
                  placeholder="Contoh: 18.16.0 atau lts"
                  value={nodeVersionToInstall}
                  onChange={(e) => setNodeVersionToInstall(e.target.value)}
                  className="flex-1 bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] px-4 py-3 text-xs text-[#09090b] outline-none font-mono font-black"
                />
                <button
                  type="submit"
                  disabled={installingNode}
                  className="py-3 px-6 bg-[#fde047] text-[#09090b] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#fef08a] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] text-xs font-black uppercase transition cursor-pointer shrink-0 flex items-center gap-1.5"
                >
                  {installingNode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>{installingNode ? "Memasang..." : "Pasang Versi"}</span>
                </button>
              </form>

              {/* Quick Select LTS Buttons */}
              <div className="flex gap-3">
                {(["24", "20", "18"] as const).map((ver) => (
                  <button
                    key={ver}
                    type="button"
                    disabled={quickInstallingNode !== null}
                    onClick={() => handleQuickInstallNode(ver)}
                    className="flex-1 py-3 bg-[#ffffff] text-[#18181b] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] text-xs font-black uppercase transition flex items-center justify-center space-x-2 cursor-pointer shrink-0"
                  >
                    {quickInstallingNode === ver
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Download className="w-4 h-4" />}
                    <span>{quickInstallingNode === ver ? `Memasang Node ${ver}...` : `Node ${ver} (LTS)`}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="h-0.5 bg-[#09090b] my-4" />

            <div className="bg-[#fffefb] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] p-4 text-xs text-[#52525b] space-y-2">
              <div className="flex items-center space-x-2 text-[#09090b] font-black mb-1 text-xs uppercase">
                <Terminal className="w-4 h-4 text-[#09090b]" />
                <span>Catatan Integrasi NVM:</span>
              </div>
              <ul className="list-disc pl-4 space-y-1.5 leading-relaxed text-xs font-semibold">
                {isLinux ? (
                  <>
                    <li>Symlink Node.js dikelola di lokasi `~/.nvm` oleh NVM.</li>
                    <li>
                      Perintah pergantian versi akan mengubah default alias secara otomatis dan berlaku pada terminal sesi baru.
                    </li>
                  </>
                ) : (
                  <>
                    <li>Symlink Node.js dikelola di lokasi `C:\Program Files\nodejs` oleh NVM.</li>
                    <li>
                      Perintah pergantian versi memerlukan hak akses administrator yang telah didelegasikan saat aplikasi dijalankan.
                    </li>
                  </>
                )}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
