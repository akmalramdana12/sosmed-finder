#!/usr/bin/env bash
# Tampilkan email dev terakhir (tautan verifikasi/reset) bila SMTP_URL tidak diisi.
grep -A4 "\[DEV MAIL\]" /tmp/web.log | tail -n 30
