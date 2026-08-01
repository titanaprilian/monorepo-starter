---
name: gh-cli
description: How to use the `gh` GitHub CLI to read from and write to a GitHub repo — creating/updating issues, PRs, labels, and searching for duplicates. Use this whenever a task needs to publish something to GitHub Issues (specs, PRDs, bug reports, tickets), check existing issues before creating new ones, or otherwise script GitHub via the CLI instead of the web UI. Trigger this any time another skill or instruction says "publish to GitHub Issues," "use the gh CLI," "open a PR," or similar, and you haven't already confirmed `gh` is authenticated and pointed at the right repo this session.
---

# gh CLI

Companion skill for any workflow that needs to talk to GitHub from the command line (e.g. `to-spec` publishing a spec as an Issue). This is not about writing the content — it's about getting `gh` invocations right: auth, repo targeting, safe multiline bodies, and avoiding duplicate/garbled issues.

## 0. Preflight — do this once per session before any write

Run these before the first `gh issue create` / `gh pr create` call:

```bash
gh --version                # confirm gh is installed
gh auth status              # confirm authenticated + which account/host
gh repo view --json nameWithOwner,url   # confirm which repo you're pointed at
```

- If `gh auth status` fails: tell the user `gh` isn't authenticated in this environment and stop. Do not try to run `gh auth login` interactively — it needs a browser/token the agent doesn't have.
- If `gh repo view` returns the wrong repo (or fails because the working directory isn't a git repo), ask the user which repo to target, or pass `--repo owner/name` explicitly on every subsequent command rather than relying on directory context.
- If there's any ambiguity about which repo, confirm with the user before writing. Never guess a repo name.

## 1. Writing multiline Markdown bodies safely

Never pass a long Markdown body inline with `--body "..."` — shell quoting mangles headings, backticks, and lists. Instead, write the body to a file and use `--body-file`:

```bash
cat > /tmp/issue-body.md << 'EOF'
## Problem Statement
...

## Solution
...
EOF

gh issue create \
  --repo owner/name \
  --title "Short, specific title" \
  --body-file /tmp/issue-body.md
```

The `<< 'EOF'` (quoted delimiter) is important — it prevents the shell from expanding `$variables`, backticks, or `!` in the body. Always quote the heredoc delimiter for Markdown content.

Same pattern applies to `gh pr create --body-file`, `gh issue edit --body-file`, and `gh issue comment --body-file`.

## 2. Checking for duplicates before creating

Before opening a new issue for a spec/feature, search for an existing one so you don't create duplicates on re-runs:

```bash
gh issue list --repo owner/name --search "in:title <feature name>" --state all --json number,title,url
```

If a close match exists, ask the user whether to update it (`gh issue edit <number> --body-file ...`) instead of creating a new one.

## 3. Creating the issue and reporting back

```bash
gh issue create \
  --repo owner/name \
  --title "Spec: <feature name>" \
  --body-file /tmp/issue-body.md \
  --label "spec" \
  --assignee "@me"
```

`gh issue create` prints the issue URL to stdout on success — capture it and surface it to the user, don't just say "done":

```bash
URL=$(gh issue create --repo owner/name --title "..." --body-file /tmp/issue-body.md)
echo "$URL"
```

Optional flags worth knowing:

- `--label` (repeatable) — only works if the label already exists in the repo; check with `gh label list --repo owner/name` first if unsure, and create it with `gh label create` if it's missing and the user wants it.
- `--milestone`, `--project` — same caveat, must already exist.
- `--assignee "@me"` or a username.

## 4. Editing an existing issue

```bash
gh issue edit <number> --repo owner/name --body-file /tmp/issue-body.md
gh issue edit <number> --repo owner/name --add-label "needs-review"
```

## 5. Common failure modes

- **`gh: command not found`** — tell the user `gh` isn't installed in this environment; don't attempt to install it yourself unless asked.
- **`HTTP 404` on repo commands** — usually wrong `owner/name`, or the authenticated account lacks access. Confirm the repo slug with the user rather than guessing variants.
- **`HTTP 403` on create/edit** — authenticated account likely has read-only access. Surface this plainly rather than retrying silently.
- **Body renders with literal `\n` or broken formatting** — you passed Markdown via `--body` with escaped newlines instead of `--body-file` with a real heredoc. Redo with the heredoc pattern in §1.
- **Network egress blocked** — if `gh` calls hang or fail with connection errors, check whether `api.github.com` / `github.com` are reachable in this environment; if not, tell the user to check their network/proxy settings rather than retrying repeatedly.

## 6. Clean up

Temp body files in `/tmp` don't need to persist — fine to leave them for the session, but don't write them into the repo's working tree.
