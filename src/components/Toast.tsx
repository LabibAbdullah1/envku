import { CheckCircle2, ShieldAlert, X } from "lucide-react";

interface ToastProps {
  toast: { show: boolean; type: "success" | "error"; message: string };
  onClose: () => void;
}

export default function Toast({ toast, onClose }: ToastProps) {
  if (!toast.show) return null;

  return (
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
            onClick={onClose}
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
  );
}
