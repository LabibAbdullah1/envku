import { CheckCircle2, ShieldAlert, X } from "lucide-react";

interface ToastProps {
  toast: { show: boolean; type: "success" | "error"; message: string };
  onClose: () => void;
}

export default function Toast({ toast, onClose }: ToastProps) {
  if (!toast.show) return null;

  return (
    <div className={`fixed bottom-6 right-6 max-w-sm w-full border-3 border-[#09090b] shadow-[6px_6px_0px_0px_#09090b] p-4 flex items-start space-x-3 z-50 overflow-hidden ${
      toast.type === "success" ? "bg-[#fde047] text-[#09090b]" : "bg-[#fecaca] text-[#7f1d1d]"
    }`}>
      <div className={`p-1.5 border-2 border-[#09090b] shrink-0 ${
        toast.type === "success" ? "bg-[#bbf7d0] text-[#14532d]" : "bg-[#ffffff] text-[#7f1d1d]"
      }`}>
        {toast.type === "success" ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
      </div>
      
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider">
            {toast.type === "success" ? "Operasi Sukses" : "Terjadi Kesalahan"}
          </span>
          <button 
            onClick={onClose}
            className="text-[#09090b] hover:opacity-75 p-0.5 cursor-pointer font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs leading-relaxed font-bold">
          {toast.message}
        </p>
      </div>
    </div>
  );
}
