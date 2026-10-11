/**
 * E2E tingkat API terhadap server nyata. CATATAN: belum pernah dijalankan (butuh Next, Prisma, Postgres+PostGIS
 * asli). Prasyarat: `pnpm db:deploy` dan `pnpm db:seed` (platform "instagram"), lalu `pnpm --filter @social-finder/web test:e2e`.
 */
import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from "@playwright/test";

const ORIGIN = "http://localhost:3000";
const RUN = Math.random().toString(16).slice(2, 8);
const PASSWORD = "kata-sandi-e2e-yang-panjang-1";
const FORBIDDEN = ["@e2e.test", "latitude", "longitude", "geography", "passwordHash", "userId", "1.1234", "104.1234"];

interface Actor {
  api: APIRequestContext;
  username: string;
}

const post = (api: APIRequestContext, url: string, data: unknown) =>
  api.post(url, { data, headers: { Origin: ORIGIN } });
const patch = (api: APIRequestContext, url: string, data: unknown) =>
  api.patch(url, { data, headers: { Origin: ORIGIN } });
const put = (api: APIRequestContext, url: string, data: unknown) =>
  api.put(url, { data, headers: { Origin: ORIGIN } });
const del = (api: APIRequestContext, url: string) => api.delete(url, { headers: { Origin: ORIGIN } });

async function signUp(playwright: PlaywrightWorkerArgs["playwright"], name: string, baseURL: string): Promise<Actor> {
  const username = `e2e_${name}_${RUN}`;
  const email = `${username}@e2e.test`;
  const api = await playwright.request.newContext({ baseURL });
  expect((await post(api, "/api/auth/register", { email, username, password: PASSWORD })).status()).toBe(201);
  expect((await post(api, "/api/auth/login", { email, password: PASSWORD })).ok()).toBe(true);
  return { api, username };
}

async function names(actor: Actor, query: string): Promise<string[]> {
  const res = await actor.api.get(`/api/search?${query}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { data: Array<{ username: string }> };
  return body.data.map((d) => d.username);
}

test.describe.configure({ mode: "serial" });

let alice: Actor;
let bob: Actor;

test.beforeAll(async ({ playwright, baseURL }) => {
  const base = baseURL ?? ORIGIN;
  alice = await signUp(playwright, "alice", base);
  bob = await signUp(playwright, "bob", base);
});

test("tanpa login: endpoint terlindungi menjawab 401", async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL: baseURL ?? ORIGIN });
  for (const url of ["/api/search?q=ab", "/api/me", "/api/me/privacy", "/api/blocks", `/api/users/${alice.username}`]) {
    expect((await anon.get(url)).status(), url).toBe(401);
  }
});

test("CSRF: mutasi tanpa Origin ditolak 403", async () => {
  const res = await alice.api.post("/api/blocks", { data: { username: bob.username } });
  expect(res.status()).toBe(403);
});

test("validasi query pencarian ketat", async () => {
  for (const q of ["", "q=a", "radiusKm=0", "sort=distance&q=ab", "q=ab&q=cd", "q=ab&hack=1", "q=a%25"]) {
    expect((await alice.api.get(`/api/search?${q}`)).status(), q).toBe(400);
  }
});

test("default aman: pengguna baru tidak bisa ditemukan sampai mengaktifkan sendiri", async () => {
  expect(await names(bob, `q=${alice.username}`)).toEqual([]);
  const privacy = (await (await alice.api.get("/api/me/privacy")).json()) as { data: { isDiscoverable: boolean; locationVisibility: string } };
  expect(privacy.data.isDiscoverable).toBe(false);
  expect(privacy.data.locationVisibility).toBe("PRIVATE");
});

test("discoverable butuh saklar DAN minimal satu akun sosmed discoverable", async () => {
  expect((await patch(alice.api, "/api/me/privacy", { isDiscoverable: true })).ok()).toBe(true);
  expect(await names(bob, `q=${alice.username}`)).toEqual([]); // belum ada akun sosmed
  const created = await post(alice.api, "/api/me/social-accounts", { platformKey: "instagram", username: `ig_${alice.username}` });
  expect(created.status()).toBe(201);
  const account = (await created.json()) as { data: { id: string } };
  expect((await patch(alice.api, `/api/me/social-accounts/${account.data.id}`, { isDiscoverable: true })).ok()).toBe(true);
  expect(await names(bob, `q=${alice.username}`)).toEqual([alice.username]);
});

test("hasil pencarian tidak memuat id, email, atau koordinat", async () => {
  const res = await bob.api.get(`/api/search?q=${alice.username}`);
  const text = await res.text();
  for (const forbidden of FORBIDDEN) expect(text.includes(forbidden), forbidden).toBe(false);
  expect(/[0-9a-f]{8}-[0-9a-f]{4}-/.test(text)).toBe(false);
  expect(res.headers()["cache-control"]).toBe("no-store");
});

test("profil publik: pengguna tak ada dan pengguna yang menonaktifkan pencarian username sama-sama 404 identik", async () => {
  expect((await bob.api.get(`/api/users/${alice.username}`)).status()).toBe(200); // alice discoverable
  expect((await patch(alice.api, "/api/me/privacy", { searchableByUsername: false })).ok()).toBe(true);
  const notSearchable = await bob.api.get(`/api/users/${alice.username}`);
  const missing = await bob.api.get(`/api/users/e2e_tidak_ada_${RUN}`);
  expect(notSearchable.status()).toBe(404);
  expect(missing.status()).toBe(404);
  const x = ((await notSearchable.json()) as { error: { code: string; message: string } }).error;
  const y = ((await missing.json()) as { error: { code: string; message: string } }).error;
  expect({ code: x.code, message: x.message }).toEqual({ code: y.code, message: y.message });
  expect((await patch(alice.api, "/api/me/privacy", { searchableByUsername: true })).ok()).toBe(true);
});

test("lokasi: koordinat mentah tidak pernah dikembalikan; jarak hanya dibulatkan", async () => {
  const body = { latitude: 1.123456, longitude: 104.123456, accuracyLevel: "AREA", visibility: "DISCOVERABLE_RADIUS", areaLabel: "Sekupang", cityLabel: "Batam" };
  for (const actor of [alice, bob]) {
    const res = await put(actor.api, "/api/me/location", body);
    expect(res.ok()).toBe(true);
    const text = await res.text();
    expect(/1\.123456|104\.123456|latitude|longitude/.test(text)).toBe(false);
  }
  const res = await bob.api.get("/api/search?radiusKm=5");
  const text = await res.text();
  expect(/1\.1234|104\.1234|latitude|longitude/.test(text)).toBe(false);
  const found = ((JSON.parse(text) as { data: Array<{ username: string; area?: string; distanceKm?: number }> }).data).find((d) => d.username === alice.username);
  expect(found?.area).toBe("Sekupang");
  expect(found?.distanceKm).toBe(1); // titik sama: jarak minimum yang ditampilkan
});

test("visibilitas PRIVATE menyembunyikan area dan jarak", async () => {
  expect((await patch(alice.api, "/api/me/location", { visibility: "PRIVATE" })).ok()).toBe(true);
  const found = ((await (await bob.api.get(`/api/search?q=${alice.username}`)).json()) as { data: Array<Record<string, unknown>> }).data[0];
  expect(found?.["area"]).toBeUndefined();
  expect(found?.["distanceKm"]).toBeUndefined();
  expect(await names(bob, "radiusKm=5")).toEqual([]);
});

test("blokir berlaku dua arah dan bisa dicabut; username tak ada tidak membocorkan apa pun", async () => {
  // Kontrol positif: bob juga discoverable, jadi alice memang bisa melihatnya sebelum ada blokir.
  expect((await patch(bob.api, "/api/me/privacy", { isDiscoverable: true })).ok()).toBe(true);
  const ig = await post(bob.api, "/api/me/social-accounts", { platformKey: "instagram", username: `ig_${bob.username}` });
  const igId = ((await ig.json()) as { data: { id: string } }).data.id;
  expect((await patch(bob.api, `/api/me/social-accounts/${igId}`, { isDiscoverable: true })).ok()).toBe(true);
  expect(await names(alice, `q=${bob.username}`)).toEqual([bob.username]);
  expect(await names(bob, `q=${alice.username}`)).toEqual([alice.username]);

  expect((await post(bob.api, "/api/blocks", { username: alice.username })).ok()).toBe(true);
  expect(await names(bob, `q=${alice.username}`)).toEqual([]);
  expect(await names(alice, `q=${bob.username}`)).toEqual([]); // dua arah: alice juga tidak melihat bob

  const ghost = await post(bob.api, "/api/blocks", { username: `e2e_tidak_ada_${RUN}` });
  expect(ghost.status()).toBe(200);
  expect(await ghost.json()).toEqual({ ok: true });

  expect((await del(bob.api, `/api/blocks/${alice.username}`)).ok()).toBe(true);
  expect(await names(bob, `q=${alice.username}`)).toEqual([alice.username]);
  expect(await names(alice, `q=${bob.username}`)).toEqual([bob.username]);
});

test("laporan: respons sama untuk target nyata, tak ada, dan laporan ganda", async () => {
  const real = await post(bob.api, "/api/reports", { username: alice.username, reason: "SPAM" });
  const again = await post(bob.api, "/api/reports", { username: alice.username, reason: "SPAM" });
  const ghost = await post(bob.api, "/api/reports", { username: `e2e_tidak_ada_${RUN}`, reason: "SPAM" });
  for (const res of [real, again, ghost]) {
    expect(res.status()).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  }
  expect((await post(bob.api, "/api/reports", { username: bob.username, reason: "SPAM" })).status()).toBe(400);
});

test("logout mencabut sesi", async () => {
  expect((await post(alice.api, "/api/auth/logout", {})).ok()).toBe(true);
  expect((await alice.api.get("/api/me")).status()).toBe(401);
});
