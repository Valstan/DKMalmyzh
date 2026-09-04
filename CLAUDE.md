# CLAUDE.md

Перед любым действием полностью прочитай [`AGENTS.md`](AGENTS.md) и следуй ему как каноническим проектным правилам.

Claude-специфичные команды находятся в `.claude/commands/` (`/start`, `/close_session`), хук старта — в `.claude/scripts/session_start.sh`, а безопасные разрешения — в `.claude/settings.json`. Эти файлы общие и хранятся в Git. Локальные разрешения допустимы только в игнорируемом `.claude/settings.local.json`.
