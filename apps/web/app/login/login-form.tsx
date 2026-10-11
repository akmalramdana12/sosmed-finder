"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, Notice, SubmitButton, TextLink } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";

export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") },
    });
    if (result.ok) {
      router.push("/dashboard");
      return;
    }
    setBusy(false);
    setError(result.message);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Field id="email" label="Email" type="email" autoComplete="email" required />
      <Field id="password" label="Password" type="password" autoComplete="current-password" required />
      <SubmitButton busy={busy}>Masuk</SubmitButton>
      <p className="flex justify-between text-sm text-neutral-600">
        <TextLink href="/forgot-password">Lupa password?</TextLink>
        <span>
          Belum punya akun? <TextLink href="/register">Daftar</TextLink>
        </span>
      </p>
    </form>
  );
}
