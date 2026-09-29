# Deteksi Kuota Multiver

Multiver memiliki dua tingkat informasi kuota:

1. **Kuota presisi** — jika provider memiliki usage/quota service yang menghasilkan data normalisasi seperti remainingPercentage dan resetAt.
2. **Kesehatan runtime** — jika provider tidak menyediakan endpoint kuota yang bisa dipastikan, Multiver menggunakan cooldown, model lock, backoff, dan error quota/rate-limit yang benar-benar terjadi.

Endpoint: GET /api/providers/quota-status

Endpoint tidak mengembalikan API key, access token, refresh token, atau isi providerSpecificData. Hanya metadata aman untuk routing/monitoring.

Status:
- healthy — tidak ada sinyal kuota/cooldown aktif.
- limited — provider/account sedang cooldown, model terkunci, atau error menunjukkan rate limit/quota.
- exhausted — data quota presisi menyatakan sisa 0%.
- exact membedakan data provider yang benar-benar memiliki persentase sisa dari status runtime.

Smart Combo tetap tidak mengarang persentase kuota. Fallback runtime adalah sumber kebenaran ketika request benar-benar dikirim ke provider.
