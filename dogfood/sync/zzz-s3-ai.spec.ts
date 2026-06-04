/**
 * S3 — AI loop edits context on A, pushes to origin, B sees it. Same convergence
 * as S1 but the writer is a real loop AI instead of the no-AI UI loop, proving
 * the two are isomorphic across servers. Costs one idealab turn → runs last.
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createBLoopAndWaitSandbox, sandboxRead, cleanup, runningContainers } from "./loop-helper";

type Meta = { aVite: number; bVite: number; fixtureContainer: string };
function meta(): Meta { return JSON.parse(readFileSync(join(import.meta.dirname, ".test-meta.json"), "utf8")); }
function fixtureNotesLog(): string {
  return execFileSync("podman", ["exec", meta().fixtureContainer, "git", "-c", "safe.directory=*", "-C", "/srv/git/notes.git", "log", "--oneline", "--all"]).toString().trim();
}

let loopId = "", bLoopId = "";
test.afterAll(() => { cleanup(loopId); cleanup(bLoopId); });

test("S3 AI loop on A edits notes -> origin -> B sees", async ({ page, browser }) => {
  test.setTimeout(420_000);
  const stamp = Date.now(), msg = `s3 ai notes ${stamp}`;
  await page.addInitScript(() => localStorage.setItem("loopat:setupPersonalRepoDismissed", "1"));
  await page.goto("/loop");
  await expect(page.getByRole("button", { name: /^\+?\s*New Loop$/i }).first()).toBeVisible({ timeout: 20_000 });
  const createResp = page.waitForResponse(r => r.url().includes("/api/v1/loops") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /^\+?\s*New Loop$/i }).first().click();
  await expect(page.getByText("New loop", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("combobox").first().selectOption("roster1");
  await page.getByPlaceholder("refactor-gateway").fill(`s3-${stamp}`);
  await page.getByRole("button", { name: "create", exact: true }).click();
  loopId = String((await (await createResp).json()).id ?? "").replace(/^loop_/, "");
  expect(loopId).toMatch(/^[a-f0-9-]+$/);
  await page.getByRole("button", { name: /terminal/ }).first().click();
  await expect.poll(() => runningContainers(loopId), { timeout: 300_000, intervals: [1000, 2000, 5000] }).not.toEqual([]);
  await expect(page.getByText("Preparing this loop’s sandbox…")).toBeHidden({ timeout: 300_000 });

  const composer = page.getByRole("textbox", { name: "Message input" });
  await composer.click();
  await composer.fill(`cd /loopat/context/notes, create s3-${stamp}.md with the word DONE, set git user.email ai@local and user.name ai, commit -m '${msg}', push origin HEAD:master. Report when push succeeds.`);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(fixtureNotesLog, { timeout: 240_000, intervals: [2000, 3000, 5000] }).toContain(msg);
  console.log("[sync] S3 AI commit reached origin");

  // Convergence is the point: B's SoT is the SHARED origin, which now carries the
  // AI's commit (asserted above). B reaches it AT LOOP LEVEL — a fresh loop on B
  // clones notes from origin into its sandbox; we exec into B's container and read
  // the AI's actual file. (B's UI worktree may have diverged from earlier cases —
  // irrelevant; the SoT is the origin, and the loop clones from it.)
  const m = meta();
  bLoopId = await createBLoopAndWaitSandbox(browser, m.bVite, `s3-b-${stamp}`);
  expect(sandboxRead(bLoopId, `/loopat/context/notes/s3-${stamp}.md`)).toBe("DONE");
  console.log(`[sync] S3 B loop sandbox read /loopat/context/notes/s3-${stamp}.md = DONE`);
  console.log("[sync] S3 GREEN: AI edit on A converged to B at loop level");
});
