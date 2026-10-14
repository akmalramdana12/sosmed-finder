"use client";

import type {
  ModerationAction,
  ModerationListDto,
  ModerationReportDto,
  ReportStatusValue,
} from "@social-finder/types";
import { REPORT_STATUSES } from "@social-finder/types";
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Button, Notice, Section, Select, TextArea } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";

const REASON_LABEL: Record<ModerationReportDto["reason"], string> = {
  SPAM: "Spam",
  IMPERSONATION: "Meniru orang lain",
  HARASSMENT: "Pelecehan",
  INAPPROPRIATE_CONTENT: "Konten tidak pantas",
  PRIVACY_VIOLATION: "Pelanggaran privasi",
  OTHER: "Lainnya",
};

type Msg = { kind: "error" | "success"; text: string };

export function ModerationQueue() {
  const [status, setStatus] = useState<ReportStatusValue>("OPEN");
  const [items, setItems] = useState<ModerationReportDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  const load = useCallback(async (filter: ReportStatusValue, cursor: string | null) => {
    setLoading(true);
    const query = new URLSearchParams({ status: filter });
    if (cursor !== null) query.set("cursor", cursor);
    const result = await apiRequest<ModerationListDto>(`/api/mod/reports?${query.toString()}`);
    setLoading(false);
    if (!result.ok) {
      // 404 = bukan moderator (atau fitur tidak ada): tampilkan netral, jangan membocorkan apa pun.
      if (result.status === 404 || result.status === 401) setDenied(true);
      else setMsg({ kind: "error", text: result.message });
      return;
    }
    setMsg(null);
    setItems((previous) => (cursor === null ? result.data.data : [...previous, ...result.data.data]));
    setNextCursor(result.data.nextCursor);
  }, []);

  useEffect(() => {
    void load(status, null);
  }, [load, status]);

  function replace(updated: ModerationReportDto) {
    // Daftar menampilkan satu status: laporan yang statusnya berubah keluar dari daftar ini.
    setItems((previous) =>
      previous.flatMap((item) => {
        if (item.id !== updated.id) return [item];
        return updated.status === status ? [updated] : [];
      }),
    );
  }

  if (denied) return <Notice kind="info">Halaman tidak tersedia.</Notice>;

  return (
    <Section title="Antrean laporan" description="Laporan tidak punya efek otomatis. Hanya tindakan Anda yang mengubah laporan atau akun. Identitas pelapor tidak ditampilkan.">
      <Select id="status" label="Status" value={status} onChange={(event: ChangeEvent<HTMLSelectElement>) => setStatus(event.target.value as ReportStatusValue)}>
        {REPORT_STATUSES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </Select>
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      {loading && items.length === 0 ? <Notice kind="info">Memuat…</Notice> : null}
      {!loading && items.length === 0 ? <Notice kind="info">Tidak ada laporan dengan status ini.</Notice> : null}
      <ul className="space-y-3">
        {items.map((report) => (
          <ReportCard key={report.id} report={report} onUpdated={replace} onMessage={setMsg} />
        ))}
      </ul>
      {nextCursor !== null ? (
        <Button disabled={loading} onClick={() => void load(status, nextCursor)}>
          Muat lebih banyak
        </Button>
      ) : null}
    </Section>
  );
}

function ReportCard({
  report,
  onUpdated,
  onMessage,
}: {
  report: ModerationReportDto;
  onUpdated: (report: ModerationReportDto) => void;
  onMessage: (msg: Msg | null) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const open = report.status === "OPEN" || report.status === "REVIEWING";

  async function act(action: ModerationAction) {
    if (action === "suspend" && !window.confirm(`Tangguhkan @${report.target.username}? Semua sesinya dicabut.`)) return;
    setBusy(true);
    onMessage(null);
    const result = await apiRequest<{ data: ModerationReportDto }>(`/api/mod/reports/${report.id}`, {
      method: "POST",
      body: note.trim().length > 0 ? { action, note: note.trim() } : { action },
    });
    setBusy(false);
    if (!result.ok) {
      onMessage({ kind: "error", text: result.message });
      return;
    }
    setNote("");
    onUpdated(result.data.data);
  }

  return (
    <li className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-neutral-900">
          @{report.target.username} · {REASON_LABEL[report.reason]}
        </p>
        <p className="text-xs text-neutral-500">
          {report.status} · {new Date(report.createdAt).toLocaleString("id-ID")}
        </p>
      </div>
      <p className="text-xs text-neutral-600">
        Akun: {report.target.status} · Laporan terbuka terhadap akun ini: {report.target.openReports}
      </p>
      {report.details ? <p className="whitespace-pre-wrap text-sm text-neutral-800">{report.details}</p> : null}
      {report.moderatorNote ? <p className="text-xs text-neutral-500">Catatan: {report.moderatorNote}</p> : null}
      <TextArea id={`note-${report.id}`} label="Catatan (wajib untuk tangguhkan dan aktifkan kembali)" value={note} maxLength={1000} rows={2} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        {report.status === "OPEN" ? (
          <Button disabled={busy} onClick={() => void act("review")}>
            Tinjau
          </Button>
        ) : null}
        {open ? (
          <>
            <Button disabled={busy} onClick={() => void act("dismiss")}>
              Tolak laporan
            </Button>
            <Button disabled={busy} onClick={() => void act("resolve")}>
              Selesai tanpa sanksi
            </Button>
            {report.target.status === "ACTIVE" ? (
              <Button variant="danger" disabled={busy} onClick={() => void act("suspend")}>
                Tangguhkan akun
              </Button>
            ) : null}
          </>
        ) : null}
        {report.target.status === "SUSPENDED" ? (
          <Button disabled={busy} onClick={() => void act("reinstate")}>
            Aktifkan kembali
          </Button>
        ) : null}
      </div>
    </li>
  );
}
