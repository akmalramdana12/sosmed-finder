"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Field, Notice, SubmitButton, TextLink } from "@/components/ui";
import { apiRequest, takeTokenFromHash } from "@/lib/client/api";

export function ResetPasswordForm() {
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Token ada di fragmen URL (tidak pernah dikirim ke server saat membuka halaman).
    setToken(takeTokenFromHash());
    setChecked(true);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (token === null) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await apiRequest("/api/auth/password-reset/confirm", {
      method: "POST",
      body: { token, newPassword: password },
    });
    setBusy(false);
    if (result.ok) setDone(true);
    else setError(result.message);
  }

  if (!checked) return null;

  if (done) {
    return (
      <div className="space-y-4">
        <Notice kind="success">Password diperbarui. Semua sesi lama telah dikeluarkan.</Notice>
        <p className="text-sm">
          <TextLink href="/login">Masuk dengan password baru</TextLink>
        </p>
      </div>
    );
  }

  if (token === null) {
    return (
      <div className="space-y-4">
        <Notice kind="error">Tautan tidak lengkap. Buka tautan dari email Anda, atau minta yang baru.</Notice>
        <p className="text-sm">
          <TextLink href="/forgot-password">Minta tautan baru</TextLink>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Field id="password" label="Password baru" type="password" autoComplete="new-password" minLength={12} hint="Minimal 12 karakter." required />
      <Field id="confirm" label="Ulangi password baru" type="password" autoComplete="new-password" required />
      <SubmitButton busy={busy}>Simpan password</SubmitButton>
    </form>
  );
}
