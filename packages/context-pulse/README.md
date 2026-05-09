# @taimoorchatha/pi-context-pulse

A [pi coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) extension. Makes pi's input-editor border pulse yellow → red as the context window fills up, like an FPS damage-vignette.

- `< 25%` — default theme border color, no effect
- `25 → 100%` — border pulses; color lerps **yellow → red**, pulse depth and speed both ramp with usage
- `> 100%` — clamped to 100%

## Install

```bash
pi install npm:@taimoorchatha/pi-context-pulse
```

Or drop the source file directly into `~/.pi/agent/extensions/` (global) or `.pi/extensions/` in a project:

```bash
curl -o ~/.pi/agent/extensions/context-pulse.ts \
  https://raw.githubusercontent.com/taimoorchatha/pi-extensions/main/packages/context-pulse/src/index.ts
```

No compilation — pi loads TS directly via [jiti](https://github.com/unjs/jiti). `/reload` or start a new session and it activates.

### Load-order caveat

This extension customizes pi's input editor via `ctx.ui.setEditorComponent()`. If you have **another** extension that also sets an editor — the most common one is the vim-style `modal-editor.ts` from pi's own examples — pi loads extensions alphabetically and last-writer-wins, so the other one will clobber this and you'll see nothing.

Fix: rename so this loads after the other, e.g.

```bash
mv ~/.pi/agent/extensions/context-pulse.ts ~/.pi/agent/extensions/zz-context-pulse.ts
```

## Commands

```
/context-pulse            toggle on/off
/context-pulse test <pct> force a fake % for 8s (preview / tuning)
/context-pulse on | off   explicit
```

## Design notes

- **Truecolor ANSI** (`\x1b[38;2;R;G;Bm`). Most modern terminals support it. If yours doesn't, you'll see literal escape junk instead of a colored border — swap to a 256-color palette in `pulseColor()` if that's your situation.
- **Defensive try/catch** around the animation timer and inside the overridden `borderColor` function. `borderColor` is called from within `Editor.render()` every frame — an uncaught throw there takes pi's TUI loop down with it and leaves the terminal stuck in alt-screen + raw mode. This extension silently falls back to the default border color on any unexpected error instead.

## License

MIT — see [LICENSE](./LICENSE).
