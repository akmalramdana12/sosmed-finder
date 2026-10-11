/**
 * Log JSON satu baris ke stdout/stderr. Hanya menerima pesan statis dan nilai sederhana
 * (angka, nama tugas); jangan pernah memasukkan data pengguna, token, atau objek error.
 */
export type LogFields = Readonly<Record<string, string | number | readonly string[] | Readonly<Record<string, number>>>>;

export function logInfo(msg: string, fields: LogFields = {}): void {
  process.stdout.write(`${JSON.stringify({ level: "info", msg, ...fields })}\n`);
}

export function logError(msg: string, fields: LogFields = {}): void {
  process.stderr.write(`${JSON.stringify({ level: "error", msg, ...fields })}\n`);
}
