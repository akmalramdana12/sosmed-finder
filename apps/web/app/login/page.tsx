import type { Metadata } from "next";
import { AuthShell } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk · Social Finder" };

export default function LoginPage() {
  return (
    <AuthShell title="Masuk">
      <LoginForm />
    </AuthShell>
  );
}
