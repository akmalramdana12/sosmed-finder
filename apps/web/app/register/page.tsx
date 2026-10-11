import type { Metadata } from "next";
import { AuthShell } from "@/components/ui";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Daftar · Social Finder" };

export default function RegisterPage() {
  return (
    <AuthShell title="Buat akun" subtitle="Profil Anda tidak muncul di pencarian sampai Anda sendiri mengaktifkannya.">
      <RegisterForm />
    </AuthShell>
  );
}
