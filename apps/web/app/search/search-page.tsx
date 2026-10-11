"use client";

import { SEARCH_MODES, type PlatformDto, type SearchMode, type SearchResponseDto, type SearchResultDto } from "@social-finder/types";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Field, Notice, Section, Select, SubmitButton } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";
import { safeExternalUrl } from "@/lib/client/links";
import { useApiData } from "@/lib/client/use-api";

const MODE_LABEL: Record<SearchMode, string> = { exact: "Username persis", prefix: "Diawali" };

interface Criteria {
  q: string;
  mode: SearchMode;
  platform: string;
  radiusKm: string;
}

/** Hanya parameter yang diisi yang dikirim; server menolak parameter tak dikenal dan pencarian kosong. */
function buildQuery(criteria: Criteria, cursor: string | null): string {
  const params = new URLSearchParams();
  if (criteria.q !== "") {
    params.set("q", criteria.q);
    params.set("mode", criteria.mode);
  }
  if (criteria.platform !== "") params.set("platform", criteria.platform);
  if (criteria.radiusKm !== "") {
    params.set("radiusKm", criteria.radiusKm);
    params.set("sort", "distance");
  }
  if (cursor !== null) params.set("cursor", cursor);
  return params.toString();
}

export function SearchPage() {
  const platforms = useApiData<PlatformDto[]>("/api/platforms");
  const [criteria, setCriteria] = useState<Criteria | null>(null);
  const [results, setResults] = useState<SearchResultDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function run(next: Criteria, cursor: string | null) {
    setBusy(true);
    setError(null);
    const result = await apiRequest<SearchResponseDto>(`/api/search?${buildQuery(next, cursor)}`);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSearched(true);
    setResults((previous) => (cursor === null ? result.data.data : [...previous, ...result.data.data]));
    setNextCursor(result.data.nextCursor);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const mode = String(form.get("mode")) === "prefix" ? "prefix" : "exact";
    const next: Criteria = {
      q: String(form.get("q") ?? "").trim(),
      mode,
      platform: String(form.get("platform") ?? ""),
      radiusKm: String(form.get("radiusKm") ?? "").trim(),
    };
    if (next.q === "" && next.radiusKm === "") {
      setError("Isi kata kunci atau radius.");
      return;
    }
    setCriteria(next);
    setResults([]);
    setNextCursor(null);
    void run(next, null);
  }

  const platformList = platforms.state.kind === "ready" ? platforms.state.data : [];

  return (
    <div className="space-y-8">
      <Section
        title="Cari"
        description="Hanya orang yang memilih ikut dan mengizinkannya yang muncul. Tidak ada daftar semua pengguna: isi kata kunci (min. 2 karakter) atau radius."
      >
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field id="q" label="Username" autoComplete="off" placeholder="mis. ada_lovelace" />
          <Select id="mode" label="Cara mencocokkan" defaultValue="exact">
            {SEARCH_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABEL[mode]}
              </option>
            ))}
          </Select>
          <Select id="platform" label="Platform (opsional)" defaultValue="">
            <option value="">Semua</option>
            {platformList.map((platform) => (
              <option key={platform.key} value={platform.key}>
                {platform.name}
              </option>
            ))}
          </Select>
          <Field
            id="radiusKm"
            label="Radius dari lokasi saya, km (opsional)"
            type="number"
            min={1}
            max={50}
            hint="Butuh lokasi Anda aktif dan diatur di halaman Lokasi."
          />
          <div className="sm:col-span-2">
            <SubmitButton busy={busy}>Cari</SubmitButton>
          </div>
        </form>
      </Section>

      {error ? <Notice kind="error">{error}</Notice> : null}

      {searched && results.length === 0 && !busy && error === null ? <Notice kind="info">Tidak ada hasil.</Notice> : null}

      {results.length > 0 ? (
        <ul className="space-y-3" aria-label="Hasil pencarian">
          {results.map((result) => (
            <ResultCard key={result.username} result={result} />
          ))}
        </ul>
      ) : null}

      {nextCursor !== null && criteria !== null ? (
        <Button disabled={busy} onClick={() => void run(criteria, nextCursor)}>
          {busy ? "Memuat…" : "Muat lebih banyak"}
        </Button>
      ) : null}
    </div>
  );
}

function ResultCard({ result }: { result: SearchResultDto }) {
  const where = [result.area, result.city].filter((part): part is string => part !== undefined && part !== "").join(", ");
  return (
    <li className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p>
          <Link href={`/u/${encodeURIComponent(result.username)}`} className="font-medium text-neutral-900 underline underline-offset-2">
            {result.displayName}
          </Link>{" "}
          <span className="text-sm text-neutral-500">@{result.username}</span>
        </p>
        {result.distanceKm !== undefined ? <p className="text-sm text-neutral-600">±{result.distanceKm} km</p> : null}
      </div>
      {where !== "" ? <p className="mt-1 text-sm text-neutral-600">{where}</p> : null}
      {result.accounts.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {result.accounts.map((account) => {
            const href = safeExternalUrl(account.profileUrl);
            const label = `${account.platform}: @${account.username}`;
            return (
              <li key={`${account.platform}:${account.username}`}>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-neutral-800 underline underline-offset-2">
                    {label}
                  </a>
                ) : (
                  label
                )}
                {account.isVerified ? <span className="ml-1 text-xs text-green-700">✓ terverifikasi</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}
