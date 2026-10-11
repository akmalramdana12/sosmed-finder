import type { MailMessage, Mailer } from "@social-finder/api/recovery";
import { createTransport, type Transporter } from "nodemailer";
import { getEnv } from "./env";

/** Pengirim SMTP (produksi). URL SMTP berisi kredensial: jangan pernah dicatat. */
class SmtpMailer implements Mailer {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(smtpUrl: string, from: string) {
    this.transport = createTransport(smtpUrl);
    this.from = from;
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

/**
 * Hanya development tanpa SMTP_URL: email tidak dikirim, isinya ditulis ke stdout agar tautan bisa
 * dicoba. Tidak pernah aktif di production (env mewajibkan SMTP_URL di sana).
 */
class DevMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    process.stdout.write(`[DEV MAIL] to=${message.to} subject=${message.subject}\n${message.text}\n`);
  }
}

let mailer: Mailer | undefined;

export function getMailer(): Mailer {
  if (!mailer) {
    const env = getEnv();
    mailer = env.smtpUrl && env.smtpUrl.length > 0 ? new SmtpMailer(env.smtpUrl, env.mailFrom) : new DevMailer();
  }
  return mailer;
}
