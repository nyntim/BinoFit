#!/usr/bin/env sh
# Parallel feature workspaces for the ship workflow (docs/agents/ship.md).
#
# Each feature gets a git worktree at .worktrees/<slug> on its own branch,
# built independently, then landed on local main one at a time as exactly
# one fast-forwarded commit. Nothing here pushes.
#
#   ship.sh start <slug> [branch]   create the worktree from main and install deps
#   ship.sh path <slug>             print the worktree's absolute path
#   ship.sh status                  list workspaces with ahead/behind counts
#   ship.sh rebase <slug>           rebase the branch onto main (exit 2 on conflicts)
#   ship.sh land <slug>             re-bump version, run checks, fast-forward main
#   ship.sh clean <slug>            remove a landed worktree and its branch
#
# Env: SHIP_BASE (default main), SHIP_SKIP_INSTALL=1, SHIP_SKIP_CHECKS=1
set -eu

ROOT=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
BASE=${SHIP_BASE:-main}
WT_DIR="$ROOT/.worktrees"

die() { echo "ship: $*" >&2; exit 1; }

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

wt_path() {
  [ -n "${1:-}" ] || die "missing <slug>"
  echo "$WT_DIR/$1"
}

require_wt() {
  [ -d "$1" ] || die "no workspace at $1 (run: ship.sh start <slug>)"
}

wt_branch() { git -C "$1" rev-parse --abbrev-ref HEAD; }

require_clean() {
  [ -z "$(git -C "$1" status --porcelain)" ] || die "uncommitted changes in $1; commit them first"
}

# Sets every version field in the worktree to the given version so the
# pre-commit hook bumps from there.
set_version() {
  (cd "$1" && node -e "
const fs = require('fs');
const v = process.argv[1];
const edit = (file, fn) => {
  if (!fs.existsSync(file)) return;
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  fn(json);
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
};
edit('package.json', (p) => { p.version = v; });
edit('package-lock.json', (l) => { l.version = v; if (l.packages && l.packages['']) l.packages[''].version = v; });
edit('app.json', (a) => { a.expo.version = v; });
" "$2")
}

cmd_start() {
  slug=${1:-}
  echo "$slug" | grep -Eq '^[a-z0-9][a-z0-9-]*$' || die "slug must be lowercase letters, digits and dashes"
  branch=${2:-$slug}
  path=$(wt_path "$slug")
  [ ! -e "$path" ] || die "$path already exists"

  if git -C "$ROOT" fetch origin --quiet 2>/dev/null; then
    if git -C "$ROOT" rev-parse --verify --quiet "origin/$BASE" >/dev/null &&
       ! git -C "$ROOT" merge-base --is-ancestor "origin/$BASE" "$BASE"; then
      die "local $BASE is missing commits from origin/$BASE; pull $BASE first"
    fi
  else
    echo "ship: fetch failed, starting from local $BASE" >&2
  fi

  mkdir -p "$WT_DIR"
  git -C "$ROOT" worktree add --quiet -b "$branch" "$path" "$BASE"
  if [ "${SHIP_SKIP_INSTALL:-0}" != "1" ]; then
    (cd "$path" && npm ci --no-audit --no-fund --loglevel=error)
  fi
  echo "$path"
}

cmd_status() {
  [ -d "$WT_DIR" ] || { echo "no workspaces"; return; }
  found=0
  for path in "$WT_DIR"/*; do
    [ -d "$path" ] || continue
    found=1
    branch=$(wt_branch "$path")
    ahead=$(git -C "$path" rev-list --count "$BASE..HEAD")
    behind=$(git -C "$path" rev-list --count "HEAD..$BASE")
    dirty=""
    [ -z "$(git -C "$path" status --porcelain)" ] || dirty=" (uncommitted changes)"
    echo "$(basename "$path")  branch=$branch  ahead=$ahead  behind=$behind$dirty"
  done
  [ "$found" = 1 ] || echo "no workspaces"
}

cmd_rebase() {
  path=$(wt_path "${1:-}"); require_wt "$path"; require_clean "$path"
  if git -C "$path" rebase --quiet "$BASE"; then
    echo "rebased $(wt_branch "$path") onto $BASE"
    return
  fi
  echo "ship: conflicts rebasing onto $BASE in $path:" >&2
  git -C "$path" diff --name-only --diff-filter=U | sed 's/^/  /' >&2
  echo "Resolve them (see docs/agents/ship.md), git add the files, then run:" >&2
  echo "  git -C $path -c core.editor=true rebase --continue" >&2
  exit 2
}

cmd_land() {
  path=$(wt_path "${1:-}"); require_wt "$path"; require_clean "$path"
  branch=$(wt_branch "$path")
  git -C "$path" merge-base --is-ancestor "$BASE" HEAD || die "$branch is behind $BASE; run: ship.sh rebase ${1}"
  count=$(git -C "$path" rev-list --count "$BASE..HEAD")
  [ "$count" != 0 ] || die "$branch has no commits to land"
  [ "$count" = 1 ] || die "$branch has $count commits; squash to one (git -C $path reset --soft $BASE && git -C $path commit)"

  # The single commit gets exactly one bump on top of whatever main is now.
  base_version=$(git -C "$path" show "$BASE:package.json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).version))")
  set_version "$path" "$base_version"
  (cd "$path" && unset SKIP_VERSION_BUMP && git commit --quiet --amend --no-edit)
  version=$(cd "$path" && node -p "require('./package.json').version")

  if [ "${SHIP_SKIP_CHECKS:-0}" != "1" ]; then
    (cd "$path" && npm run --silent lint && npx tsc --noEmit && npm test --silent -- --ci) ||
      die "checks failed in $path; fix, amend the commit, and land again"
  fi

  # Fast-forward main wherever it is checked out, or move the ref directly.
  base_wt=$(git -C "$ROOT" worktree list --porcelain | awk -v ref="refs/heads/$BASE" '
    /^worktree / { wt = substr($0, 10) }
    $0 == "branch " ref { print wt }')
  if [ -n "$base_wt" ]; then
    git -C "$base_wt" merge --quiet --ff-only "$branch"
  else
    git -C "$ROOT" update-ref "refs/heads/$BASE" "$(git -C "$path" rev-parse HEAD)" "$(git -C "$ROOT" rev-parse "$BASE")"
  fi
  echo "landed $branch on $BASE as $(git -C "$ROOT" rev-parse --short "$BASE") (version $version, not pushed)"
}

cmd_clean() {
  path=$(wt_path "${1:-}"); require_wt "$path"
  branch=$(wt_branch "$path")
  git -C "$ROOT" merge-base --is-ancestor "$branch" "$BASE" || die "$branch is not on $BASE yet; land it first"
  require_clean "$path"
  # --force only drops ignored files such as node_modules; the tree is clean and landed.
  git -C "$ROOT" worktree remove --force "$path"
  git -C "$ROOT" branch --quiet -d "$branch"
  echo "removed $path and branch $branch"
}

case "${1:-}" in
  start)  shift; cmd_start "$@" ;;
  path)   shift; p=$(wt_path "${1:-}"); require_wt "$p"; echo "$p" ;;
  status) cmd_status ;;
  rebase) shift; cmd_rebase "$@" ;;
  land)   shift; cmd_land "$@" ;;
  clean)  shift; cmd_clean "$@" ;;
  *)      usage ;;
esac
