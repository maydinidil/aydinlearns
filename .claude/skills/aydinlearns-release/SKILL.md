---
name: aydinlearns-release
description: Publishes a merged aydinlearns version to the public repository (maydinidil/aydinlearns) - export, scan and install check, push, tag and release notes, the release record, and Aydin's checkout. Use only when Aydin gives the go for a public release of a version already merged to main; do not use to merge a PR, to push the monorepo, or to rehearse.
argument-hint: <version, for example 0.7.3>
disable-model-invocation: true
---

# Publish an aydinlearns release

One go from Aydin ("do the public release", naming or implying the version) covers every step below, in order. The
steps stop themselves on any failure; nothing here needs a second go unless a stop condition fires. If you found this
file by path rather than through the skill command, the same rules apply: do not start without that go.

## Inputs and preconditions

- `<version>`: the version in `aydinlearns/package.json` on `origin/main`, as `0.x.y`. The tag is `v<version>`.
- The version's PR is merged to `main`, and every Codex line comment on it is fixed or answered (D119: Codex before the
  merge). Check with the `review-findings` skill's intake if unsure. If not, stop.
- `gh` is logged in as `maydinidil` (`gh api user -q .login`).
- The real key prefixes, from the controller's own memory or Aydin. They are passed in `RELEASE_SCAN_PREFIXES`
  (comma-separated), set for that one command only; never echoed, and never written to a file, a commit, a log or a
  message.
- Port 5194 is free. Never use 5174 (Aydin's app).

## Context to read

- `aydinlearns/CLAUDE.md` (the non-negotiables, the Ask-before list) and the root `CLAUDE.md`.
- The version's section in `aydinlearns/CHANGELOG.md`, for the notes.
- The header of `aydinlearns/tools/export-public.sh` and of `aydinlearns/tools/release-check.ts`.

## Workflow

Run every command from a checkout or worktree of the monorepo whose tree matches `origin/main` (after `git fetch`), with
absolute paths, and keep scratch in the session's scratch folder, outside the monorepo.

1. **Clone.** `gh repo clone maydinidil/aydinlearns <scratch>/pub`.
2. **Export.** `bash aydinlearns/tools/export-public.sh <scratch>/pub origin/main`. It commits once in the clone and never
   pushes. "nothing to refresh" means the public copy already matches: stop and report.
3. **Check.** `RELEASE_SCAN_PREFIXES=<prefixes> node aydinlearns/tools/release-check.ts <scratch>/pub`, from inside the
   monorepo. It scans the export commit, installs the commit's tree in a temporary folder with the launcher on 5194
   (temporary logs, journey and keys file; both key variables unset; telemetry off), runs the API checks, stops the
   server by its process ID, frees 5194 and deletes the folder. It prints PASS, FAIL or NOTE lines and `RESULT:`.
   The first launch downloads the npm and the three pinned Python packages, as on a new machine.
4. **Push.** Only on `RESULT: PASS`: `git -C <scratch>/pub push origin main`.
5. **Tag and release.** Write the notes to `<scratch>/v<version>-notes.md` from the CHANGELOG section: what changed,
   the Codex findings fixed, what is never written or sent, how to update (log version, any package change), and the
   known issues. Then `gh release create v<version> --repo maydinidil/aydinlearns --target <export commit>
   --title "aydinlearns <version>" --notes-file <scratch>/v<version>-notes.md --latest`.
6. **Record.** On the next sprint's branch (never on `main` directly), add an "after the merge" section to the sprint's
   record: the PR, Codex, the merge, the export commit and its scan (counts and rules only), the install check's lines,
   the tag, and Aydin's checkout; and set the release status in `aydinlearns/CHANGELOG.md` and
   `aydinlearns/docs/planning/roadmap.md`, the only two places it lives. Commit path-limited.
7. **Aydin's checkout.** `C:\zehirlab`: if nothing listens on 5174 and `git status` shows no change that overlaps what
   `main` brings, `git -C C:\zehirlab pull --ff-only`. Leave Aydin's own uncommitted files as they are.
8. **Clean up.** Delete `<scratch>/pub` and the notes file once the release page shows the notes.

## Decision points and stop conditions

Stop, change nothing more, and report to Aydin when:

- any `FAIL` line in step 3 (a scan hit, a failed API check, a port or folder left behind). Never push past a FAIL.
- step 3 printed no `RESULT:` line, or exited with 2 (a usage error): the check did not run.
- the tag `v<version>` already exists, or `package.json` on `origin/main` says another version;
- a Codex comment on the merged PR is still unanswered;
- something listens on 5174, or Aydin's checkout has uncommitted changes that overlap what `main` brings (step 7 only:
  the release itself stands; say what is waiting);
- `gh` is logged in as anyone else.

A `NOTE` line (the monorepo's own path in an added line, ruling S7D-C04) does not stop the release; name it in the record.

## Verification

- `git -C <scratch>/pub log origin/main -1` equals the export commit after the push.
- `gh release view v<version> --repo maydinidil/aydinlearns` shows the tag on that commit, marked Latest.
- Nothing listens on 5194 and no `aydinlearns-release-*` folder is left in the temporary folder.

## Output

Report to Aydin in a few lines: the export commit and its file count, the check's `RESULT:` line and any NOTE, the push,
the release link, the record commit, and Aydin's checkout (fast-forwarded, or what waits). Print rules, paths, IDs,
counts and PASS or FAIL only: never a matched string, a key, a prefix or a held-out item.

## Failure and cleanup

- A failure before the push leaves the public repository untouched: `git -C <scratch>/pub reset --hard origin/main`, or
  delete the clone, then fix the cause on a branch and start again from step 1.
- A failure after the push but before the release: create the release on the pushed commit once the cause is fixed.
- If `release-check.ts` itself stops part way, check that nothing listens on 5194 (stop it by its process ID) and delete
  any `aydinlearns-release-*` folder in the temporary folder.
- Never run the launcher in a checkout or worktree to rehearse: it sets up whatever it finds stale there, `npm ci`
  included (ruling S7D-C05).
