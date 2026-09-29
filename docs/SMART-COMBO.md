# Multiver Smart Combo

Multiver Smart Combo adalah strategi combo yang mengambil pola fallback bertingkat seperti 9Router, tetapi menambahkan analisis deterministik sebelum model dipanggil.

## Alur

```text
Request
  ↓
Analisis request
  ├─ perkiraan token input
  ├─ jumlah pesan
  ├─ jumlah tools
  ├─ multimodal
  └─ tipe tugas: general/coding/analysis/writing
  ↓
Filter / ranking kandidat
  ├─ capability input
  ├─ context window
  ├─ tools
  ├─ tier
  └─ prioritas combo
  ↓
Model dengan skor tertinggi
  ↓ gagal
Fallback cepat
  ├─ context/token limit
  ├─ 401/402/403
  ├─ 408/429/529
  └─ 5xx transient
  ↓
Model berikutnya
  ↓
Berhasil
```

## Tier bawaan

Smart planner memakai empat tier sehingga lebih fleksibel daripada tiga tier dasar:

1. `subscription` — route berbasis langganan/CLI.
2. `standard` — API/gateway umum yang belum diklasifikasikan.
3. `cheap` — route murah.
4. `free` — route gratis/emergency.

Klasifikasi provider hanyalah heuristik. Jangan menganggap tier sebagai fakta harga atau kuota. Tier dapat dioverride lewat `comboSmartRouting.providerTiers` atau `comboSmartRouting.modelTiers`.

## Perbedaan dari fallback biasa

Fallback biasa mempertahankan urutan model.

Smart Combo mengubah urutan hanya untuk request saat ini berdasarkan:

- capability hard seperti vision/PDF/audio/video;
- kecukupan context window;
- dukungan tools;
- kompleksitas request;
- tipe tugas;
- tier;
- posisi asli model sebagai tie-breaker.

Tidak ada panggilan LLM tambahan untuk memilih model.

## Resilience

Smart Combo tetap memakai executor fallback Multiver. Jadi planner bukan pengganti fallback.

Kesalahan request/model yang jelas langsung pindah ke kandidat berikutnya. Error credential 401 sekarang mengunci koneksi, bukan hanya satu model, agar kunci rusak tidak dicoba lagi pada model lain.

## Batasan saat ini

Smart planner belum melakukan probe jaringan ke semua provider sebelum memilih. Status quota/health yang sudah dimiliki executor tetap menjadi sumber kebenaran saat request dieksekusi.

Fallback setelah streaming sudah mulai tidak boleh dianggap aman untuk dipindahkan ke provider lain tanpa buffering/restart. Karena itu Smart Combo melakukan pemilihan sebelum eksekusi dan fallback utama terjadi pada kegagalan yang masih dapat dikembalikan sebagai response.

## Konfigurasi

Contoh:

```json
{
  "comboSmartRouting": {
    "providerTiers": {
      "cc": "subscription",
      "glm": "cheap",
      "xkiro": "free"
    },
    "modelTiers": {
      "provider/model-special": "subscription"
    }
  }
}
```

Per-combo dapat menggunakan:

```json
{
  "comboStrategies": {
    "multiver-smart": {
      "fallbackStrategy": "smart",
      "smartRouting": {
        "providerTiers": {},
        "modelTiers": {}
      }
    }
  }
}
```

## Target desain

Smart Combo tidak menggantikan:

- Fallback;
- Round Robin;
- MAX;
- Fusion;
- Capacity Adapter;
- account fallback;
- token refresh;
- Kiro MITM.

Smart Combo menjadi lapisan pemilih kandidat di depan fallback sehingga satu mekanisme tidak perlu mengambil alih seluruh router.
