#!/bin/sh
# SessionStart hook: print one-time handoff notes into the session, then delete the file.
f="${CLAUDE_PROJECT_DIR:-.}/.claude/next-session.md"
[ -f "$f" ] || exit 0
echo "ONE-TIME NOTES FROM THE PREVIOUS SESSION (this file has been deleted from disk):"
echo
cat "$f"
echo
echo "When these notes are handled, commit the deletion of .claude/next-session.md so it is not loaded again."
rm -f "$f"
