#!/usr/bin/env bash
# tools/export-public.sh: refreshes the public copy of aydinlearns (github.com/maydinidil/aydinlearns) from the private
# monorepo it is developed in.
#
# Usage, from anywhere inside the monorepo:
#   gh repo clone maydinidil/aydinlearns <clone>      # once per refresh, into a folder outside the monorepo
#   bash aydinlearns/tools/export-public.sh <clone> [<ref>]
#   git -C <clone> push                               # after looking at the commit
#
# It replaces the clone's files with the tracked files of aydinlearns/ at <ref> (default HEAD), then commits once,
# authored with the GitHub account's noreply address. Only tracked files leave (git archive), so logs/, data/ and every
# other ignored file stay behind, and no private history, commit message, email address or link goes with them.
# It never pushes.
set -euo pipefail

PUBLIC_REPO=maydinidil/aydinlearns
OWNER=${PUBLIC_REPO%%/*}

clone=${1:?usage: export-public.sh <public clone> [<ref>]}
ref=${2:-HEAD}
root=$(git rev-parse --show-toplevel)

# The target must be a clone of the public repo, and no checkout or worktree of this monorepo.
[ -d "$clone/.git" ] || [ -f "$clone/.git" ] || { echo "not a git clone: $clone" >&2; exit 2; }
origin=$(git -C "$clone" remote get-url origin 2>/dev/null || true)
[[ "$origin" =~ ^(https://github\.com/|git@github\.com:|ssh://git@github\.com/)$PUBLIC_REPO(\.git)?$ ]] || { echo "the clone's origin is not $PUBLIC_REPO: ${origin:-none}" >&2; exit 2; }
[ "$(git -C "$clone" rev-parse --path-format=absolute --git-common-dir)" != "$(git -C "$root" rev-parse --path-format=absolute --git-common-dir)" ] \
  || { echo "the clone shares this monorepo's repository" >&2; exit 2; }
clonetop=$(git -C "$clone" rev-parse --show-toplevel)
case "$clonetop/" in "$root"/*) echo "the clone must be outside the monorepo" >&2; exit 2 ;; esac
[ -z "$(git -C "$clone" status --porcelain)" ] || { echo "the public clone has uncommitted changes" >&2; exit 2; }
git -C "$root" cat-file -e "$ref:aydinlearns" || { echo "no aydinlearns/ at $ref" >&2; exit 2; }

login=$(gh api user -q .login)
id=$(gh api user -q .id)
[ "$login" = "$OWNER" ] || { echo "gh is logged in as $login, not $OWNER" >&2; exit 2; }

# Replace the clone's tracked files with the folder's tracked files at <ref>. On a failure, say how to undo.
trap 'echo "stopped part way; to undo in the clone: git -C \"$clone\" reset --hard && git -C \"$clone\" clean -fd" >&2' ERR
git -C "$clone" rm -rq --ignore-unmatch -- .
git -C "$root" archive "$ref" aydinlearns | tar -x --strip-components=1 -C "$clone"
git -C "$clone" -c core.safecrlf=false add -A
trap - ERR

if git -C "$clone" diff --cached --quiet; then echo "nothing to refresh"; exit 0; fi

echo "Exporting aydinlearns/ at $(git -C "$root" rev-parse --short "$ref") as $login <$id+$login@users.noreply.github.com>"
git -C "$clone" -c user.name="$login" -c user.email="$id+$login@users.noreply.github.com" \
  commit -q -m "Refresh from the development repository ($(date +%F))"
git -C "$clone" log --oneline -1
git -C "$clone" show --stat --format= HEAD | tail -1
echo "Look it over, then push: git -C \"$clone\" push"
