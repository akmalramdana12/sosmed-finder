"use client";

import { useState, type FormEvent } from "react";
import { Field, Notice, SubmitButton, TextLink } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await apiRequest("/api/auth/password-reset/request", {
      method: "POST",
      body: { email: String(form.get("email") ?? "") },
    });
    setBusy(false);
    if (result.ok) setSent(true);
    else setError(result.message);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Notice kind="success">
          Jika email itu terdaftar, tautan pengaturan ulang sudah dikirim dan berlaku 30 menit. Periksa juga folder spam.
        </Notice>
        <p className="text-sm">
          <TextLink href="/login">Kembali ke halaman masuk</TextLink>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Field id="email" label="Email" type="email" autoComplete="email" required />
      <SubmitButton busy={busy}>Kirim tautan</SubmitButton>
      <p className="text-sm">
        <TextLink href="/login">Kembali</TextLink>
      </p>
    </form>
  );
}
