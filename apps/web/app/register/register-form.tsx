"use client";

import { useState, type FormEvent } from "react";
import { Field, Notice, SubmitButton, TextLink } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";

export function RegisterForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await apiRequest("/api/auth/register", {
      method: "POST",
      body: {
        email: String(form.get("email") ?? ""),
        username: String(form.get("username") ?? ""),
        password: String(form.get("password") ?? ""),
      },
    });
    setBusy(false);
    if (result.ok) setDone(true);
    else setError(result.message);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Notice kind="success">
          Pendaftaran diproses. Silakan masuk dengan email dan password Anda.
        </Notice>
        <p className="text-sm">
          <TextLink href="/login">Ke halaman masuk</TextLink>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Field id="email" label="Email" type="email" autoComplete="email" required />
      <Field
        id="username"
        label="Username"
        autoComplete="username"
        hint="Huruf, angka, dan garis bawah. Ini yang dipakai orang lain untuk menemukan Anda."
        required
      />
      <Field id="password" label="Password" type="password" autoComplete="new-password" minLength={12} hint="Minimal 12 karakter." required />
      <SubmitButton busy={busy}>Daftar</SubmitButton>
      <p className="text-sm text-neutral-600">
        Sudah punya akun? <TextLink href="/login">Masuk</TextLink>
      </p>
    </form>
  );
}
