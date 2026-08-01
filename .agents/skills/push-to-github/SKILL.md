---
name: push-to-github
description: "Push committed work to GitHub. Always asks the user first whether to push directly to the main branch or create a dedicated branch and open a pull request — never assumes. Run by the orchestrator agent after code-review has committed the change locally."
disable-model-invocation: true
---

# Push to GitHub

Get already-committed work up onto GitHub. This runs after `code-review` has committed locally — this skill's job is getting those commits onto the remote, not reviewing or committing them itself.

## 0. Sanity check before asking anything

- `git status` — if there are uncommitted or staged-but-uncommitted changes, stop and flag it. This skill pushes what's already committed; it doesn't commit on someone else's behalf.
- `git log origin/<default-branch>..HEAD` (or equivalent) — confirm there's actually something to push. If already up to date, say so and stop.
- `gh repo view --json nameWithOwner,defaultBranchRef` — confirm the repo and its default branch. Consult **gh-cli** if auth/repo targeting is unclear.

## 1. Ask the user — always, every time

Before touching the remote, ask:

> Do you want to push this directly to `<default-branch>`, or create a dedicated branch and open a pull request?

Don't infer this from context, ticket labels, or past behavior in the conversation — always ask explicitly. This is a one-way door (a direct push to main is live immediately; a PR is reversible up until merge), so silent defaults aren't appropriate here.

## 2a. Direct push to main

- Pull/rebase onto the latest `<default-branch>` first if local is behind — never push a stale branch and let it silently create divergent history.
- Run the project's typecheck + full test suite once more immediately before pushing, since time may have passed since `code-review` last ran them.
- `git push origin <default-branch>`.
- If the push is rejected (branch protection, required reviews, non-fast-forward), don't force-push. Report the rejection reason to the user and ask how they want to proceed — this is exactly the situation branch protection exists to catch.

## 2b. Dedicated branch + pull request

- Branch naming: derive from the ticket, e.g. `<ticket-number>-<short-slug>` (matches the ticket's title/slug from `to-tickets`). If there's no ticket in play, ask the user for a branch name rather than guessing.
- `git checkout -b <branch-name>` (if not already on it), then `git push -u origin <branch-name>`.
- Open the PR with the `gh` CLI — consult **gh-cli** for the mechanics (safe `--body-file` heredocs, capturing the returned URL):

```bash
gh pr create \
  --title "<short, specific title>" \
  --body-file /tmp/pr-body.md \
  --base <default-branch> \
  --head <branch-name>
```

- PR body should reference the ticket/spec it closes, e.g. `Closes #<ticket-number>`, so merging auto-closes it. Summarize what changed and how it was verified (tests run, acceptance criteria met) — pull this from what `code-review` already checked, don't re-derive it from scratch.
- Report the PR URL back to the user. Don't merge it yourself — opening the PR is the end of this skill's job; merging is a separate human (or explicitly separate) decision.

## Never

- Never force-push (`--force` / `--force-with-lease`) without the user explicitly asking for it in that moment.
- Never push directly to main without having asked in step 1, even if a previous run of this skill in the same session chose that option — ask again each time.
- Never merge a PR as part of this skill.
