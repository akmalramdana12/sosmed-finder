"use client";

import { useEffect, useRef, useState } from "react";
import { Notice, TextLink } from "@/components/ui";
import { apiRequest, takeTokenFromHash } from "@/lib/client/api";

type State = { kind: "working" } | { kind: "ok" } | { kind: "error"; message: string };

export function VerifyEmail() {
  const [state, setState] = useState<State>({ kind: "working" });
  // Token sekali pakai: cegah panggilan ganda (mis. React Strict Mode di development).
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = takeTokenFromHash();
    if (token === null) {
      setState({ kind: "error", message: "Tautan tidak lengkap. Buka tautan dari email Anda." });
      return;
    }
    void apiRequest("/api/auth/email/verify", { method: "POST", body: { token } }).then((result) => {
      setState(result.ok ? { kind: "ok" } : { kind: "error", message: result.message });
    });
  }, []);

  if (state.kind === "working") return <Notice kind="info">Memverifikasi…</Notice>;
  if (state.kind === "ok") {
    return (
      <div className="space-y-4">
        <Notice kind="success">Email Anda terverifikasi.</Notice>
        <p className="text-sm">
          <TextLink href="/dashboard">Ke akun saya</TextLink>
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Notice kind="error">{state.message}</Notice>
      <p className="text-sm">
        <TextLink href="/dashboard">Ke akun saya</TextLink> untuk meminta tautan baru.
      </p>
    </div>
  );
}
