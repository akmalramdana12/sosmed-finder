"use client";

import { REPORT_REASONS, type ReportReasonValue, type SearchResultDto } from "@social-finder/types";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Notice, Section, Select, SubmitButton, TextArea } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";
import { safeExternalUrl } from "@/lib/client/links";
import { useApiData } from "@/lib/client/use-api";

const REASON_LABEL: Record<ReportReasonValue, string> = {
  SPAM: "Spam",
  IMPERSONATION: "Menyamar sebagai orang lain",
  HARASSMENT: "Pelecehan",
  INAPPROPRIATE_CONTENT: "Konten tidak pantas",
  PRIVACY_VIOLATION: "Pelanggaran privasi",
  OTHER: "Lainnya",
};

/** Username diambil dari path /u/<username> (sama dengan pola route API: tidak bergantung bentuk `params`). */
function usernameFromPath(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}

export function PublicProfile() {
  const pathname = usePathname();
  const username = usernameFromPath(pathname);
  const { state } = useApiData<SearchResultDto>(`/api/users/${encodeURIComponent(username)}`);

  if (state.kind === "loading") return <Notice kind="info">Memuat…</Notice>;
  if (state.kind === "error") {
    // Server memberi 404 yang sama untuk "tidak ada", "tidak bisa ditemukan", dan "diblokir".
    return (
      <div className="space-y-4">
        <Notice kind="error">Profil tidak ditemukan.</Notice>
        <p className="text-sm">
          <Link href="/search" className="font-medium underline underline-offset-2">
            Kembali ke pencarian
          </Link>
        </p>
      </div>
    );
  }
  return <ProfileView profile={state.data} />;
}

function ProfileView({ profile }: { profile: SearchResultDto }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const where = [profile.area, profile.city].filter((part): part is string => part !== undefined && part !== "").join(", ");

  async function block() {
    if (!window.confirm(`Blokir @${profile.username}? Anda tidak akan saling menemukan.`)) return;
    setBusy(true);
    const result = await apiRequest("/api/blocks", { method: "POST", body: { username: profile.username } });
    setBusy(false);
    if (result.ok) router.replace("/search");
    else setMessage({ kind: "error", text: result.message });
  }

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const details = String(form.get("details") ?? "").trim();
    const body: Record<string, string> = { username: profile.username, reason: String(form.get("reason") ?? "") };
    if (details !== "") body["details"] = details;
    setBusy(true);
    setMessage(null);
    const result = await apiRequest("/api/reports", { method: "POST", body });
    setBusy(false);
    if (result.ok) {
      setReporting(false);
      setMessage({ kind: "success", text: "Laporan diterima. Terima kasih. Laporan tidak langsung berdampak pada akun itu; tim meninjaunya." });
    } else {
      setMessage({ kind: "error", text: result.message });
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{profile.displayName}</h1>
        <p className="text-sm text-neutral-600">@{profile.username}</p>
        {where !== "" ? <p className="mt-1 text-sm text-neutral-600">{where}</p> : null}
        {profile.distanceKm !== undefined ? <p className="text-sm text-neutral-600">±{profile.distanceKm} km dari Anda</p> : null}
      </header>

      <Section title="Akun sosmed">
        {profile.accounts.length === 0 ? (
          <Notice kind="info">Pengguna ini menyembunyikan daftar platformnya.</Notice>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {profile.accounts.map((account) => {
              const href = safeExternalUrl(account.profileUrl);
              return (
                <li key={`${account.platform}:${account.username}`} className="px-4 py-3 text-sm">
                  <span className="font-medium text-neutral-900">{account.platform}</span>{" "}
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
                      @{account.username}
                    </a>
                  ) : (
                    <span>@{account.username}</span>
                  )}
                  {account.isVerified ? <span className="ml-2 text-xs text-green-700">✓ terverifikasi</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}

      <Section title="Keamanan">
        {reporting ? (
          <form onSubmit={report} className="space-y-4" noValidate>
            <Select id="reason" label="Alasan" defaultValue="SPAM">
              {REPORT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {REASON_LABEL[reason]}
                </option>
              ))}
            </Select>
            <TextArea id="details" label="Keterangan" maxLength={1000} hint="Wajib (min. 10 karakter) bila alasannya Lainnya." />
            <div className="flex gap-3">
              <SubmitButton busy={busy}>Kirim laporan</SubmitButton>
              <Button onClick={() => setReporting(false)}>Batal</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setReporting(true)}>Laporkan</Button>
            <Button variant="danger" disabled={busy} onClick={() => void block()}>
              Blokir
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}
