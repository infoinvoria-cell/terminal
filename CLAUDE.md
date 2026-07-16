@AGENTS.md

## Brain Context Layer

- Brain Source of Truth:
  - `CAPITALIFE_BRAIN_PATH`
- Graphify index:
  - `CAPITALIFE_BRAIN_PATH/graphify-out`
  - `./graphify-out`
- Agents must first request or generate a context pack instead of reading the full vault.
- Use `/api/brain-graph/context-pack` or a local brain-context client before broad reads.
- Graphify is index, not truth.
- No live trading and no broker execution.
- No secrets may be printed, staged or copied into the repo.
- No files from the Brain vault or local handoff room may be copied into the shared repo.
- Run a security audit before every commit.
