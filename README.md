# jalanMY · Johor

Prototaip aplikasi peta Johor: MapLibre + OpenStreetMap, dengan sambungan enjin laluan Valhalla. Antara muka Bahasa Melayu dan sesuai untuk telefon. Ini asas pembangunan, belum aplikasi navigasi untuk kegunaan memandu sebenar.

## Mula

Gunakan Node.js 22.12 atau lebih baharu.

```sh
npm ci
npm run dev
```

Buka alamat localhost yang dipaparkan. GPS memerlukan izin pengguna dan HTTPS atau localhost. Pada telefon gunakan hos HTTPS; localhost komputer tidak boleh dicapai terus daripada telefon.

## Apa yang sudah ada

- Peta jalan sebenar dengan atribusi OpenStreetMap.
- Carian setempat dalam 10 tempat percubaan (koordinat anggaran, bukan pangkalan data alamat lengkap).
- Klik peta untuk pilih destinasi; GPS untuk titik mula.
- Kelajuan GPS apabila peranti membekalkan bacaan; had laju belum disambungkan dan dipaparkan sebagai —.
- Laporan roadblock, speed trap, kemalangan, banjir, jalan tutup dan halangan pada GPS terkini.
- Laporan disimpan dalam localStorage peranti sahaja, luput 1 jam selepas dihantar/disemak; tiada pengguna lain menerima laporan ini. “Masih ada” memperbaharui laporan tempatan, bukan undian komuniti.
- Paparan laluan kereta dan anggaran masa/jarak apabila pelayan Valhalla dikonfigurasi.

## Sambungkan laluan sebenar

1. Sediakan Valhalla dengan data OSM Johor atau Malaysia. Panduan rasmi: https://valhalla.github.io/valhalla/ dan https://github.com/valhalla/valhalla . Data: https://download.geofabrik.de/asia/malaysia-singapore-brunei.html .
2. Salin `.env.example` kepada `.env.local` dan isi `VITE_VALHALLA_URL=https://pelayan-anda.example/` dengan URL asas sebenar yang menyediakan `/route`. Benarkan CORS untuk origin aplikasi.
3. Mulakan semula aplikasi. Pilih destinasi, dapatkan GPS di kawasan Johor, kemudian tekan **Kira laluan**.

Tiada pelayan routing awam dipanggil secara lalai. Aplikasi tidak menghasilkan laluan palsu apabila pelayan belum disambungkan. Pelayan perlu menyokong respons Valhalla `trip`, `polyline6` dan costing `auto`. Pilihan elak tol ialah `use_tolls=0`, satu keutamaan, bukan jaminan mengelak semua tol. Lokasi mula dan destinasi dihantar kepada pelayan laluan hanya apabila butang kira laluan ditekan. Jangan masukkan token rahsia dalam pemboleh ubah `VITE_`, kerana nilainya boleh dibaca pengguna.

## Had versi ini

Tiada trafik langsung, mod motosikal, navigasi suara, rerouting automatik, padanan GPS pada jalan, amaran kedekatan, had laju, log masuk atau laporan bersama. Kotak liputan Johor adalah anggaran; sempadan pentadbiran tepat dan kemungkinan laluan merentasi sempadan perlu ditambah sebelum pelancaran. Hanya satu laluan dikira. Perjalanan ketika GPS bergerak tidak mengemas kini laluan secara automatik. Bacaan GPS boleh kurang tepat.

Peta menggunakan tile awam OSM untuk ujian kecil, tanpa muat turun offline/prefetch. Sebelum pelancaran awam, gunakan pembekal tile atau hos sendiri dan semak polisi https://operations.osmfoundation.org/policies/tiles/ . Data OSM mempunyai lesen ODbL dan memerlukan atribusi. Tiada penggunaan API Nominatim awam. Fon dimuat daripada Google Fonts dan tile peta dihantar kepada OSM; penyedia itu menerima permintaan biasa pelayar. GPS dan laporan disimpan di pelayar sahaja sehingga permintaan laluan dihantar. Pelayan laluan yang dipilih turut menerima alamat IP dan koordinat perjalanan.

## Semakan dan binaan

```sh
npm test
npm run build
npm run preview
```

GitHub Actions menjalankan ujian dan binaan setiap push/PR. Ujian meliputi luput dan penapisan laporan, kelajuan GPS tidak diketahui, geometri laluan dan kotak liputan.

## GitHub

Repositori: https://github.com/AmexSaad/jalanmy . Untuk sambungkan salinan tempatan:

```sh
git remote add origin https://github.com/AmexSaad/jalanmy.git
git push -u origin main
```

Belum ada lesen kod dipilih; pilih lesen sebelum menggalakkan penggunaan semula awam. Memuat naik kod ke GitHub tidak menerbitkan aplikasi sebagai laman web.

## Peringkat seterusnya

1. Hos Valhalla dan data Johor; semak laluan JB–Kulai, JB–Pasir Gudang dan perjalanan antara daerah.
2. Sambungkan carian tempat berlesen melalui penyedia atau pelayan sendiri.
3. Tambah pelayan laporan, had kadar, pengesahan pengguna, luput dan moderasi.
4. Uji laluan motosikal, data had laju dan arahan suara pada peranti sebenar.
5. Nilai sumber trafik sebelum menjanjikan masa tiba berasaskan trafik.
