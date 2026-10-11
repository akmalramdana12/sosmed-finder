"use client";

import type { BlockedUserDto } from "@social-finder/types";
import { useState } from "react";
import { Button, Notice, Section } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";
import { useApiData } from "@/lib/client/use-api";

export function BlockedList() {
  const { state, reload } = useApiData<BlockedUserDto[]>("/api/blocks");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.kind === "loading") return <Notice kind="info">Memuat…</Notice>;
  if (state.kind === "error") return <Notice kind="error">{state.message}</Notice>;

  async function unblock(username: string) {
    setBusy(username);
    setError(null);
    const result = await apiRequest(`/api/blocks/${encodeURIComponent(username)}`, { method: "DELETE" });
    setBusy(null);
    if (!result.ok) setError(result.message);
    await reload();
  }

  return (
    <Section title="Pengguna yang Anda blokir" description="Pengguna ini tidak bisa menemukan Anda, dan Anda tidak melihat mereka di pencarian.">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {state.data.length === 0 ? (
        <Notice kind="info">Belum ada yang diblokir.</Notice>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {state.data.map((entry) => (
            <li key={entry.username} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">@{entry.username}</p>
                <p className="text-xs text-neutral-500">Diblokir {new Date(entry.blockedAt).toLocaleDateString("id-ID")}</p>
              </div>
              <Button disabled={busy === entry.username} onClick={() => void unblock(entry.username)}>
                Buka blokir
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
