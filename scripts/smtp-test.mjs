// Kirim satu email uji memakai SMTP_URL dan MAIL_FROM (dari environment). Dijalankan oleh workflow
// "SMTP test". Tidak mencetak kredensial: hanya host, port, dan hasil/kode galat.
import { createTransport } from "nodemailer";

const url = process.env.SMTP_URL ?? "";
const from = process.env.MAIL_FROM || "Social Finder <no-reply@localhost>";
const to = process.env.TO ?? "";

if (!url || !to) {
  console.error("SMTP_URL (secret) dan alamat tujuan wajib diisi.");
  process.exit(1);
}
let host = "?";
try {
  const parsed = new URL(url);
  host = `${parsed.hostname}:${parsed.port || "(default)"} (${parsed.protocol.replace(":", "")})`;
} catch {
  console.error("SMTP_URL bukan URL valid. Contoh: smtps://user:password@smtp.example.com:465");
  process.exit(1);
}
console.log(`Server SMTP: ${host}`);
console.log(`Pengirim   : ${from}`);

const transport = createTransport(url);
try {
  await transport.verify();
  console.log("Koneksi dan login SMTP: OK");
  const info = await transport.sendMail({
    from,
    to,
    subject: "Tes SMTP Social Finder",
    text: "Jika Anda membaca ini, SMTP_URL dan MAIL_FROM sudah benar.\nCek juga apakah email masuk Kotak Masuk atau Spam.",
  });
  console.log(`Terkirim. Respons server: ${String(info.response).slice(0, 120)}`);
} catch (error) {
  const e = /** @type {{code?: string; responseCode?: number; command?: string}} */ (error);
  console.error(`GAGAL: code=${e.code ?? "-"} responseCode=${e.responseCode ?? "-"} command=${e.command ?? "-"}`);
  process.exit(1);
}
