import { test, expect, beforeAll, afterAll } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter } from "node:path"
import { join } from "node:path"

const originalPath = process.env.PATH ?? ""
const home = await mkdtemp(join(tmpdir(), "loopat ssh 'quote-"))
process.env.LOOPAT_HOME = home

const gitLog = join(home, "git-env.log")
const fakeBinDir = join(home, "bin")

const loops = await import("../src/loops")
const paths = await import("../src/paths")

const user = "alice"

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

async function readCapturedSshCommands(): Promise<string[]> {
  const raw = await readFile(gitLog, "utf8").catch(() => "")
  return raw.split("\n").filter(Boolean)
}

beforeAll(async () => {
  await mkdir(fakeBinDir, { recursive: true })
  await writeFile(
    join(fakeBinDir, "git"),
    `#!/bin/sh
if [ -n "$GIT_SSH_COMMAND" ]; then
  printf '%s\\n' "$GIT_SSH_COMMAND" >> "$LOOPAT_FAKE_GIT_LOG"
fi

if [ "$1" = "-C" ]; then
  shift
  shift
fi

cmd="$1"
shift || true

case "$cmd" in
  clone)
    target=""
    for arg in "$@"; do target="$arg"; done
    mkdir -p "$target/.git"
    ;;
  remote)
    if [ "$1" = "get-url" ]; then
      printf 'ssh://example.test/origin.git\\n'
    else
      printf 'origin\\n'
    fi
    ;;
  symbolic-ref)
    printf 'main\\n'
    ;;
  rev-list|status|ls-files)
    ;;
esac

exit 0
`,
  )
  await chmod(join(fakeBinDir, "git"), 0o755)
  process.env.PATH = `${fakeBinDir}${delimiter}${originalPath}`
  process.env.LOOPAT_FAKE_GIT_LOG = gitLog
})

afterAll(async () => {
  process.env.PATH = originalPath
  delete process.env.LOOPAT_FAKE_GIT_LOG
  await rm(home, { recursive: true, force: true })
})

test("vault SSH command shell-quotes config and key paths and ignores commented IdentityFile lines", async () => {
  await rm(gitLog, { force: true })
  await mkdir(paths.personalLoopatDir(user), { recursive: true })
  await writeFile(
    paths.personalLoopatConfigPath(user),
    JSON.stringify({ providers: { default: "" }, knowledge: { git: "ssh://example.test/knowledge.git" } }),
  )

  const sshDir = join(paths.personalVaultMountsHomeDir(user, "default"), ".ssh")
  await mkdir(sshDir, { recursive: true })
  const vaultKey = join(sshDir, "id_ed25519")
  const vaultConfig = join(sshDir, "config")
  const commentedKey = join(sshDir, "commented key's name")
  await writeFile(vaultKey, "private key")
  await writeFile(
    vaultConfig,
    [
      "Host example.test",
      `  # IdentityFile ${commentedKey}`,
      "  IdentityFile id_ed25519",
      "",
    ].join("\n"),
  )

  const warnings = await loops.ensureUserContext(user)

  expect(warnings).toEqual([])
  const commands = await readCapturedSshCommands()
  expect(commands.length).toBeGreaterThan(0)
  expect(commands[0]).toContain(`-F ${shellQuote(vaultConfig)}`)
  expect(commands[0]).toContain(`-i ${shellQuote(vaultKey)}`)
  expect(commands[0]).not.toContain(commentedKey)
})

test("personal SSH command shell-quotes the host deploy key path", async () => {
  await rm(gitLog, { force: true })
  await mkdir(join(paths.personalDir(user), ".git"), { recursive: true })

  await loops.inspectPersonalDirty(user)

  const commands = await readCapturedSshCommands()
  expect(commands.length).toBeGreaterThan(0)
  expect(commands[0]).toContain(`-i ${shellQuote(paths.hostDeployKeyPath(user))}`)
})
