# pi-extensions

Extensions for the [pi coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent). This is a monorepo; each package under `packages/` publishes to npm independently.

## Packages

| Package | Description |
|---|---|
| [`@taimoorchatha/pi-context-pulse`](./packages/context-pulse) | Input-editor border pulses yellow → red as the context window fills up, like an FPS damage-vignette. |
| [`@taimoorchatha/pi-context-footer`](./packages/context-footer) | Turn-by-turn context-usage readout in the footer — bar, %, tokens, delta, last event. |

Install each with pi's package installer:

```bash
pi install npm:@taimoorchatha/pi-context-pulse
pi install npm:@taimoorchatha/pi-context-footer
```

Or copy the `src/index.ts` of either package straight into `~/.pi/agent/extensions/` — pi loads TS directly via [jiti](https://github.com/unjs/jiti), no compilation step.

## Repo layout

```
.
├── packages/
│   ├── context-pulse/       → @taimoorchatha/pi-context-pulse
│   └── context-footer/      → @taimoorchatha/pi-context-footer
├── package.json             workspace root
├── tsconfig.base.json       shared TS config
├── README.md                this file
└── LICENSE
```

## Contributing

Issues and PRs welcome at https://github.com/taimoorchatha/pi-extensions/issues.

## License

MIT — see [LICENSE](./LICENSE). Each published package also ships its own `LICENSE` per npm convention.
