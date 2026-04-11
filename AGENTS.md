# Repository Guidelines

## Project Structure & Module Organization
- Chrome extension entry points live at the repo root: `manifest.json`, `content.js`, and `background.js`.
- The local Python TTS provider lives in `python-provider/` with server code under `python-provider/app/`, startup entry at `python-provider/server.py`, and smoke checks in `python-provider/scripts/`.
- OpenSpec artifacts live in `openspec/`: stable specs in `openspec/specs/`, active changes in `openspec/changes/<change>/`, and archived work in `openspec/changes/archive/`.
- Generated provider outputs are written to `python-provider/output/` and should not be hand-edited.

## Build, Test, and Development Commands
- `npm run provider:start` — starts the Python provider with default settings.
- `npm run provider:start -- --host 127.0.0.1 --port 8000` — starts the provider with explicit CLI flags.
- `npm run provider:smoke` — runs the bundled smoke test against the provider.
- `node --check content.js` and `node --check background.js` — fast syntax validation for extension scripts.
- Load the extension unpacked from the repo root in `chrome://extensions/` for manual testing.

## Coding Style & Naming Conventions
- Use 2-space indentation in JavaScript and keep changes minimal and local.
- Follow existing naming patterns: `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants, descriptive IDs/classes for injected DOM (`dualsub-*`).
- Prefer small helper functions over deeply nested inline logic.
- Python code should stay consistent with the existing lightweight functional style in `python-provider/app/`.
- No formatter is currently configured; match surrounding style manually.

## Testing Guidelines
- Run targeted checks first: `node --check content.js`, `node --check background.js`, then `npm run provider:smoke` when touching provider paths.
- For UI behavior, verify manually on a MediaDelivery embed page: subtitle rendering, dubbing controls, fullscreen shortcuts, drag behavior, and playback resume.
- Do not add new test frameworks unless explicitly requested.

## Commit & Pull Request Guidelines
- Use Conventional Commits, as in recent history: `feat: ...`, `fix: ...`, `refactor: ...`.
- Keep each commit focused on one change or OpenSpec task group.
- PRs should include: a short summary, affected files/flows, validation performed, and screenshots/GIFs for visible UI changes.

## OpenSpec Workflow
- For non-trivial features, create or update an OpenSpec change before implementation.
- Keep `proposal.md`, `design.md`, `specs/`, and `tasks.md` aligned with the code, and mark task checkboxes immediately when work is done.
