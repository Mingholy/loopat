/**
 * Regression coverage for provider settings correctness fixes.
 */
import { test, expect, describe, afterAll, beforeEach } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

const ownsHome = process.env.LOOPAT_HOME === undefined
if (ownsHome) process.env.LOOPAT_HOME = `/tmp/loopat-provider-settings-${process.pid}`

const HOME = process.env.LOOPAT_HOME!
await mkdir(HOME, { recursive: true })
if (ownsHome) {
  await rm(HOME, { recursive: true, force: true })
  await mkdir(HOME, { recursive: true })
  await writeFile(join(HOME, "config.json"), JSON.stringify({
    knowledge: { git: "" },
    notes: { git: "" },
    repos: [],
    providers: {},
  }))
}

const {
  loadConfig,
  saveWorkspaceConfig,
  getProvidersResponse,
  clearPersonalCache,
} = await import("../src/config")
const {
  personalLoopatDir,
  personalLoopatConfigPath,
  personalVaultEnvsDir,
  personalVaultEnvPath,
} = await import("../src/paths")

const USER = "providerfix"

async function writePersonalProviders(providers: Record<string, any>): Promise<void> {
  await mkdir(personalLoopatDir(USER), { recursive: true })
  await mkdir(personalVaultEnvsDir(USER, "default"), { recursive: true })
  await writeFile(personalLoopatConfigPath(USER), JSON.stringify({ providers }, null, 2) + "\n")
  clearPersonalCache(USER)
}

beforeEach(async () => {
  await rm(personalLoopatDir(USER), { recursive: true, force: true })
  clearPersonalCache(USER)
})

afterAll(async () => {
  if (ownsHome) await rm(HOME, { recursive: true, force: true })
})

describe("saveWorkspaceConfig provider replacement", () => {
  test("replaces submitted provider map while preserving unrelated config", async () => {
    await saveWorkspaceConfig({
      knowledge: { git: "git@example.com:team/knowledge.git" },
      serveDomain: "serve.example.com",
      providers: {
        keep: {
          baseUrl: "https://keep.example",
          apiKey: "sk-keep",
          models: [{ id: "keep-model" }],
          enabled: true,
        },
        remove: {
          baseUrl: "https://remove.example",
          apiKey: "sk-remove",
          models: [{ id: "remove-model" }],
          enabled: true,
        },
      },
      default: "keep",
    })

    await saveWorkspaceConfig({
      providers: {
        keep: {
          baseUrl: "https://keep-new.example",
          models: [{ id: "keep-model" }],
          enabled: false,
        },
      },
    })

    const cfg = await loadConfig()
    expect(Object.keys(cfg.providers ?? {})).toEqual(["keep"])
    expect(cfg.providers?.keep.apiKey).toBe("sk-keep")
    expect(cfg.providers?.keep.baseUrl).toBe("https://keep-new.example")
    expect(cfg.providers?.keep.enabled).toBe(false)
    expect(cfg.knowledge?.git).toBe("git@example.com:team/knowledge.git")
    expect(cfg.serveDomain).toBe("serve.example.com")
  })
})

describe("provider response availability", () => {
  test("includes unresolved personal ${VAR} providers as disabled with missing var metadata", async () => {
    await saveWorkspaceConfig({
      knowledge: { git: "" },
      providers: {},
      default: "",
    })
    await writePersonalProviders({
      default: "ghost",
      ghost: {
        baseUrl: "https://ghost.example",
        apiKey: "${GHOST_API_KEY}",
        models: [{ id: "ghost-model" }],
      },
    })

    const j = await getProvidersResponse(USER)

    expect(j.providers.ghost).toMatchObject({
      baseUrl: "https://ghost.example",
      source: "personal",
      enabled: false,
      hasKey: false,
      missingVar: "GHOST_API_KEY",
    })
    expect(j.providers.ghost.models).toEqual([{ id: "ghost-model" }])
  })

  test("defaults to keyed personal provider when personal has no explicit default", async () => {
    await saveWorkspaceConfig({
      knowledge: { git: "" },
      providers: {
        workspace: {
          baseUrl: "https://workspace.example",
          apiKey: "sk-workspace",
          models: [{ id: "workspace-model" }],
          enabled: true,
        },
      },
      default: "workspace",
    })
    await writePersonalProviders({
      personal: {
        baseUrl: "https://personal.example",
        apiKey: "${PERSONAL_API_KEY}",
        models: [{ id: "personal-model" }],
      },
    })
    await writeFile(personalVaultEnvPath(USER, "default", "PERSONAL_API_KEY"), "sk-personal\n")
    clearPersonalCache(USER)

    const j = await getProvidersResponse(USER)

    expect(j.default).toBe("personal")
    expect(j.providers.personal).toMatchObject({
      source: "personal",
      enabled: true,
      hasKey: true,
    })
  })
})
