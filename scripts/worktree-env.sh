#!/usr/bin/env sh
# Link the main checkout's local env files into a git worktree.
#
# `.env*` is gitignored, so a fresh worktree has none of them and every dev
# server there starts without developer-local settings. Run from anywhere inside
# a worktree (Claude Code's SessionStart hook does) and each `.env*` of the
# main checkout that the worktree lacks becomes a symlink — `.env`,
# `.env.samuel`, `.env.daniel`, whatever is there. `.env.example` is
# tracked and skipped. Outside a worktree this is a no-op.
set -eu

top=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
main=$(dirname "$common")
[ "$main" = "$top" ] && exit 0 # not a worktree

linked=""
for src in "$main"/.env "$main"/.env.*; do
	[ -e "$src" ] || continue
	name=$(basename "$src")
	case "$name" in *.example) continue ;; esac
	dst="$top/$name"
	[ -e "$dst" ] || [ -L "$dst" ] && continue
	ln -s "$src" "$dst"
	linked="$linked $name"
done
[ -n "$linked" ] && echo "worktree-env: linked$linked from $main"
exit 0
