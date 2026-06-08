import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const source = readFileSync(join(import.meta.dirname, "../src/Terminal.tsx"), "utf8")

function indexOfRequired(snippet: string) {
  const index = source.indexOf(snippet)
  expect(index, `missing snippet: ${snippet}`).toBeGreaterThanOrEqual(0)
  return index
}

describe("Terminal addon lifecycle", () => {
  test("loads required addons before open and optional addons after open", () => {
    const openIndex = indexOfRequired("term.open(containerRef.current)")

    expect(indexOfRequired("term.loadAddon(fit)")).toBeLessThan(openIndex)
    expect(indexOfRequired("term.loadAddon(search)")).toBeLessThan(openIndex)

    for (const addon of ["WebglAddon", "ClipboardAddon", "Unicode11Addon", "LigaturesAddon"]) {
      expect(indexOfRequired(`term.loadAddon(new ${addon}())`)).toBeGreaterThan(openIndex)
    }
  })
})
