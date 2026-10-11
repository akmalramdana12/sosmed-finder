import type { Metadata } from "next";
import { AuthShell } from "@/components/ui";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Password baru · Social Finder", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Pilih password baru">
      <ResetPasswordForm />
    </AuthShell>
  );
}
