---
name: comvia-be-continue
description: Resume the current Comvia NestJS backend work from its recorded branch, delivery board, and handoff evidence without repeating a full repository audit. Use at the start of a new chat or after an interrupted BE task; do not use for a new PO analysis.
---

# Continue Comvia BE work

Use the repository documentation and Git state as the source of truth. Start narrowly, preserve recorded decisions, and verify only the task being resumed.

## Recover the current state

1. Read `AGENTS.md` and inspect `git branch --show-current`, `git status --short`, and the latest relevant commits.
2. Read `docs/README.md`, then `docs/tickets/board.md` and `docs/planning/project-closeout-plan.md`.
3. Identify the task that is assigned to BE, in progress, code-ready but not deployed, or explicitly requested by the user. Read only its linked business rule, API guide, architecture note, and affected code.
4. Treat the evidence in the board as historical until Git and the named environment confirm it. Do not assume a local commit is deployed or that a public endpoint proves authenticated behavior.

Use `rg` to find the affected module and its tests before editing. Do not read `.env`, expose credentials, or change branch, reset work, deploy, or push without the user's authorization.

## Preserve current Comvia decisions

- BE owns business rules and API contracts; FE receives the resulting documentation handoff.
- The active runtime references are `https://app.comvia.cloud` and `https://api.comvia.cloud/api/v1`, but live behavior requires task-specific evidence.
- Quick Chat is retired. Do not restore its endpoints or UI contract. Its historical Prisma models, migrations, and data remain until a separately approved retention decision.
- A feature is only fully done after the recorded code, appropriate checks, deployment, and applicable live verification are complete. Use an intermediate status such as “BE complete on branch; deploy/smoke pending” otherwise.

## Continue safely

Implement only the selected ticket or clear requirement. Run focused checks from the project scripts, inspect the final diff, and update the delivery record with `$comvia-be-handoff` before completing the task. If the task changes a FE contract, update the relevant API guide and explicitly report the files FE must mirror.

If no BE task is active, state the highest-priority BE-owned item from the board and its dependency rather than beginning speculative work.
