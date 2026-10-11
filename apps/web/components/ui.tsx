import Link from "next/link";
import type { ButtonHTMLAttributes, ChangeEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const inputClass =
  "mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 shadow-sm " +
  "placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 " +
  "disabled:opacity-60";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <Link href="/" className="mb-8 text-sm font-semibold tracking-tight text-neutral-500 hover:text-neutral-900">
        Social Finder
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-neutral-600">{subtitle}</p> : null}
      <div className="mt-6">{children}</div>
    </main>
  );
}

export function Field({ label, hint, id, ...props }: { label: string; hint?: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-800">
        {label}
      </label>
      <input id={id} name={id} className={inputClass} {...props} />
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

export function SubmitButton({ children, busy, ...props }: { busy: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900/40 disabled:opacity-60"
      {...props}
    >
      {busy ? "Memproses…" : children}
    </button>
  );
}

/** Pesan status. role=alert untuk error agar dibacakan pembaca layar; role=status untuk info. */
export function Notice({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  const tone =
    kind === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : kind === "success"
        ? "border-green-200 bg-green-50 text-green-800"
        : "border-neutral-200 bg-neutral-50 text-neutral-700";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>
      {children}
    </p>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-600">
      {children}
    </Link>
  );
}

export function TextArea({ label, hint, id, ...props }: { label: string; hint?: string; id: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-800">
        {label}
      </label>
      <textarea id={id} name={id} className={inputClass} rows={4} {...props} />
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

export function Select({ label, hint, id, children, ...props }: { label: string; hint?: string; id: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-800">
        {label}
      </label>
      <select id={id} name={id} className={inputClass} {...props}>
        {children}
      </select>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

/** Saklar on/off berbasis checkbox (dapat difokus dan dibaca pembaca layar). */
export function Toggle({ id, label, description, checked, disabled, onChange }: { id: string; label: string; description?: string; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 rounded border-neutral-400 text-neutral-900 focus:ring-2 focus:ring-neutral-900/30 disabled:opacity-60"
      />
      <label htmlFor={id} className="text-sm">
        <span className="block font-medium text-neutral-900">{label}</span>
        {description ? <span className="block text-neutral-600">{description}</span> : null}
      </label>
    </div>
  );
}

export function Button({ variant = "secondary", children, ...props }: { variant?: "primary" | "secondary" | "danger"; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const tone =
    variant === "primary"
      ? "bg-neutral-900 text-white hover:bg-neutral-700"
      : variant === "danger"
        ? "border border-red-300 text-red-700 hover:bg-red-50"
        : "border border-neutral-300 text-neutral-800 hover:bg-neutral-100";
  return (
    <button
      type="button"
      className={`rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-neutral-900/30 disabled:opacity-60 ${tone}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = `h-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-lg font-semibold text-neutral-900">
        {title}
      </h2>
      {description ? <p className="text-sm text-neutral-600">{description}</p> : null}
      {children}
    </section>
  );
}
