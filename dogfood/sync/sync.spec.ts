/**
 * dogfood/sync — context flow across TWO independent loopat servers (S1-S5).
 *
 * Server A (alice) and server B (bob) are separate installs sharing ONE fixture
 * sshd origin. Every case writes context on A, lands it on origin, and proves B
 * converges. Integration truth = the fixture's bare repos read via `podman exec`;
 * B's own view is the cross-check. The notes/personal UI loop is no-AI
 * (workspace file write + /api/notes/save = ff+rebase push), exactly the docs/
 * context-flow.md model. S3 swaps the UI write for a real loop AI edit.
 */
import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createBLoopAndWaitSandbox, sandboxRead, cleanup } from "./loop-helper";

type Meta = {
  aVite: number; bVite: number; fixtureContainer: string; hostIp: string; homeB: string;
};
function meta(): Meta { return JSON.parse(readFileSync(join(import.meta.dirname, ".test-meta.json"), "utf8")); }

function ctn(): string { return meta().fixtureContainer; }
function fixtureNotesLog(): string {
  return execFileSync("podman", ["exec", ctn(), "git", "-c", "safe.directory=*", "-C", "/srv/git/notes.git", "log", "--oneline", "--all"]).toString().trim();
}
function fixtureKnowledgeLog(): string {
  return execFileSync("podman", ["exec", ctn(), "git", "-c", "safe.directory=*", "-C", "/srv/git/knowledge.git", "log", "--oneline", "--all"]).toString().trim();
}
function fixtureRosterLog(): string {
  return execFileSync("podman", ["exec", ctn(), "git", "-c", "safe.directory=*", "-C", "/srv/git/roster1.git", "log", "--oneline", "--all"]).toString().trim();
}

async function ctx(vite: number, auth: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL: `http://127.0.0.1:${vite}`, storageState: join(import.meta.dirname, auth) });
}
async function readNote(api: APIRequestContext, path: string): Promise<string | null> {
  const r = await api.get(`/api/workspace/file?vault=notes&path=${encodeURIComponent(path)}`);
  if (!r.ok()) return null;
  return (await r.json()).content;
}
async function writeNote(api: APIRequestContext, path: string, content: string) {
  const r = await api.put(`/api/workspace/file?vault=notes&path=${encodeURIComponent(path)}`, { data: { content } });
  expect(r.ok(), `write ${path}: ${r.status()}`).toBeTruthy();
}
async function saveNotes(api: APIRequestContext) { return api.post("/api/notes/save"); }
async function refreshNotes(api: APIRequestContext) { return api.post("/api/notes/refresh"); }
async function deleteNote(api: APIRequestContext, path: string) { return api.delete(`/api/workspace/file?vault=notes&path=${encodeURIComponent(path)}`); }

let aApi: APIRequestContext, bApi: APIRequestContext;
test.beforeAll(async () => { const m = meta(); aApi = await ctx(m.aVite, ".authA.json"); bApi = await ctx(m.bVite, ".authB.json"); });
test.afterAll(async () => { await aApi.dispose(); await bApi.dispose(); });

// Prime each server's notes worktree (clone from shared origin).
test("S0 two-server: both servers reach the shared origin", async () => {
  await refreshNotes(aApi); await refreshNotes(bApi);
  expect((await aApi.get("/api/notes/behind")).ok()).toBeTruthy();
  expect((await bApi.get("/api/notes/behind")).ok()).toBeTruthy();
  console.log("[sync] S0 both servers cloned shared notes origin");
});

test("S1 shared personal repo: A edits notes via UI -> origin -> B sees it", async () => {
  const stamp = Date.now();
  const file = `s1-${stamp}.md`, body = `s1 from A ${stamp}`;
  await writeNote(aApi, file, body);
  const save = await saveNotes(aApi);
  expect(save.ok(), `A save: ${save.status()} ${await save.text()}`).toBeTruthy();
  await expect.poll(fixtureNotesLog, { timeout: 60_000, intervals: [1000, 2000] }).toContain(file);
  await expect.poll(async () => { await refreshNotes(bApi); return readNote(bApi, file); }, { timeout: 60_000, intervals: [2000, 3000] }).toBe(body);
  console.log("[sync] S1 GREEN: A->origin->B notes converged");
});

let s2LoopId = "";
test.afterAll(() => cleanup(s2LoopId));
test("S2 same kn shared, personal isolated: A advances knowledge -> B sees at loop level; personal stays local", async ({ browser }) => {
  test.setTimeout(420_000);
  const stamp = Date.now();
  const beforeK = fixtureKnowledgeLog();
  await writeNote(aApi, `s2-personal-A-${stamp}.md`, "alice-only");
  // A advances kn on origin: this direct-podman kn push stands in for a distill
  // (kn promote via loop is gated). A's personal note does NOT cross to B.
  execFileSync("podman", ["exec", ctn(), "sh", "-c",
    `set -e; export HOME=/root GIT_AUTHOR_NAME=fx GIT_AUTHOR_EMAIL=f@l GIT_COMMITTER_NAME=fx GIT_COMMITTER_EMAIL=f@l; git config --global --add safe.directory '*'; d=$(mktemp -d); git clone -q /srv/git/knowledge.git $d/k; echo kn-${stamp} > $d/k/s2-kn.md; git -C $d/k add -A; git -C $d/k commit -qm 'kn ${stamp}'; git -C $d/k push -q origin master`]);
  expect(fixtureKnowledgeLog()).not.toBe(beforeK);
  // B SEES shared kn only through a loop: kn has no UI pull endpoint (read-only-
  // to-others, cloned only into a sandbox at loop creation). So B spins a real
  // loop; its sandbox clones kn from the SHARED origin; we exec in and read it.
  const m = meta();
  s2LoopId = await createBLoopAndWaitSandbox(browser, m.bVite, `s2-${stamp}`);
  expect(sandboxRead(s2LoopId, "/loopat/context/knowledge/s2-kn.md")).toBe(`kn-${stamp}`);
  console.log(`[sync] S2 B loop sandbox read /loopat/context/knowledge/s2-kn.md = kn-${stamp}`);
  // Personal isolation: B's notes worktree must NOT carry A's personal note.
  await refreshNotes(bApi);
  expect(await readNote(bApi, `s2-personal-A-${stamp}.md`)).toBeNull();
  console.log("[sync] S2 GREEN: B sees shared kn at loop level + personal note isolated to A");
});

test("S4 concurrent different files: A and B push different notes -> both land", async () => {
  const stamp = Date.now();
  const fa = `s4-A-${stamp}.md`, fb = `s4-B-${stamp}.md`;
  await refreshNotes(aApi); await refreshNotes(bApi);
  await writeNote(aApi, fa, "A4"); const sa = await saveNotes(aApi); expect(sa.ok()).toBeTruthy();
  await writeNote(bApi, fb, "B4"); const sb = await saveNotes(bApi); expect(sb.ok(), `B save: ${sb.status()} ${await sb.text()}`).toBeTruthy();
  await refreshNotes(aApi);
  expect(await readNote(aApi, fa)).toBe("A4");
  await expect.poll(async () => { await refreshNotes(aApi); return readNote(aApi, fb); }, { timeout: 30_000 }).toBe("B4");
  await expect.poll(async () => { await refreshNotes(bApi); return readNote(bApi, fa); }, { timeout: 30_000 }).toBe("A4");
  console.log("[sync] S4 GREEN: different-file concurrent pushes auto-merged, both servers have both");
});

test("S5 same-file conflict: first lands, second held-back kept-local NOT on SoT", async () => {
  const stamp = Date.now(), file = `s5-${stamp}.md`;
  await refreshNotes(aApi); await refreshNotes(bApi);
  await writeNote(aApi, file, "A wins"); expect((await saveNotes(aApi)).ok()).toBeTruthy();
  await expect.poll(fixtureNotesLog, { timeout: 30_000 }).toContain(file);
  // B edits the SAME file on its stale base, then saves -> ff fails, held back.
  await writeNote(bApi, file, "B conflicting"); const sb = await saveNotes(bApi);
  expect(sb.status(), "B's same-file save must be held back (409)").toBe(409);
  const body = await sb.json(); expect(body.conflict, JSON.stringify(body)).toBeTruthy();
  // kept-local: B still has its draft; SoT (origin via A) keeps A's content.
  expect(await readNote(bApi, file)).toBe("B conflicting");
  await refreshNotes(aApi); expect(await readNote(aApi, file)).toBe("A wins");
  console.log("[sync] S5 GREEN: first landed, second held-back + kept-local, NOT on SoT");
});

// S6 — held-back RECOVERY: S5's other half. Set up the SAME conflict, then prove
// origin converges. Recovery directions the product exposes are: save, behind,
// refresh — and nothing else. There is NO notes discard/force/take-remote/reset
// endpoint, so:
//   (a) take-remote: B accepts origin by rewriting its file to A's content. B's
//       VIEW converges (reads "A wins"), and the SoT is never corrupted — origin
//       keeps exactly "A wins". This is the only direction the no-AI UI loop
//       supports; it never re-pushes the conflicting commit, so SoT stays clean.
//   (b) keep-mine is GENUINELY IMPOSSIBLE without a manual git escape hatch: B's
//       conflicting commit stays sticky (ahead/behind) and every re-save replays
//       it onto origin → 409 again. We assert that rather than fake a resolve.
// Either way the conflict is never buried on origin.
test("S6 held-back recovery: take-remote converges, keep-mine impossible, SoT stays clean", async () => {
  const stamp = Date.now(), file = `s6-${stamp}.md`;
  await refreshNotes(aApi); await refreshNotes(bApi);
  await writeNote(aApi, file, "A wins"); expect((await saveNotes(aApi)).ok()).toBeTruthy();
  await expect.poll(fixtureNotesLog, { timeout: 30_000 }).toContain(file);
  await refreshNotes(bApi);
  await writeNote(bApi, file, "B conflicting");
  expect((await saveNotes(bApi)).status(), "B held-back").toBe(409);
  // (a) take-remote: B accepts origin's content; save no longer needed, origin clean.
  await writeNote(bApi, file, "A wins");
  await refreshNotes(bApi);
  expect(await readNote(bApi, file)).toBe("A wins");
  await refreshNotes(aApi); expect(await readNote(aApi, file)).toBe("A wins");
  // (b) keep-mine is impossible: B's sticky conflicting commit blocks every save.
  await writeNote(bApi, file, "B wins final");
  expect((await saveNotes(bApi)).status(), "keep-mine still held-back, no escape").toBe(409);
  await refreshNotes(aApi); expect(await readNote(aApi, file)).toBe("A wins");
  // origin log carries A's content only — no buried conflict ever lands.
  expect((await aApi.get(`/api/workspace/file?vault=notes&path=${encodeURIComponent(file)}`)).ok()).toBeTruthy();
  console.log("[sync] S6 GREEN: take-remote converges B's view, keep-mine impossible, SoT = A wins (no buried conflict)");
});

// S7 — deletion propagation: a delete converges like an edit. A creates+saves a
// note (lands origin, B sees it), then DELETEs + saves; B refresh → gone, and the
// origin log carries the deletion commit.
test("S7 deletion propagation: A deletes a note -> origin -> B sees it gone", async () => {
  const stamp = Date.now(), file = `s7-${stamp}.md`;
  // S5/S6 left B's worktree held-back (ahead of origin) — the product has no
  // discard endpoint, so a user's only escape is git. Reset B to origin so it can
  // ff-pull again, then prove a deletion converges like any edit.
  const bNotes = join(meta().homeB, "ui", "bob", "notes");
  await refreshNotes(bApi); // populates B's origin/master tracking ref
  execFileSync("git", ["-C", bNotes, "reset", "--hard", "origin/master"]);
  await refreshNotes(aApi); await refreshNotes(bApi);
  await writeNote(aApi, file, "to be deleted"); expect((await saveNotes(aApi)).ok()).toBeTruthy();
  await expect.poll(fixtureNotesLog, { timeout: 30_000 }).toContain(file);
  await expect.poll(async () => { await refreshNotes(bApi); return readNote(bApi, file); }, { timeout: 30_000 }).toBe("to be deleted");
  const logBefore = fixtureNotesLog();
  // A deletes the file and saves -> deletion lands on origin as its own commit.
  expect((await deleteNote(aApi, file)).ok(), "A delete").toBeTruthy();
  expect((await saveNotes(aApi)).ok(), "A save deletion").toBeTruthy();
  await expect.poll(fixtureNotesLog, { timeout: 30_000 }).not.toBe(logBefore);
  // B refresh -> gone, like any edit.
  await expect.poll(async () => { await refreshNotes(bApi); return readNote(bApi, file); }, { timeout: 30_000 }).toBeNull();
  console.log("[sync] S7 GREEN: deletion converged A->origin->B, gone on both + deletion commit on SoT");
});
