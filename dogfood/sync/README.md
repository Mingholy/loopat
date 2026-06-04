# dogfood/sync — context flow across two independent servers

The fourth tier. Where every other dogfood tier runs ONE loopat install, this
boots **two** — server A (alice) and server B (bob), each its own LOOPAT_HOME,
backend, vite, user, and self-contained vault — that share **one** fixture sshd
git origin. It proves the central claim of `docs/context-flow.md`: a server is a
disposable replica of `origin`, multi-user across servers is the same mechanism
as multi-user on one server, and everyone converges on the SoT.

Each case writes context on A, lands it on the shared origin, and proves B
converges. Integration truth = the fixture's bare repos read via `podman exec`;
B's own server is the cross-check. The notes/personal "UI loop" is no-AI
(`PUT /api/workspace/file?vault=notes` + `POST /api/notes/save` = ff+rebase
push); S3 swaps that for a real loop AI. Preconditions FAIL-not-skip: `podman`,
`IDEALAB_API_KEY`, `FIRST_RUN_AI_BASE_URL`.

## Cases

| Case | Proves |
|------|--------|
| S0 | both servers boot and clone the shared origin |
| S1 | shared repo: A edits notes via UI → push origin → B sees it |
| S2 | shared kn advances → B sees it at LOOP level (B spins a loop, sandbox clones kn from origin, `podman exec cat`); A's personal note stays isolated to A |
| S4 | different files concurrently → git auto-merges, both servers have both |
| S5 | same-file conflict outside-loop → first lands, second ff-fails → kept-local + held back, NOT on SoT (the soul case) |
| S3 | the writer is a real loop AI on A → B converges at LOOP level (B spins a loop, sandbox clones notes from origin, `podman exec cat` shows the file) (runs last; one idealab turn) |

## Run

```sh
export IDEALAB_API_KEY=$(cat ~/.loopat/personal/<you>/.loopat/vaults/default/envs/IDEALAB_API_KEY)
export FIRST_RUN_AI_BASE_URL=https://idealab.alibaba-inc.com/api/anthropic
bun run dogfood:sync
```

Five host ports (24001+) and two temp LOOPAT_HOMEs are picked in
`playwright.config.ts`; the fixture + both backends come up in `setup.ts`;
`workers:1` (the two servers share one origin). All urls/keys via env, never
committed.
