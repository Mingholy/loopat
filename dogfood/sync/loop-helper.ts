/**
 * Shared B-loop helper for S2/S3: create a real loop on server B through the UI,
 * wait for its sandbox to come up, and `podman exec` into B's container to read a
 * file that the sandbox cloned from the SHARED origin. This is how B "sees" kn —
 * knowledge has no UI pull endpoint; it's only cloned into a sandbox at loop
 * creation. So loop-level convergence is the only honest proof.
 */
import { expect, type Browser } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export function runningContainers(loopId: string): string[] {
  return execFileSync("podman", ["ps", "--filter", `label=loopat.loop-id=${loopId}`, "--filter", "status=running", "--format", "{{.Names}}"]).toString().split("\n").map(s => s.trim()).filter(Boolean);
}

export function cleanup(loopId: string) {
  if (!loopId) return;
  try {
    const ids = execFileSync("podman", ["ps", "-a", "--filter", `label=loopat.loop-id=${loopId}`, "--format", "{{.ID}}"]).toString().split("\n").map(s => s.trim()).filter(Boolean);
    if (ids.length) execFileSync("podman", ["rm", "-f", ...ids]);
  } catch {}
}

/** Read a file inside a loop's (first) running sandbox container. */
export function sandboxRead(loopId: string, path: string): string {
  const [name] = runningContainers(loopId);
  if (!name) throw new Error(`no running container for loop ${loopId}`);
  return execFileSync("podman", ["exec", name, "cat", path]).toString().trim();
}

/** Create a loop on server B (own context + bob's auth so the cookie is B's),
 *  pick roster1, wait for its sandbox to be running. Returns the loop id. The
 *  caller is responsible for cleanup(loopId). */
export async function createBLoopAndWaitSandbox(browser: Browser, bVite: number, title: string): Promise<string> {
  const baseURL = `http://127.0.0.1:${bVite}`;
  const ctx = await browser.newContext({ baseURL, storageState: join(import.meta.dirname, ".authB.json") });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("loopat:setupPersonalRepoDismissed", "1"));
  await page.goto(`${baseURL}/loop`);
  await expect(page.getByRole("button", { name: /^\+?\s*New Loop$/i }).first()).toBeVisible({ timeout: 20_000 });
  const createResp = page.waitForResponse(r => r.url().includes("/api/v1/loops") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /^\+?\s*New Loop$/i }).first().click();
  await expect(page.getByText("New loop", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("combobox").first().selectOption("roster1");
  await page.getByPlaceholder("refactor-gateway").fill(title);
  await page.getByRole("button", { name: "create", exact: true }).click();
  const loopId = String((await (await createResp).json()).id ?? "").replace(/^loop_/, "");
  expect(loopId).toMatch(/^[a-f0-9-]+$/);
  await page.getByRole("button", { name: /terminal/ }).first().click();
  await expect.poll(() => runningContainers(loopId), { timeout: 300_000, intervals: [1000, 2000, 5000] }).not.toEqual([]);
  await expect(page.getByText("Preparing this loop’s sandbox…")).toBeHidden({ timeout: 300_000 });
  await ctx.close();
  return loopId;
}
