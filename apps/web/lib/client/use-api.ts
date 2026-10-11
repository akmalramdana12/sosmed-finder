"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "./api";

export type LoadState<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "error"; message: string };

/**
 * Memuat GET milik pengguna yang login. 401 mengarahkan ke /login. `reload` memuat ulang
 * (dipanggil setelah mutasi). Respons API berbentuk { data }.
 */
export function useApiData<T>(url: string): { state: LoadState<T>; reload: () => Promise<void>; setData: (data: T) => void } {
  const router = useRouter();
  const [state, setState] = useState<LoadState<T>>({ kind: "loading" });

  const reload = useCallback(async () => {
    const result = await apiRequest<{ data: T }>(url);
    if (result.ok) setState({ kind: "ready", data: result.data.data });
    else if (result.status === 401) router.replace("/login");
    else setState({ kind: "error", message: result.message });
  }, [url, router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setData = useCallback((data: T) => setState({ kind: "ready", data }), []);
  return { state, reload, setData };
}
