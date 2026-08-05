---
description: Append today's commits to content/devlog.md as raw post material
allowed-tools: Read, Write, Bash(git log:*), Bash(git show:*), Bash(git diff:*)
---
## Today's commits
!`git log --since="6am" --pretty=format:'%h %s' --stat`

Append a dated entry to content/devlog.md. For each meaningful change:
- what a user can now do that they could not before (if nothing, write "internal:" and one line on why it matters)
- one concrete number if one exists (ms saved, files touched, lines deleted)
- what was actually hard about it

No marketing language. No adjectives. This is raw material, not a post.
