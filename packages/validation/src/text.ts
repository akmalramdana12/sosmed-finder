/**
 * Pembersihan teks bebas dari pengguna (nama tampilan, bio) sebelum disimpan.
 * Menghapus karakter kontrol, kontrol bidi (spoofing tampilan), dan zero-width tak terlihat.
 * React sudah meng-escape output; ini lapisan tambahan terhadap spoofing dan data kotor.
 */

function isAllowed(code: number, allowNewline: boolean): boolean {
  if (code === 9 || code === 10) return allowNewline;
  if (code < 32 || code === 127) return false; // C0 + DEL
  if (code >= 0x80 && code <= 0x9f) return false; // C1
  if (code >= 0x202a && code <= 0x202e) return false; // bidi embedding/override
  if (code >= 0x2066 && code <= 0x2069) return false; // bidi isolate
  if (code === 0x200b || code === 0x2060 || code === 0xfeff) return false; // zero-width tak terlihat
  return true;
}

function strip(value: string, allowNewline: boolean): string {
  let output = "";
  for (const char of value.normalize("NFC")) {
    const code = char.codePointAt(0);
    if (code !== undefined && isAllowed(code, allowNewline)) output += char;
  }
  return output;
}

/** Satu baris: newline/tab menjadi spasi, spasi berurutan diringkas, di-trim. */
export function cleanSingleLine(value: string): string {
  return strip(value.replace(/[\t\n\r]+/g, " "), false)
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Banyak baris: CRLF dinormalisasi, maksimal satu baris kosong berurutan, di-trim. */
export function cleanMultiLine(value: string): string {
  return strip(value.replace(/\r\n?/g, "\n"), true)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
