import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  Radio, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Zap, 
  Loader2, 
  Search, 
  HelpCircle,
  Activity
} from "lucide-react";

export interface ManagedPortItem {
  port: number;
  serviceLabel: string;
  isInUse: boolean;
  ownerPid?: number;
  ownerProcess?: string;
  isEnvku: boolean;
  canKill: boolean;
}

interface PortManagerTabProps {
  showToastMsg: (message: string, type?: "success" | "error") => void;
  onPortResolved?: () => void;
}

export default function PortManagerTab({ showToastMsg, onPortResolved }: PortManagerTabProps) {
  const [ports, setPorts] = useState<ManagedPortItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [killingPid, setKillingPid] = useState<number | null>(null);

  // Custom scanner state
  const [customPortInput, setCustomPortInput] = useState<string>("");
  const [scanningCustom, setScanningCustom] = useState<boolean>(false);
  const [customPortResult, setCustomPortResult] = useState<ManagedPortItem | null>(null);

  const fetchPorts = async () => {
    setLoading(true);
    try {
      const data = await invoke<ManagedPortItem[]>("get_managed_ports");
      setPorts(data);
    } catch (err) {
      showToastMsg(`Gagal memuat status port: ${err}`, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPorts();
  }, []);

  const handleCutOff = async (item: ManagedPortItem) => {
    if (!item.ownerPid) return;
    const pid = item.ownerPid;

    if (pid === 4) {
      showToastMsg("PID 4 adalah kernel Windows / IIS. Jalankan 'iisreset /stop' di CMD Administrator untuk membebaskannya.", "error");
      return;
    }

    if (!confirm(`Apakah Anda yakin ingin mematikan paksa (Cut Off) proses ${item.ownerProcess || ""} (PID ${pid}) pada Port ${item.port}?`)) {
      return;
    }

    setKillingPid(pid);
    try {
      const res = await invoke<string>("terminate_port_pid", { pid });
      showToastMsg(res, "success");
      await fetchPorts();
      if (customPortResult && customPortResult.ownerPid === pid) {
        setCustomPortResult(null);
      }
      if (onPortResolved) {
        onPortResolved();
      }
    } catch (err) {
      showToastMsg(String(err), "error");
    } finally {
      setKillingPid(null);
    }
  };

  const handleScanCustomPort = async (e: React.FormEvent) => {
    e.preventDefault();
    const portNum = parseInt(customPortInput.trim(), 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      showToastMsg("Masukkan nomor port yang valid antara 1 - 65535.", "error");
      return;
    }

    setScanningCustom(true);
    try {
      const res = await invoke<ManagedPortItem>("scan_custom_port", { port: portNum });
      setCustomPortResult(res);
      showToastMsg(`Hasil pemindaian Port ${portNum} diperbarui.`, "success");
    } catch (err) {
      showToastMsg(`Gagal memindai port: ${err}`, "error");
    } finally {
      setScanningCustom(false);
    }
  };

  const totalPorts = ports.length;
  const inUsePorts = ports.filter(p => p.isInUse).length;
  const conflictPorts = ports.filter(p => p.isInUse && !p.isEnvku).length;
  const freePorts = totalPorts - inUsePorts;

  return (
    <div className="space-y-6 animate-fade-in text-[#18181b]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-[#09090b] flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-[#09090b]" />
            Kelola Port & Cut-Off Konflik
          </h2>
          <p className="text-sm text-[#52525b] mt-1 font-semibold">
            Pantau status port server lokal, identifikasi bentrokan aplikasi pihak ketiga, dan matikan PID secara instan.
          </p>
        </div>
        <button
          onClick={fetchPorts}
          disabled={loading}
          className="self-start sm:self-auto py-2.5 px-4 bg-[#ffffff] text-[#18181b] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#7dd3fc] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#09090b] text-xs font-black transition cursor-pointer flex items-center gap-2 uppercase shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Port</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b]">
          <span className="text-[10px] font-black uppercase text-[#52525b] tracking-wider block">Total Dipantau</span>
          <span className="text-2xl font-black text-[#09090b] mt-1 block">{totalPorts} Port</span>
        </div>
        <div className="p-4 bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b]">
          <span className="text-[10px] font-black uppercase text-[#14532d] tracking-wider block">Status Bebas</span>
          <span className="text-2xl font-black text-[#14532d] mt-1 block flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#16a34a]" />
            {freePorts}
          </span>
        </div>
        <div className="p-4 bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b]">
          <span className="text-[10px] font-black uppercase text-[#1e40af] tracking-wider block">Dipakai Envku</span>
          <span className="text-2xl font-black text-[#1e40af] mt-1 block flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#2563eb]" />
            {inUsePorts - conflictPorts}
          </span>
        </div>
        <div className="p-4 bg-[#ffffff] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b]">
          <span className="text-[10px] font-black uppercase text-[#991b1b] tracking-wider block">Bentrokan Eksternal</span>
          <span className="text-2xl font-black text-[#991b1b] mt-1 block flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#dc2626]" />
            {conflictPorts}
          </span>
        </div>
      </div>

      {/* Main Managed Ports Table */}
      <div className="bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] overflow-hidden">
        <div className="p-4 bg-[#eae6df] border-b-2.5 border-[#09090b] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#09090b]" />
            <h3 className="text-sm font-black text-[#09090b] uppercase tracking-wider">Daftar Port Inti Server</h3>
          </div>
          <span className="text-[11px] font-bold text-[#52525b] font-mono">Auto Detect</span>
        </div>

        <div className="divide-y-2 border-[#09090b] divide-[#09090b]">
          {ports.map((item) => {
            const isKilling = killingPid === item.ownerPid;
            return (
              <div 
                key={item.port} 
                className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                  item.isInUse && !item.isEnvku ? "bg-[#fef2f2]" : "hover:bg-[#fbfaf8]"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-0.5 bg-[#09090b] text-[#ffffff] font-mono font-black text-xs">
                      :{item.port}
                    </span>
                    <h4 className="text-sm font-black text-[#09090b]">{item.serviceLabel}</h4>
                    {item.isInUse ? (
                      item.isEnvku ? (
                        <span className="px-2 py-0.5 bg-[#dbeafe] text-[#1e40af] border border-[#09090b] text-[10px] font-black uppercase">
                          Aktif (Envku)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-[#fecaca] text-[#991b1b] border border-[#09090b] text-[10px] font-black uppercase flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Bentrok
                        </span>
                      )
                    ) : (
                      <span className="px-2 py-0.5 bg-[#dcfce7] text-[#14532d] border border-[#09090b] text-[10px] font-black uppercase">
                        Bebas / Standby
                      </span>
                    )}
                  </div>

                  {item.isInUse ? (
                    <p className="text-xs text-[#52525b] font-mono">
                      Digunakan oleh: <strong className="text-[#09090b]">{item.ownerProcess || "Unknown Process"}</strong>
                      {item.ownerPid !== undefined && ` (PID: ${item.ownerPid})`}
                    </p>
                  ) : (
                    <p className="text-xs text-[#71717a]">Port tidak terkunci oleh proses apa pun.</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {item.isInUse && item.ownerPid !== undefined && (
                    item.isEnvku ? (
                      <div className="px-3 py-1.5 bg-[#eff6ff] text-[#1e40af] border border-[#09090b] text-[11px] font-bold flex items-center gap-1.5 shadow-[2px_2px_0px_0px_#09090b]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#2563eb] shrink-0" />
                        <span>Service Normal (Envku)</span>
                      </div>
                    ) : item.ownerPid === 4 ? (
                      <div className="px-3 py-1.5 bg-[#fef3c7] text-[#92400e] border border-[#09090b] text-[11px] font-bold flex items-center gap-1.5" title="PID 4 adalah System kernel Windows (IIS/HTTP.sys)">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span>System Kernel (IIS)</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleCutOff(item)}
                        disabled={isKilling || !item.canKill}
                        className="py-2 px-3.5 bg-[#ef4444] text-[#ffffff] border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] hover:bg-[#dc2626] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#09090b] text-xs font-black uppercase transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isKilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        <span>Cut Off PID {item.ownerPid}</span>
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Port Scanner Section */}
      <div className="p-6 bg-[#ffffff] border-3 border-[#09090b] shadow-[4px_4px_0px_0px_#09090b] space-y-4">
        <div>
          <h3 className="text-base font-black text-[#09090b] flex items-center gap-2">
            <Search className="w-4 h-4" />
            Pindai & Cek Port Kustom
          </h3>
          <p className="text-xs text-[#52525b] mt-0.5 font-medium">
            Ingin memeriksa port tertentu (seperti 3000, 5000, 8000, 8080)? Masukkan nomor port di bawah untuk memeriksa proses pemiliknya.
          </p>
        </div>

        <form onSubmit={handleScanCustomPort} className="flex flex-col sm:flex-row gap-3">
          <input
            type="number"
            min="1"
            max="65535"
            placeholder="Contoh: 8080"
            value={customPortInput}
            onChange={(e) => setCustomPortInput(e.target.value)}
            className="flex-1 px-4 py-2.5 bg-[#ffffff] border-2.5 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#fde047]"
          />
          <button
            type="submit"
            disabled={scanningCustom || !customPortInput.trim()}
            className="py-2.5 px-6 bg-[#fde047] text-[#09090b] border-2.5 border-[#09090b] shadow-[3px_3px_0px_0px_#09090b] hover:bg-[#fef08a] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#09090b] text-xs font-black uppercase transition cursor-pointer flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            {scanningCustom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>Pindai Port</span>
          </button>
        </form>

        {/* Custom Port Result Card */}
        {customPortResult && (
          <div className="mt-4 p-4 bg-[#fbfaf8] border-2.5 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm">Port :{customPortResult.port}</span>
                {customPortResult.isInUse ? (
                  <span className="px-2 py-0.5 bg-[#fecaca] text-[#991b1b] border border-[#09090b] text-[10px] font-black uppercase">
                    Terpakai / In Use
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-[#dcfce7] text-[#14532d] border border-[#09090b] text-[10px] font-black uppercase">
                    Tersedia / Bebas
                  </span>
                )}
              </div>
              {customPortResult.isInUse ? (
                <p className="text-xs text-[#52525b] font-mono">
                  Dipakai oleh: <strong className="text-[#09090b]">{customPortResult.ownerProcess || "Unknown"}</strong> (PID: {customPortResult.ownerPid})
                </p>
              ) : (
                <p className="text-xs text-[#52525b]">Port ini bebas dan siap digunakan oleh aplikasi atau virtual host.</p>
              )}
            </div>

            {customPortResult.isInUse && customPortResult.ownerPid !== undefined && customPortResult.canKill && (
              <button
                onClick={() => handleCutOff(customPortResult)}
                disabled={killingPid === customPortResult.ownerPid}
                className="py-2 px-4 bg-[#ef4444] text-[#ffffff] border-2 border-[#09090b] shadow-[2px_2px_0px_0px_#09090b] hover:bg-[#dc2626] text-xs font-black uppercase transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
              >
                {killingPid === customPortResult.ownerPid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                <span>Cut Off PID {customPortResult.ownerPid}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Info Tips */}
      <div className="p-4 bg-[#fef9c3] border-2.5 border-[#09090b] text-[#713f12] text-xs shadow-[3px_3px_0px_0px_#09090b] flex items-start gap-3">
        <HelpCircle className="w-5 h-5 shrink-0 text-[#854d0e] mt-0.5" />
        <div className="space-y-1">
          <strong className="font-black uppercase tracking-wider block text-[11px]">Tips Penanganan Bentrokan Port:</strong>
          <p className="leading-relaxed">
            Jika Port 80 atau 443 terkunci oleh <strong>PID 4 (System)</strong>, hal itu biasanya disebabkan oleh layanan <strong>IIS (Internet Information Services)</strong> atau <em>World Wide Web Publishing Service</em> bawaan Windows. Anda dapat mematikannya melalui Command Prompt Administrator dengan mengetikkan: <code className="bg-[#fef08a] px-1 py-0.5 font-mono font-bold text-[#09090b]">iisreset /stop</code> atau mematikan service <em>W3SVC</em> di Services Windows.
          </p>
        </div>
      </div>
    </div>
  );
}

