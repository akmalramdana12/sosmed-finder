import type { Metadata } from "next";
import { AuthShell } from "@/components/ui";
import { VerifyEmail } from "./verify-email";

export const metadata: Metadata = { title: "Verifikasi email · Social Finder", robots: { index: false } };

export default function VerifyEmailPage() {
  return (
    <AuthShell title="Verifikasi email">
      <VerifyEmail />
    </AuthShell>
  );
}
