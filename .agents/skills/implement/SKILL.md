---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

# Implement

Implement the work described by the user in the spec or tickets.

## 0. Get the ticket

This skill runs in a fresh agent with no memory of the conversation that created the ticket — you start with nothing but a reference (an issue number or URL). Before doing anything else, fetch the actual ticket content from GitHub:

```bash
gh issue view <number-or-url> --json title,body,labels,url
```

Consult the **gh-cli** skill if you hit auth/repo-targeting issues or aren't sure which repo to point at — don't guess.

Read the ticket's **"Blocked by"** section. If any blocking ticket isn't closed yet, stop and tell the user rather than implementing out of order.

If the ticket references a **Parent** issue (the spec), fetch that too (`gh issue view <parent-number>`) for full context before starting.

## 1. Implement

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

## 2. Hand back

Don't commit any changes that you made. The orchestrator agent is the one who does it. Don't close or edit the GitHub issue yourself — report back what was done and let the orchestrator handle ticket state.
