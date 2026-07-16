@AGENTS.md

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
