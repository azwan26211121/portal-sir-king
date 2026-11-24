# Idea Konsep: Satu Platform Panduan Pembelajaran, Latihan Teori & SOP Latihan

**Fokus Utama:** Satu platform bersepadu untuk panduan pembelajaran berstruktur, latihan teori melalui **Google Form** yang boleh diakses oleh website, dan SOP latihan bengkel mengikut tahap serta peranan pengguna yang jelas.

---

## 1. Gambaran Keseluruhan Konsep

Platform ini menyatukan tiga komponen utama dalam satu ruang kerja:
1. **Panduan Pembelajaran & Nota (Dikosongkan Lalai — Muat Naik Word & PDF):** Semua ruang nota dan panduan soalan dibiarkan kosong pada awalnya supaya pengajar/admin boleh memuat naik dokumen rasmi dalam format **Word** (`.doc` / `.docx`) dan **PDF** (`.pdf`) mengikut folder (**`TEORI/`** dan **`AMALI/`**).
2. **Latihan Melalui Google Form (Akses Terus dari Website):** Latihan disediakan melalui **Google Form** yang dipautkan atau dibenamkan (*embed* / pautan akses terus) supaya pelatih boleh menjawab latihan secara langsung dari website.
3. **SOP Latihan:** Ruang panduan langkah kerja amali, peraturan keselamatan bengkel (LOTO, PCD, PPE), dan senarai semak pelaksanaan latihan yang boleh dikemas kini dan diakses mengikut folder **`AMALI/`**.

---

## 2. Aliran Pengalaman Pengguna (Selepas Log Masuk)

* **Gerbang Pendaftaran & Log Masuk:**
  * Pengguna mendaftar atau log masuk terlebih dahulu.
  * **Pelatih** dan **Pengajar** menggunakan **PIN akses 6 digit** serta memilih **Nama Guru** penyelia semasa pendaftaran/akses pelatih.
  * Permohonan pelatih berstatus **Menunggu Kelulusan (`pending`)** sehingga **diapprove** oleh pengajar yang dipilih.
  * **Admin Website** log masuk menggunakan akaun pentadbir (`azwan26211121@gmail.com` dengan kata laluan `Adamputeri@5`) untuk akses pengurusan penuh.
* **Paparan Berperingkat Selepas Log Masuk:**
  1. **Pilih Topik / Tahap:** Pelatih melihat topik/tahap yang selaras dengan pendaftaran yang diluluskan sahaja, manakala Pengajar dan Admin boleh memilih semua topik/tahap.
  2. **Pilih Bahagian (`Teori`, `Amali & SOP`, atau `Latihan`):** Memfokuskan tujuan pembelajaran semasa.
  3. **Pilih CU / Tajuk Khusus:** Senarai CU dipaparkan, dan kandungan hanya dibuka selepas CU tertentu dipilih:
     * **Nota & Panduan Soalan:** Dibiarkan kosong secara lalai; memaparkan status kosong sehingga fail **Word** atau **PDF** dimuat naik.
     * **Latihan:** Menyediakan akses terus ke **Google Form** latihan yang berkaitan dengan topik/CU tersebut di dalam website.

---

## 3. Tiga Peranan Pengguna & Tanggungjawab

| Peranan | Hak & Aliran Kerja Utama |
| :--- | :--- |
| **Pelatih** | Mengakses topik/CU mengikut tahap yang diluluskan oleh pengajar pilihan; menyemak fail nota/panduan **Word** & **PDF** yang dimuat naik (jika ada), mengakses latihan **Google Form** melalui website, dan menyemak SOP latihan (`AMALI/`). |
| **Pengajar** | Meluluskan (`approve`) atau mengurus permohonan pelatih di bawah penyeliaan; mengemaskini PIN akses 6 digit; mengakses semua topik; memuat naik fail nota/panduan **Word** & **PDF**, menetapkan pautan **Google Form**, serta mengurus modul/SOP. |
| **Admin Website** | Mengubah dan mengurus semua ruang nota (kosong/muat naik Word & PDF), topik CU, pautan latihan **Google Form**, langkah/dokumen SOP latihan, nama guru, peranan pengguna, status kelulusan, serta mengedit semua data pengguna. |

---

## 4. Struktur Kandungan Mengikut Folder (`TEORI/` & `AMALI/`)

Setiap tahap/topik dipecahkan kepada dua folder utama supaya bahan pembelajaran, latihan Google Form, dan SOP latihan tidak bercampur:

```text
Platform_Panduan_Latihan_SOP/
├── [Tahap_atau_Topik_1]/
│   ├── TEORI/
│   │   ├── Nota_Pembelajaran.pdf / .docx   [Kosong lalai — sedia dimuat naik]
│   │   ├── Panduan_Soalan.pdf / .docx       [Kosong lalai — sedia dimuat naik]
│   │   └── Latihan_Google_Form              [Pautan / Embed Google Form di website]
│   └── AMALI/
│       ├── Panduan_SOP_Latihan.pdf / .docx  [Kosong lalai — sedia dimuat naik]
│       └── Senarai_Semak_Keselamatan_SOP    [Sedia dikemas kini / diakses]
└── [Tahap_atau_Topik_2]/
    ├── TEORI/
    └── AMALI/
```

---

## 5. Ciri Kemudahan Tambahan yang Dicadangkan

* **Pengurusan Slot Kosong & Muat Naik Fail:** Setiap CU mempunyai slot nota dan panduan soalan yang kosong pada awalnya dengan butang muat naik fail **Word** (`.doc`/`.docx`) dan **PDF** (`.pdf`) serta fungsi ganti/padam fail.
* **Integrasi Google Form dalam Website:** Setiap latihan boleh dibuka secara terus melalui paparan *embed* atau pautan latihan **Google Form** yang dikaitkan dengan topik/CU tanpa pelatih perlu mencari pautan secara manual.
* **Carian Pantas & Penjejakan Akses:** Mencari tajuk CU, dokumen Word/PDF, latihan Google Form, dan SOP latihan dengan pantas serta memantau status penyediaan bahan dan akses latihan.