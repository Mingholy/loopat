import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { McpStatusPanel } from "../src/components/McpStatusPanel"

test("renders a reload session action separately from the server list refresh", () => {
  const markup = renderToStaticMarkup(<McpStatusPanel loopId="loop-1" />)

  expect(markup).toContain("Restart the SDK session")
  expect(markup).toContain("Reload session")
})
