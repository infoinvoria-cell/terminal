<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## GitHub / Repo Workflow - Mandatory

- Repo: `https://github.com/capitalife/terminal`
- `main` is the stable baseline branch.
- New work starts in a feature or fix branch.
- No direct push to `main` unless Jeroen explicitly approves an emergency release.
- Never use `git add .`
- Before every commit or push run:
  - `rtk git status`
  - `npm run audit:github-safe`
  - `rtk err npm run build`
  - a sensitive-path review
- Push branches with `git push -u origin <branch>`
- Create or recommend a pull request before merge.
- No Brain, Vault, Handoff, raw data, secrets, or personal data may enter the repo.
- GitHub Branch Protection / Rulesets are currently not technically enforced for this private repo without GitHub Team or Enterprise. Agents must still follow this SOP manually.
- If audit fails: stop, do not commit or push.
- If build fails: stop, do not push.
- If privacy status is unclear: stop and report.
- GitHub repo is a code and sanitized-doc workspace, not a data room.

## Public Vercel Preview Mode

- Jeroen wants a simple public-preview deployment path.
- Access word for preview: `inno`.
- Implement and maintain a simple access gate with 3 failed attempts and lockout.
- This is not high-security authentication.
- Public repo only after `npm run audit:github-safe` and a sensitive-data scan.
- Never expose Brain, Vault, raw data, or personal data.
- Cloud preview must not require a local Brain path.
- No live execution or orders.
- Vercel env should use `SIMPLE_GATE_PASSWORD=inno`.
- Prefer env var over hardcoded password.
- Before deployment run `npm run safe:predeploy`.
- Work on a feature branch, never direct on `main`.

## Public/Vercel Env Rules

- `.env.local` is local only and must never be committed.
- `.env.example` may contain placeholders or example values only.
- Vercel Environment Variables are the source for the preview access word.
- Public preview access word is currently `inno`.
- Simple gate is not high-security authentication.
- Public repo only after `npm run audit:github-safe` and a sensitive-data scan.
- Never expose Brain, Vault, raw data, or API keys.
- No direct push to `main`.
- Never use `git add .`

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
