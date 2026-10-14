"use client";

import type { MeDto } from "@social-finder/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field, Notice, SubmitButton } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";

type Status = { kind: "loading" } | { kind: "ready"; me: MeDto } | { kind: "error"; message: string };

export function Dashboard() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  const load = useCallback(async () => {
    const result = await apiRequest<{ data: MeDto }>("/api/me");
    if (result.ok) {
      setStatus({ kind: "ready", me: result.data.data });
    } else if (result.status === 401) {
      router.replace("/login");
    } else {
      setStatus({ kind: "error", message: result.message });
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (status.kind === "loading") return <Notice kind="info">Memuat…</Notice>;
  if (status.kind === "error") return <Notice kind="error">{status.message}</Notice>;

  const { me } = status;
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{me.displayName}</h1>
        <p className="text-sm text-neutral-600">@{me.username}</p>
      </header>

      <EmailSection me={me} />
      <PasswordSection onChanged={() => router.replace("/login")} />
      <ExportSection />
      <DeleteSection onDeleted={() => router.replace("/")} />
    </div>
  );
}

function EmailSection({ me }: { me: MeDto }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function resend() {
    setBusy(true);
    setMessage(null);
    const result = await apiRequest("/api/me/email/verification", { method: "POST" });
    setBusy(false);
    setMessage(
      result.ok
        ? { kind: "success", text: "Jika email belum terverifikasi, tautan baru sudah dikirim (berlaku 24 jam)." }
        : { kind: "error", text: result.message },
    );
  }

  return (
    <section aria-labelledby="email-heading" className="space-y-3">
      <h2 id="email-heading" className="text-lg font-semibold text-neutral-900">
        Email
      </h2>
      <p className="text-sm text-neutral-700">
        {me.email} · {me.emailVerified ? "terverifikasi" : "belum terverifikasi"}
      </p>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      {me.emailVerified ? null : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void resend()}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-60"
        >
          {busy ? "Mengirim…" : "Kirim tautan verifikasi"}
        </button>
      )}
    </section>
  );
}

function PasswordSection({ onChanged }: { onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await apiRequest("/api/me/password", {
      method: "POST",
      body: {
        currentPassword: String(form.get("currentPassword") ?? ""),
        newPassword: String(form.get("newPassword") ?? ""),
      },
    });
    setBusy(false);
    // Server mencabut semua sesi: pengguna harus masuk lagi.
    if (result.ok) onChanged();
    else setError(result.message);
  }

  return (
    <section aria-labelledby="password-heading" className="space-y-3">
      <h2 id="password-heading" className="text-lg font-semibold text-neutral-900">
        Ganti password
      </h2>
      <p className="text-sm text-neutral-600">Setelah diganti, semua perangkat dikeluarkan dan Anda masuk ulang.</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Notice kind="error">{error}</Notice> : null}
        <Field id="currentPassword" label="Password saat ini" type="password" autoComplete="current-password" required />
        <Field id="newPassword" label="Password baru" type="password" autoComplete="new-password" minLength={12} hint="Minimal 12 karakter." required />
        <SubmitButton busy={busy}>Ganti password</SubmitButton>
      </form>
    </section>
  );
}

function ExportSection() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setDone(false);
    const result = await apiRequest<{ data: unknown }>("/api/me/export", {
      method: "POST",
      body: { password: String(form.get("exportPassword") ?? "") },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // Berkas dibuat di browser dari respons; tidak ada URL yang bisa dibagikan.
    const blob = new Blob([JSON.stringify(result.data.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "social-finder-data.json";
    link.click();
    URL.revokeObjectURL(url);
    setDone(true);
    setOpen(false);
  }

  return (
    <section aria-labelledby="export-heading" className="space-y-3 border-t border-neutral-200 pt-8">
      <h2 id="export-heading" className="text-lg font-semibold text-neutral-900">
        Unduh data saya
      </h2>
      <p className="text-sm text-neutral-600">
        Salinan data akun Anda (profil, akun sosmed, pengaturan privasi, label lokasi, daftar blokir, laporan yang Anda buat). Koordinat tidak disertakan.
      </p>
      {done ? <Notice kind="success">Data diunduh. Simpan berkas ini dengan aman: berisi email Anda.</Notice> : null}
      {open ? (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error ? <Notice kind="error">{error}</Notice> : null}
          <Field id="exportPassword" label="Password" type="password" autoComplete="current-password" required />
          <SubmitButton busy={busy}>Unduh</SubmitButton>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
        >
          Unduh data…
        </button>
      )}
    </section>
  );
}

function DeleteSection({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await apiRequest("/api/me", {
      method: "DELETE",
      body: { password: String(form.get("password") ?? ""), confirm: String(form.get("confirm") ?? "") },
    });
    setBusy(false);
    if (result.ok) onDeleted();
    else setError(result.message);
  }

  return (
    <section aria-labelledby="delete-heading" className="space-y-3 border-t border-neutral-200 pt-8">
      <h2 id="delete-heading" className="text-lg font-semibold text-red-700">
        Hapus akun
      </h2>
      <p className="text-sm text-neutral-600">
        Akun langsung hilang dari pencarian dan semua sesi berakhir. Data dihapus permanen setelah 30 hari.
      </p>
      {open ? (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error ? <Notice kind="error">{error}</Notice> : null}
          <Field id="password" label="Password" type="password" autoComplete="current-password" required />
          <Field id="confirm" label="Ketik DELETE untuk menegaskan" autoComplete="off" required />
          <SubmitButton busy={busy}>Hapus akun saya</SubmitButton>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Hapus akun…
        </button>
      )}
    </section>
  );
}
