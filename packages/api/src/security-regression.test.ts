/**
 * Tes regresi keamanan STATIS: memindai kode sumber untuk menjaga aturan yang gampang tak sengaja
 * dilanggar saat menambah fitur. Bukan pengganti tes perilaku; ini jaring pengaman murah.
 * Bila tes ini gagal setelah Anda menambah route/skema, perbaiki kodenya, bukan daftar pengecualian,
 * kecuali pengecualian itu memang benar dan dijelaskan di komentar.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist" || name === "_superseded") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const rel = (file: string) => relative(ROOT, file).split(sep).join("/");
const read = (file: string) => readFileSync(file, "utf8");

const isTest = (f: string) => /\.(test|spec)\.ts$/.test(f) || f.includes("/integration/") || f.endsWith("fixtures.ts");
const sourceFiles = [...walk(join(ROOT, "packages")), ...walk(join(ROOT, "apps"))]
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .filter((f) => !isTest(rel(f)) && !rel(f).includes("/e2e/"));
/** Skrip CLI dev (dijalankan manual di terminal), bukan kode server: boleh mencetak ke konsol. */
const CLI_SCRIPTS = new Set(["packages/database/prisma/seed.ts"]);
const serverFiles = sourceFiles.filter((f) => !CLI_SCRIPTS.has(rel(f)));
const routeFiles = walk(join(ROOT, "apps", "web", "app", "api")).filter((f) => f.endsWith("route.ts"));

/** Route publik (tanpa sesi). Menambah baris di sini = keputusan keamanan yang harus disengaja. */
const PUBLIC_ROUTES = new Set([
  "apps/web/app/api/auth/register/route.ts",
  "apps/web/app/api/auth/login/route.ts",
  "apps/web/app/api/auth/password-reset/request/route.ts",
  "apps/web/app/api/auth/password-reset/confirm/route.ts",
  "apps/web/app/api/auth/email/verify/route.ts",
  "apps/web/app/api/health/route.ts",
  "apps/web/app/api/platforms/route.ts",
]);
/** Tanpa handleRequest: liveness publik tanpa sesi/Origin/body (batas "longgar" di kontrak API). */
const NO_WRAPPER = new Set(["apps/web/app/api/health/route.ts"]);
/**
 * Tanpa requireUser karena memang bekerja langsung dari cookie sesi: logout idempoten, tanpa sesi
 * valid hanya mengosongkan cookie. Tetap lewat handleRequest (cek Origin).
 */
const NO_USER_GUARD = new Set(["apps/web/app/api/auth/logout/route.ts"]);
const METHOD_RE = /export async function (GET|POST|PUT|PATCH|DELETE)\(/g;

describe("route handler", () => {
  it("ada route yang dipindai (tes ini tidak boleh kosong)", () => {
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  it("semua route memakai handleRequest dan force-dynamic", () => {
    for (const file of routeFiles) {
      const src = read(file);
      if (!NO_WRAPPER.has(rel(file))) expect(`${rel(file)}: ${src.includes("handleRequest(")}`).toBe(`${rel(file)}: true`);
      expect(src.includes('export const dynamic = "force-dynamic"')).toBe(true);
    }
  });

  it("route non-publik memakai requireUser di setiap handler", () => {
    for (const file of routeFiles) {
      if (PUBLIC_ROUTES.has(rel(file)) || NO_USER_GUARD.has(rel(file))) continue;
      const src = read(file);
      const handlers = [...src.matchAll(METHOD_RE)].length;
      const guards = [...src.matchAll(/requireUser\(request, ctx\.env\)/g)].length;
      expect(`${rel(file)}: ${guards}/${handlers}`).toBe(`${rel(file)}: ${handlers}/${handlers}`);
    }
  });

  it("route publik memang hanya yang terdaftar dan semuanya benar-benar ada", () => {
    const existing = new Set(routeFiles.map(rel));
    for (const publicRoute of PUBLIC_ROUTES) expect(existing.has(publicRoute)).toBe(true);
  });

  it("flag mutation sesuai metode: GET false; POST/PUT/PATCH/DELETE true", () => {
    for (const file of routeFiles) {
      if (NO_WRAPPER.has(rel(file))) continue;
      const src = read(file);
      const parts = src.split(METHOD_RE); // [pre, METHOD, body, METHOD, body, ...]
      for (let i = 1; i < parts.length; i += 2) {
        const method = parts[i];
        const body = parts[i + 1] ?? "";
        const match = /handleRequest\(request, \{ mutation: (true|false) \}/.exec(body);
        const expected = method === "GET" ? "false" : "true";
        expect(`${rel(file)} ${method}: ${match?.[1]}`).toBe(`${rel(file)} ${method}: ${expected}`);
      }
    }
  });

  it("route tidak mengambil id pengguna dari URL/body untuk resource milik sendiri", () => {
    for (const file of routeFiles) {
      const src = read(file);
      expect(/userId\s*[:=]\s*(?:input|params|body|searchParams)/.test(src)).toBe(false);
    }
  });
});

describe("SQL mentah", () => {
  const UNSAFE_ALLOWED = new Set([
    // Teks SQL statis dari konstanta; nilai selalu terikat ($n). Lihat komentar di file.
    "packages/api/src/modules/search/prisma-search-repository.ts",
  ]);

  it("$queryRawUnsafe/$executeRawUnsafe hanya di file yang diizinkan", () => {
    for (const file of sourceFiles) {
      if (/\$(queryRaw|executeRaw)Unsafe/.test(read(file))) {
        expect(UNSAFE_ALLOWED.has(rel(file))).toBe(true);
      }
    }
  });

  it("SQL pencarian: nilai pengguna tidak pernah disambung ke teks (hanya $n lewat bind)", () => {
    const src = read(join(ROOT, "packages/api/src/modules/search/search-sql.ts"));
    // Satu-satunya interpolasi ${...} yang boleh berisi nilai terikat adalah hasil bind()/ekspresi SQL
    // lokal. Parameter fungsi `criteria` tidak boleh muncul langsung di dalam template string SQL.
    const templates = src.match(/`[^`]*`/g) ?? [];
    for (const template of templates) {
      expect(/\$\{\s*criteria\./.test(template)).toBe(false);
      expect(/\$\{\s*(text|mode|userId|searcherId)\s*\}/.test(template)).toBe(false);
    }
  });
});

describe("skema validasi request", () => {
  it("setiap z.object di skema request memakai .strict() (anti mass assignment)", () => {
    const files = walk(join(ROOT, "packages", "validation", "src")).filter(
      (f) => f.endsWith(".ts") && !isTest(rel(f)),
    );
    for (const file of files) {
      const src = read(file);
      const objects = [...src.matchAll(/z\s*\.object\(/g)].length;
      const stricts = [...src.matchAll(/\.strict\(\)/g)].length;
      expect(`${rel(file)}: ${stricts >= objects}`).toBe(`${rel(file)}: true`);
    }
  });
});

describe("logging dan jenis tipe", () => {
  it("tidak ada console.log/info/debug di kode produksi", () => {
    for (const file of serverFiles) {
      expect(`${rel(file)}: ${/console\.(log|info|debug)\(/.test(read(file))}`).toBe(`${rel(file)}: false`);
    }
  });

  it("console.error hanya dengan JSON statis atau nama error (tanpa objek error / pesan)", () => {
    for (const file of serverFiles) {
      const lines = read(file).split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("console.error(")) return;
        // prettier bisa memecah argumen ke baris berikutnya
        const call = [line, lines[i + 1] ?? ""].join(" ");
        expect(`${rel(file)}: ${line.trim()}`).toBe(
          `${rel(file)}: ${/console\.error\(\s*JSON\.stringify\(/.test(call) ? line.trim() : "JSON.stringify(...)"}`,
        );
      });
    }
  });

  it("tidak ada any eksplisit, @ts-ignore, atau @ts-nocheck di kode produksi", () => {
    for (const file of sourceFiles) {
      const src = read(file);
      expect(`${rel(file)}: ${/:\s*any\b|<any>|\bas any\b|@ts-ignore|@ts-nocheck/.test(src)}`).toBe(`${rel(file)}: false`);
    }
  });

  it("log query Prisma tidak diaktifkan (parameter lokasi bisa bocor ke log)", () => {
    const src = read(join(ROOT, "packages/database/src/client.ts"));
    expect(/["']query["']/.test(src.replace(/\/\/.*$/gm, ""))).toBe(false);
  });
});

describe("DTO publik", () => {
  const types = read(join(ROOT, "packages/types/src/index.ts"));
  const blocks = [...types.matchAll(/export interface (\w+Dto)\s*\{([\s\S]*?)\n\}/g)];

  // Hanya milik pengguna sendiri (bukan publik) yang boleh memuat email/id.
  const OWN_DATA = new Set(["MeDto", "SocialAccountDto"]);
  const FORBIDDEN = /\b(email|passwordHash|latitude|longitude|geography|tokenHash|ipHash|deletedAt|normalizedUsername)\b\s*[?:]/;

  it("ada DTO yang dipindai", () => {
    expect(blocks.length).toBeGreaterThan(6);
  });

  it("tidak ada DTO yang memuat field terlarang (kecuali daftar eksplisit milik sendiri)", () => {
    for (const block of blocks) {
      const name = block[1] ?? "";
      const body = (block[2] ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      if (name === "MeDto") continue; // MeDto memuat email milik sendiri; dijaga tes profil
      expect(`${name}: ${FORBIDDEN.test(body)}`).toBe(`${name}: false`);
    }
    expect(OWN_DATA.has("MeDto")).toBe(true);
  });

  it("DTO publik hasil pencarian tidak memuat id apa pun", () => {
    for (const name of ["SearchResultDto", "SearchAccountDto", "BlockedUserDto"]) {
      const block = blocks.find((b) => b[1] === name);
      expect(block).toBeDefined();
      expect(/\bid\b\s*[?:]|userId/.test(block?.[2] ?? "")).toBe(false);
    }
  });
});

describe("header keamanan web", () => {
  const config = read(join(ROOT, "apps/web/next.config.ts"));
  const middleware = read(join(ROOT, "apps/web/middleware.ts"));

  it("CSP halaman dikirim per request oleh middleware (bernonce), bukan statis di next.config", () => {
    expect(/Content-Security-Policy"?,?\s*value:\s*csp/.test(config)).toBe(false);
    expect(middleware.includes("generateNonce()")).toBe(true);
    expect(middleware.includes("x-nonce")).toBe(true);
  });

  it("respons API memakai CSP yang menolak semuanya", () => {
    expect(config.includes("default-src 'none'; frame-ancestors 'none'")).toBe(true);
  });

  it("header statis wajib tetap ada", () => {
    for (const header of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
      expect(config.includes(header)).toBe(true);
    }
  });

  it("CSP tidak pernah mengizinkan skrip inline atau eval di production", () => {
    const csp = read(join(ROOT, "apps/web/lib/csp.ts"));
    expect(/scriptSrc = \[[^\]]*unsafe-inline/.test(csp)).toBe(false);
    expect(/if \(!isProd\) scriptSrc\.push\("'unsafe-eval'"\)/.test(csp)).toBe(true);
  });
});
