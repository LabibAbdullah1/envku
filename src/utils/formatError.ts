/**
 * Converts raw OS / Tauri error strings or exceptions into concise, friendly, and easy to understand messages for the user.
 */
export function formatFriendlyError(rawError: unknown): string {
  if (!rawError) return "Terjadi kesalahan yang tidak diketahui.";

  const errStr = typeof rawError === "string" ? rawError : (rawError as any)?.message || String(rawError);
  const lower = errStr.toLowerCase();

  // Permission / Administrator errors
  if (
    lower.includes("access is denied") || 
    lower.includes("permissiondenied") || 
    lower.includes("dijalankan sebagai administrator") || 
    lower.includes("os { code: 5")
  ) {
    return "Akses ditolak oleh sistem. Harap jalankan Envku sebagai Administrator.";
  }

  // Operation canceled by user (e.g. UAC prompt canceled)
  if (
    lower.includes("operation was canceled") || 
    lower.includes("code: 1223") || 
    lower.includes("dibatalkan pengguna")
  ) {
    return "Tindakan dibatalkan oleh pengguna.";
  }

  // File or folder not found errors
  if (
    lower.includes("no such file or directory") || 
    lower.includes("tidak ditemukan") || 
    lower.includes("os error 2")
  ) {
    if (errStr.includes("tidak ditemukan")) {
      return errStr
        .replace(/\([^\)]*os error[^\)]*\)/gi, "")
        .replace(/Os \{[^\}]*\}/gi, "")
        .trim();
    }
    return "File atau direktori yang dibutuhkan tidak ditemukan di sistem.";
  }

  // Network connection / download errors
  if (
    lower.includes("network") || 
    lower.includes("connection refused") || 
    lower.includes("failed to connect") || 
    lower.includes("subdomain cpanel maupun upstream") ||
    lower.includes("gagal mendownload")
  ) {
    return "Koneksi terputus atau gagal mengunduh biner server. Periksa koneksi internet Anda.";
  }

  // Port conflicts
  if (
    lower.includes("address already in use") || 
    (lower.includes("port") && lower.includes("in use"))
  ) {
    return "Port yang digunakan sedang dipakai oleh aplikasi lain (seperti XAMPP).";
  }

  // Service control errors
  if (lower.includes("service") && (lower.includes("failed") || lower.includes("gagal"))) {
    return "Layanan server gagal dijalankan. Pastikan tidak ada bentrokan service lain.";
  }

  // Clean up technical stack traces or "Os { code: ..., message: ... }"
  let clean = errStr
    .replace(/Os\s*\{[^}]*\}/gi, "")
    .replace(/Error:\s*/gi, "")
    .replace(/\(os error \d+\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Truncate overly long error strings
  if (clean.length > 120) {
    clean = clean.substring(0, 117) + "...";
  }

  return clean || "Terjadi kesalahan pada sistem.";
}
