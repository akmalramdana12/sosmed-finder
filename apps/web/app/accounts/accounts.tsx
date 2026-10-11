"use client";

import type { PlatformDto, SocialAccountDto } from "@social-finder/types";
import { useState, type FormEvent } from "react";
import { Button, Field, Notice, Section, Select, SubmitButton, Toggle } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";
import { safeExternalUrl } from "@/lib/client/links";
import { useApiData } from "@/lib/client/use-api";

export function Accounts() {
  const accounts = useApiData<SocialAccountDto[]>("/api/me/social-accounts");
  const platforms = useApiData<PlatformDto[]>("/api/platforms");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (accounts.state.kind === "loading" || platforms.state.kind === "loading") return <Notice kind="info">Memuat…</Notice>;
  if (accounts.state.kind === "error") return <Notice kind="error">{accounts.state.message}</Notice>;
  if (platforms.state.kind === "error") return <Notice kind="error">{platforms.state.message}</Notice>;
  const list = accounts.state.data;
  const platformList = platforms.state.data;

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setAdding(true);
    setMessage(null);
    const result = await apiRequest("/api/me/social-accounts", {
      method: "POST",
      body: { platformKey: String(form.get("platformKey") ?? ""), username: String(form.get("username") ?? "") },
    });
    setAdding(false);
    if (result.ok) {
      formElement.reset();
      setMessage({ kind: "success", text: "Akun ditambahkan. Atur apakah akun ini boleh ditemukan di bawah." });
      await accounts.reload();
    } else {
      setMessage({ kind: "error", text: result.message });
    }
  }

  async function setDiscoverable(id: string, next: boolean) {
    setBusyId(id);
    setMessage(null);
    const result = await apiRequest(`/api/me/social-accounts/${encodeURIComponent(id)}`, { method: "PATCH", body: { isDiscoverable: next } });
    setBusyId(null);
    if (!result.ok) setMessage({ kind: "error", text: result.message });
    await accounts.reload();
  }

  async function remove(id: string) {
    if (!window.confirm("Hapus akun sosmed ini dari Social Finder?")) return;
    setBusyId(id);
    setMessage(null);
    const result = await apiRequest(`/api/me/social-accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusyId(null);
    if (!result.ok) setMessage({ kind: "error", text: result.message });
    await accounts.reload();
  }

  return (
    <div className="space-y-10">
      <Section
        title="Akun sosmed"
        description="Anda sendiri yang mendaftarkan username Anda. Tidak ada yang dicari atau diambil dari platform lain, dan akun hanya bisa ditemukan bila Anda mengizinkannya."
      >
        {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
        {list.length === 0 ? (
          <Notice kind="info">Belum ada akun. Tambahkan satu di bawah.</Notice>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {list.map((account) => {
              const href = safeExternalUrl(account.profileUrl);
              return (
                <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900">
                      {account.platform.name} ·{" "}
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
                          @{account.username}
                        </a>
                      ) : (
                        <span>@{account.username}</span>
                      )}
                    </p>
                    {account.isVerified ? <p className="text-xs text-green-700">Terverifikasi</p> : <p className="text-xs text-neutral-500">Belum diverifikasi</p>}
                  </div>
                  <div className="flex items-center gap-4">
                    <Toggle
                      id={`disc-${account.id}`}
                      label="Bisa ditemukan"
                      checked={account.isDiscoverable}
                      disabled={busyId === account.id}
                      onChange={(next) => void setDiscoverable(account.id, next)}
                    />
                    <Button variant="danger" disabled={busyId === account.id} onClick={() => void remove(account.id)}>
                      Hapus
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Tambah akun">
        <form onSubmit={add} className="space-y-4" noValidate>
          <Select id="platformKey" label="Platform" required defaultValue="">
            <option value="" disabled>
              Pilih platform
            </option>
            {platformList.map((platform) => (
              <option key={platform.key} value={platform.key}>
                {platform.name}
              </option>
            ))}
          </Select>
          <Field id="username" label="Username di platform itu" autoComplete="off" hint="Tanpa @. Huruf, angka, titik, garis bawah, atau strip." required />
          <SubmitButton busy={adding}>Tambah</SubmitButton>
        </form>
      </Section>
    </div>
  );
}
