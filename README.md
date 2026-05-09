# pi-extensions

Two small extensions for the [pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) that give you a visual read on how full the model's context window is getting.

## Extensions

### `context-pulse.ts`

Makes pi's input-editor border pulse yellow → red as the context window fills up, like an FPS damage-vignette. Below 25% context the border is the default theme color; from 25% to 100% it pulses with color and pulse-speed ramping with usage.

```
/context-pulse            toggle on/off
/context-pulse test <pct> force a fake % for 8s (preview/demo)
/context-pulse on | off   explicit
```

### `context-footer.ts`

Replaces pi's footer with a turn-by-turn context-usage readout:

```
████░░░░░░ 42.3% 84k/200k +1.2k  assistant: response (320 out)
^bar        ^pct  ^tokens ^delta  ^last event
```

- Updates after every user message, assistant message, and tool call.
- Real token counts come from the provider (`ctx.getContextUsage()`) after each assistant turn; between turns, deltas are ~4-chars-per-token estimates reconciled on the next real reading. Estimated values are marked with a leading `~`.
- Default shows just the latest event. Use `/context-footer N` to expand the last N turns on separate lines (capped at 20).

```
/context-footer           toggle on/off
/context-footer <N>       show N lines of history (0 = hide)
/context-footer on | off  explicit
```

## What counts against the context window?

Everything sent to the LLM per turn: the system prompt (usually 5–15k tokens on its own), all past user messages, all past assistant responses (including reasoning tokens), every tool call's arguments, and every tool result. Tool results — especially `read` on large files and `bash` output — are usually the dominant contributor in coding sessions. Your typed prompts are almost always the smallest slice.

## Install

Drop either file into `~/.pi/agent/extensions/` (global) or `.pi/extensions/` in a project (project-local):

```bash
curl -o ~/.pi/agent/extensions/context-pulse.ts  https://raw.githubusercontent.com/taimoorchatha/pi-extensions/main/context-pulse.ts
curl -o ~/.pi/agent/extensions/context-footer.ts https://raw.githubusercontent.com/taimoorchatha/pi-extensions/main/context-footer.ts
```

Pi auto-discovers them on the next session (or `/reload`). No compilation step — extensions are loaded via [jiti](https://github.com/unjs/jiti).

### Load-order caveat for `context-pulse.ts`

`context-pulse` customizes pi's input editor via `ctx.ui.setEditorComponent()`. If you have *another* extension that also sets an editor (the most common one is the vim-style `modal-editor.ts` from pi's own examples), pi loads extensions alphabetically and last-writer-wins — so the other one will clobber `context-pulse` and you'll see nothing.

Fix: rename so it loads after the other one, e.g.

```bash
mv ~/.pi/agent/extensions/context-pulse.ts ~/.pi/agent/extensions/zz-context-pulse.ts
```

`/reload` and the pulsing border will appear. (`context-footer.ts` doesn't have this issue in practice — pi's `custom-footer.ts` example is opt-in, not installed-by-default.)

## Design notes

Both extensions are intentionally UI-only:

- **No `pi.sendMessage()` calls.** Message injection plus a subtly-broken filter is how the old `context-trace` extension I was starting from ended up polluting the LLM's conversation and causing tight reply loops. Anything these extensions want to show, they render directly — footer for `context-footer`, the editor's own border string for `context-pulse`.
- **Only documented ThemeColor keys.** `theme.fg(…)` throws on unknown keys, and because it's called from inside the TUI's render loop the throw can take pi's terminal down with it (alt-screen + raw mode stay stuck). Uses only `text`, `accent`, `muted`, `dim`, `success`, `warning`, `error`.
- **Defensive try/catch** around every lifecycle handler and the footer's / border's `render()` — if anything unexpected throws, the extension silently falls back to a safe no-op instead of killing the host process.

## License

MIT. See [LICENSE](./LICENSE).
