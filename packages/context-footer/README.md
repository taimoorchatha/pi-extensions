# @taimoorchatha/pi-context-footer

A [pi coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) extension. Replaces pi's footer with a turn-by-turn context-usage readout:

```
████░░░░░░ 42.3% 84k/200k +1.2k  assistant: response (320 out)
^bar        ^pct  ^tokens ^delta  ^last event
```

- Updates after every user message, assistant message, and tool call.
- Bar color: **green → yellow at 65% → red at 85%**.
- Real token counts come from the provider (`ctx.getContextUsage()`) after each assistant turn. Between turns, deltas are ~4-chars-per-token estimates reconciled against the real value on the next assistant reply. Estimated rows are marked with a leading `~`.
- Default shows only the most recent event. `/context-footer <N>` expands to the last N turns on separate lines (capped at 20).

## Install

```bash
pi install npm:@taimoorchatha/pi-context-footer
```

Or drop the source file directly into `~/.pi/agent/extensions/` (global) or `.pi/extensions/` in a project:

```bash
curl -o ~/.pi/agent/extensions/context-footer.ts \
  https://raw.githubusercontent.com/taimoorchatha/pi-extensions/main/packages/context-footer/src/index.ts
```

No compilation — pi loads TS directly via [jiti](https://github.com/unjs/jiti). `/reload` or start a new session and it activates.

## Commands

```
/context-footer           toggle on/off
/context-footer <N>       show last N turns on separate lines (0 = hide, max 20)
/context-footer on | off  explicit
```

## What counts against the context window?

Everything sent to the LLM per turn:

1. **System prompt** — pi's baseline instructions + tool descriptions + any `AGENTS.md` + loaded skills. Usually **5–15k tokens on its own** before the conversation starts.
2. **Tool results** — `read` on large files, `bash` output on builds/tests/logs. **Usually the dominant contributor in coding sessions.**
3. **Assistant responses** — including the hidden reasoning tokens on thinking-capable models.
4. **Tool calls** — the arguments the model sent.
5. **Your prompts** — typically the smallest slice.

That's why the bar can jump 5–10% after a single large file read while a short typed prompt barely moves the needle. The delta column reflects all of it.

## Design notes

Learned from rebuilding this after an earlier attempt crashed pi hard:

- **No `pi.sendMessage()` calls, ever.** The old design injected a "marker" message after each turn and tried to hide those markers from the LLM with an `on("context")` filter. The filter checked the wrong field, so every marker leaked into the model's view of the conversation, looking like a new short user turn — the model kept replying briefly and its own reply triggered another marker, producing a tight reply loop. This extension is pure footer. It never touches the LLM's message list.
- **Only documented `ThemeColor` keys.** `theme.fg()` throws on unknown keys, and because it's called from inside the TUI's render loop the throw can kill pi outright (terminal stays stuck in alt-screen + raw mode). Uses only `text`, `accent`, `muted`, `dim`, `success`, `warning`, `error`.
- **Defensive try/catch** in every lifecycle handler and inside the footer's `render()`. If anything unexpected throws, the footer silently degrades to `ctx ?` instead of taking pi down.

## License

MIT — see [LICENSE](./LICENSE).
