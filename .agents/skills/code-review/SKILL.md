---
name: code-review
description: "Review a completed ticket's implementation against coding standards and the originating spec/PRD, then commit if it passes. Run by the orchestrator agent after a fresh agent finishes an `implement` pass — the orchestrator is the only one who commits."
disable-model-invocation: true
---

# Code Review

Review the work a fresh agent just produced for a ticket, decide whether it's good enough to land, and — only if it is — commit it. This is the gate `implement` explicitly defers to: `implement` never commits, this skill is where that happens.

## 0. Gather context

You need three things before you can judge anything:

1. **The ticket** — `gh issue view <number-or-url> --json title,body,labels,state,url`. Consult the **gh-cli** skill for mechanics if auth/repo targeting is unclear.
2. **The parent spec/PRD**, if the ticket references one — fetch it too (`gh issue view <parent-number>`). Acceptance criteria on the ticket are the contract, but the spec gives you the "why" to sanity-check the "what."
3. **The actual diff** — `git diff` / `git log` against the base the fresh agent branched from. Don't review from memory or from the agent's self-report; look at the real change.

## 1. Review against coding standards

- Check the diff against the project's own conventions: linting/formatting config, existing patterns in neighboring code, ADRs in the area touched, and the domain glossary vocabulary (naming should match what the spec and codebase already use).
- Run the project's actual tooling rather than eyeballing style: typecheck, linter, single test files touched by the change, then the full test suite once.
- Flag anything that's technically working but inconsistent with how the rest of the codebase does it — new patterns should be a deliberate decision, not an accident of which agent happened to write the code.

## 2. Review against the spec/ticket

- Walk the ticket's acceptance criteria checklist one by one. Each box needs actual evidence (a passing test, a manual check, visible behavior) — don't check something off because the agent claimed it's done.
- Confirm the change is a genuine vertical slice: does it deliver the end-to-end behavior described in "What to build," or does it just touch the right files without the behavior actually working?
- If the ticket has a parent spec, confirm the implementation doesn't contradict a decision made there (e.g. wrong API shape, wrong schema) even if it satisfies the ticket's own acceptance criteria in isolation — the ticket can be locally correct and still drift from the spec.

## 3. Decide

**Passes** — coding standards hold, tests pass, every acceptance criterion has evidence, and it matches the spec:

- Commit the change yourself. Use a message that references the ticket, e.g. `Implemented #<number>: <summary>`. Do not use "Closes" in the commit message because we will close the ticket manually right now to unblock subsequent work.
- Leave a short comment on the ticket summarizing what was verified (`gh issue comment <number> --body-file ...`).
- **Close the ticket**: Immediately close the ticket using the CLI (`gh issue close <number>`) so that the next dependent ticket in the sequence is unblocked for the next agent pass. We batch our pushes, so closing via CLI is required.
- **Parent Spec/PRD Update**: 
  - ALWAYS leave a short comment on the parent spec/PRD (if one exists) indicating that this specific ticket (`#<number>`) has been completed, verified, and closed locally.
  - **Spec completion check**: Check if this ticket is the final open ticket belonging to its parent spec/PRD. If all other tickets for the spec are closed (including the one you just closed):
    - Instruct the orchestrator (or the user) that the spec is fully implemented and it is time to run the `/push-to-github` skill.

**Fails** — anything above doesn't hold:

- Do NOT commit, not even partially.
- Leave a clear review comment on the ticket (`gh issue comment`) describing exactly what's missing or wrong, specific enough that a fresh `implement` pass could pick it up without re-deriving your reasoning.
- Hand back to the user or the orchestrator's retry loop rather than fixing it yourself — this skill's job is to gate and report, not to quietly rewrite someone else's implementation. Small, obviously-mechanical fixes (a missed formatting rule, an unused import) are a judgment call; anything that touches logic or intent goes back for a real redo.

Do NOT close the parent spec/PRD issue directly via the CLI in either case; allow the commit message or PR merge to close it. You MAY comment on the parent spec/PRD to indicate completion as described above.
