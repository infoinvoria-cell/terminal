<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Capitalife Agent Efficiency Rules

- Use RTK for token-light terminal output:
  - `rtk git status`
  - `rtk git diff`
  - `rtk rg "<query>" src`
  - `rtk find "*.tsx" src`
  - `rtk test npm run build`
  - `rtk err npm run build`
- If RTK output is too compressed, read the full tee log before changing code.
- Do not print secrets, `.env`, API keys, or private tokens.
- First read:
  - `CAPITALIFE_BRAIN_PATH/09_AI/AI_PROJECT_BRAIN_CURRENT.md`
  - `CAPITALIFE_BRAIN_PATH/09_AI/dashboard_snapshot.json`
  - project `CLAUDE.md` / `AGENTS.md`
- Do not scan the whole Vault blindly.
- Brain is the Source of Truth.
- Graphify (`graphify-out/graph.json`) should be queried before large file scans.
- RTK and Graphify are development tools, not Dashboard app dependencies.

## Brain Context Layer

- Brain Source of Truth:
  - `CAPITALIFE_BRAIN_PATH`
- Graphify index:
  - `CAPITALIFE_BRAIN_PATH/graphify-out`
  - `./graphify-out`
- Agents must first request or generate a context pack instead of scanning the full vault.
- Use `/api/brain-graph/context-pack` or the local brain-context client before broad file reads.
- Graphify is index, not truth.
- No live trading, no broker execution, no shell execution via public APIs.
- No secrets may be printed, staged or copied into the repo.
- No files from the Brain vault or local handoff room may be copied into the shared repo.
- Run a security audit before every commit.
