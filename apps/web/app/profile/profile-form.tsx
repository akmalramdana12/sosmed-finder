"use client";

import type { MeDto } from "@social-finder/types";
import { useState, type FormEvent } from "react";
import { Field, Notice, Section, SubmitButton, TextArea } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";
import { useApiData } from "@/lib/client/use-api";

export function ProfileForm() {
  const { state, setData } = useApiData<MeDto>("/api/me");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  if (state.kind === "loading") return <Notice kind="info">Memuat…</Notice>;
  if (state.kind === "error") return <Notice kind="error">{state.message}</Notice>;
  const me = state.data;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, string | null> = {};
    const displayName = String(form.get("displayName") ?? "");
    const username = String(form.get("username") ?? "");
    const bio = String(form.get("bio") ?? "");
    if (displayName !== me.displayName) body["displayName"] = displayName;
    if (username !== me.username) body["username"] = username;
    if (bio !== (me.bio ?? "")) body["bio"] = bio;
    if (Object.keys(body).length === 0) {
      setMessage({ kind: "success", text: "Tidak ada perubahan." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await apiRequest<{ data: MeDto }>("/api/me", { method: "PATCH", body });
    setBusy(false);
    if (result.ok) {
      setData(result.data.data);
      setMessage({ kind: "success", text: "Profil disimpan." });
    } else {
      setMessage({ kind: "error", text: result.message });
    }
  }

  return (
    <Section title="Profil" description="Yang tampil pada hasil pencarian dan profil publik Anda. Email tidak pernah ditampilkan ke orang lain.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate key={`${me.username}|${me.displayName}|${me.bio ?? ""}`}>
        {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
        <Field id="displayName" label="Nama tampilan" defaultValue={me.displayName} maxLength={80} required />
        <Field
          id="username"
          label="Username"
          defaultValue={me.username}
          maxLength={30}
          hint="Mengubahnya mengubah cara orang menemukan Anda; tautan lama ke profil Anda tidak berlaku lagi."
          required
        />
        <TextArea id="bio" label="Bio" defaultValue={me.bio ?? ""} maxLength={500} hint="Maksimal 500 karakter. Kosongkan untuk menghapus." />
        <SubmitButton busy={busy}>Simpan</SubmitButton>
      </form>
    </Section>
  );
}
