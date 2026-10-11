import { TextLink } from "@/components/ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-10">
      <p className="text-sm font-semibold tracking-tight text-neutral-500">Social Finder</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-neutral-900">
        Temukan orang yang memilih untuk ditemukan.
      </h1>
      <p className="mt-4 text-lg text-neutral-600">
        Hanya profil yang mendaftar sendiri dan mengaktifkan discoverability yang muncul. Lokasi tidak pernah
        ditampilkan tepat, dan Anda yang mengatur apa yang terlihat.
      </p>
      <p className="mt-8 flex gap-6 text-sm">
        <TextLink href="/register">Buat akun</TextLink>
        <TextLink href="/login">Masuk</TextLink>
        <TextLink href="/search">Cari</TextLink>
      </p>
    </main>
  );
}
