---
name: comvia-be-handoff
description: Record a Comvia backend task's exact code, documentation, verification, and next action so another chat can resume it without repeating a repository audit. Use after implementing, pausing, or handing over BE work; do not use to analyze a new PO requirement.
---

# Comvia BE handoff

Create a compact, truthful continuation record in the repository's canonical docs after a BE task changes state. This record distinguishes code prepared on a branch, deployment, and live verification.

## Read only what is needed

Before writing, read `AGENTS.md`, then inspect the current branch, `git status --short`, and the relevant task in:

- `docs/planning/project-closeout-plan.md`
- `docs/tickets/board.md`

Read `docs/README.md` for document ownership and read the affected API guide only when a FE contract changes. Do not re-audit the whole repository or read `.env`.

## Update the canonical record

Use the smallest applicable set of files:

1. Update `docs/tickets/board.md` with the task state, owner, concrete remaining action, and verification evidence. State branch and date when useful.
2. Update `docs/planning/project-closeout-plan.md` if scope, acceptance criteria, sequencing, or the next owner changes.
3. Add `docs/business/change-log.md` only for a changed business rule, product scope, or API contract; do not log a code-only refactor there.
4. Update `docs/FRONTEND_API_GUIDE_NEXTJS.mdc` and/or `docs/FRONTEND_ADMIN_ROUTER_API_MAP.mdc` whenever FE requests, response shapes, permissions, routes, or retired API surfaces change.
5. Update `docs/project-status.md` and `docs/project-discust.md` only for a change material to management or the high-level feature state. Update `docs/architecture/north-star.md` when module boundaries or retained data change.

For each state, be exact:

- **Code ready on branch:** include branch, commit when one exists, changed surface, and checks that passed.
- **Deployed:** name the environment and deployed revision only when known.
- **Live verified:** include environment, date, role/scenario, and result. Never infer this from a successful build or public `HEAD` request.
- **Blocked:** name the missing decision, account, dependency, or evidence and the next actor.

Do not put credentials, tokens, raw production data, or unredacted request/response payloads in documentation.

## Handoff result

Before ending, run `git diff --check` and ensure only task files are staged or committed. Report:

- task ID and current state;
- branch and commit;
- behavior changed and deliberately retained data/schema;
- checks actually run and their result;
- documents changed, especially files FE must mirror;
- the single next action, owner, and any blocker.

Do not push, deploy, or call production APIs solely to create a handoff. Obtain the authorization required for those external actions.
