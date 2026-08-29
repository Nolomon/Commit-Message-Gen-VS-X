---
name: release
description: Cut a new release of the extension — changelog entry, version bump, annotated tag, and packaging. Use when the user wants to release, ship, cut a version, bump the version, or publish to the VS Code Marketplace.
---

# Release

Releases are cut **directly on `main`**, linearly. No release branch, no merge commit.
Tag on `main` and nowhere else.

## Steps

Run these in order. The changelog lands **before** the bump so the tag contains its own
release notes.

### 1. Confirm you're releasing from a clean `main`

```bash
git status --short
git log --oneline --decorate -1
```

Everything intended for the release should already be committed and on `main`. Only the
changelog edit should be outstanding, if anything.

### 2. Changelog review — STOP here and wait for the user

**The changelog is the user's to write. This step is a gate, not a task to complete.**

Read `CHANGELOG.md` and show the user the entry as it currently stands — usually a draft
of theirs under `## [Unreleased]`. Point out anything that looks off against the
conventions below, as suggestions. Do not edit the file on your own initiative.

Then hand it back and wait. From here the user drives:

- They may edit `CHANGELOG.md` directly in their editor. Re-read it when they say they
  have; treat what is on disk as the current truth.
- They may ask you for tweaks — rewording an entry, moving a bullet, dropping one. Make
  exactly that change, show the result, and wait again.
- Iterate as many rounds as they want. There is no round limit and no nudging toward
  finishing.

**Do not proceed to step 3 until the user explicitly says to** — "finalize", "ship it",
"go ahead", or similar. Silence, an approving remark, or a satisfied-sounding reply is not
the signal. If you are unsure whether a message was a go-ahead, ask.

Once they finalize, apply the release heading yourself if it is still `[Unreleased]`:
retitle it to `## [X.Y.Z] - YYYY-MM-DD` with the real release date. Never leave
`[Unreleased]` in place and add a second heading below it.

Then commit it on its own:

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): add vX.Y.Z release notes"
```

#### Conventions to check against

- The new section goes directly under the
  `All notable changes will be documented in this file.` line.
- Heading is `## [X.Y.Z] - YYYY-MM-DD`.
- Section order is **Added → Changed → Fixed**. Omit any section with no entries.
- Entries read as **user-facing symptoms, not internal fix mechanisms** — what someone
  using the extension noticed, in their terms. "DeepSeek models stopped generating
  entirely and returned an API error on every attempt", not "corrected the request
  payload shape".
- There are no link reference definitions at the bottom of the file. Don't add any.

### 3. Bump the version and tag

```bash
npm version minor    # or patch / major
```

That single command does everything and its defaults are already what this repo uses —
don't hand-roll the commit or tag:

- Commit subject is the bare number (`0.3.0`), **no conventional-commit prefix**.
- It touches only `package.json` and `package-lock.json`.
- It creates an **annotated** tag `vX.Y.Z` whose message is the bare number, on that commit.

Choosing the level: a new setting, new models, or any new capability is `minor`. Bug fixes
and wording alone are `patch`.

Verify before moving on:

```bash
git log --oneline --decorate -3
git show --stat --format='%s' HEAD    # subject = bare number, 2 files
git cat-file -t vX.Y.Z                # must print: tag
```

### 4. Push

```bash
git push origin main --follow-tags
```

`--follow-tags` pushes the annotated tag along with the commits. Confirm with the user
before pushing — it's the point of no return.

### 5. Package

```bash
npm run package
```

Produces the `.vsix` (gitignored). There is **no CI** in this repo — nothing fires on the
tag. Publishing to the Marketplace is a manual step the user does themselves; hand them the
`.vsix` and stop there unless they ask otherwise.

## Notes

- Steps 2 and 4 are both stop points. Step 2 waits for the user to finalize the changelog;
  step 4 waits for them to approve the push. Never run past either on your own judgment.
- Never push a tag without the user saying so.
