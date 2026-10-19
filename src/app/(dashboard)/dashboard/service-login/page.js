"use client";

import Link from "next/link";

const services = [
  {
    id: "claude",
    name: "Claude",
    description: "Buka halaman masuk Claude. Jika sudah masuk di browser, layanan dapat terbuka dengan sesi browser tersebut.",
    loginUrl: "https://claude.ai/login",
    type: "Halaman masuk",
  },
];

export default function ServiceLoginPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6 md:p-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Pusat layanan</p>
        <h1 className="text-2xl font-semibold tracking-tight text-text-main md:text-3xl">Layanan Masuk</h1>
        <p className="max-w-3xl text-sm leading-6 text-text-muted">
          Akses halaman layanan dari satu tempat. Login web dan koneksi API adalah dua hal berbeda;
          halaman ini tidak mengambil kata sandi, cookie, atau sesi dari layanan lain.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {services.map((service) => (
          <article key={service.id} className="rounded-2xl border border-border-subtle bg-surface-1 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-text-main">{service.name}</h2>
                <span className="inline-flex rounded-full border border-border-subtle px-2.5 py-1 text-xs text-text-muted">
                  {service.type}
                </span>
              </div>
              <span className="material-symbols-outlined text-2xl text-primary" aria-hidden="true">open_in_new</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-text-muted">{service.description}</p>
            <a
              href={service.loginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Buka halaman masuk
              <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_outward</span>
            </a>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-border-subtle bg-surface-2 p-5">
        <h2 className="font-semibold text-text-main">Hubungkan ke Max Router</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          Untuk memakai Claude di dalam Max Router, gunakan koneksi penyedia/OAuth yang tersedia atau
          endpoint API resmi beserta API key yang sah. Membuka claude.ai/login tidak otomatis membuat
          koneksi API dan tidak menyalin sesi browser ke server Max Router.
        </p>
        <Link href="/dashboard/providers" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          Buka pengaturan penyedia
          <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span>
        </Link>
      </section>
    </main>
  );
}
