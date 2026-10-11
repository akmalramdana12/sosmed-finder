import type { Metadata } from "next";
import { AuthShell } from "@/components/ui";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Lupa password · Social Finder" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Lupa password" subtitle="Masukkan email akun Anda. Jika terdaftar, kami kirim tautan untuk memilih password baru.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
