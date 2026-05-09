/**
 * context-pulse
 *
 * Makes pi's input-editor border pulse yellow → red as the context window fills
 * up, like an FPS damage-vignette effect.
 *
 *   < 25%   : default theme border color (no effect)
 *   25-100% : pulsing border, color interpolates yellow → red,
 *             pulse depth + speed both ramp with usage %
 *   >100%   : treated as 100% (clamped)
 *
 * Commands:
 *   /context-pulse            → toggle on/off
 *   /context-pulse test <pct> → force a fake % for ~8s (for tuning/demo)
 */

import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
} from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";

const THRESHOLD_PCT = 25;
const ANIMATION_INTERVAL_MS = 80; // ~12 fps, smooth enough for pulsing without being a CPU hog

export default function (pi: ExtensionAPI) {
	let activeTui: TUI | undefined;
	let activeCtx: ExtensionContext | undefined;
	let animationTimer: ReturnType<typeof setInterval> | undefined;
	let enabled = true;

	// Optional override used by /context-pulse test <pct>
	let forcedPercent: number | undefined;
	let forcedUntil = 0;

	const currentPercent = (): number => {
		if (forcedPercent !== undefined && Date.now() < forcedUntil) {
			return forcedPercent;
		}
		forcedPercent = undefined;
		const usage = activeCtx?.getContextUsage();
		return usage?.percent ?? 0;
	};

	// 0..1 → 0..1, clamped
	const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

	/**
	 * Apply the pulsing color to a border string.
	 *
	 * Color: lerp yellow(255,200,40) → red(255,40,40) with intensity.
	 * Pulse: sine wave modulates brightness. Faster + deeper at higher intensity.
	 */
	const pulseColor = (text: string, percent: number): string => {
		const intensity = clamp01(
			(percent - THRESHOLD_PCT) / (100 - THRESHOLD_PCT),
		);

		// Base color: yellow → red
		const baseR = 255;
		const baseG = Math.round(200 - 160 * intensity); // 200 → 40
		const baseB = 40;

		// Pulse parameters scale with intensity
		const pulseHz = 1.0 + intensity * 2.8; // 1.0 Hz → 3.8 Hz
		const pulseDepth = 0.2 + intensity * 0.55; // 20% → 75%
		const t = Date.now() / 1000;
		// 0..1 sine phase, 1 = bright peak, 0 = dim trough
		const phase = (Math.sin(t * pulseHz * 2 * Math.PI) + 1) / 2;
		// factor: when phase=1 → 1 (full brightness); when phase=0 → 1-pulseDepth (dim)
		const factor = 1 - pulseDepth * (1 - phase);

		const r = Math.round(baseR * factor);
		const g = Math.round(baseG * factor);
		const b = Math.round(baseB * factor);

		// Truecolor ANSI foreground + reset.
		return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
	};

	const startAnimation = () => {
		if (animationTimer) return;
		animationTimer = setInterval(() => {
			try {
				if (!enabled) return;
				const pct = currentPercent();
				if (pct >= THRESHOLD_PCT) {
					activeTui?.requestRender();
				}
			} catch {
				// Never let a timer tick escape — an uncaught throw here
				// would take down the host process.
			}
		}, ANIMATION_INTERVAL_MS);
	};

	const stopAnimation = () => {
		if (animationTimer) {
			clearInterval(animationTimer);
			animationTimer = undefined;
		}
	};

	pi.on("session_start", (_event, ctx) => {
		activeCtx = ctx;
		stopAnimation();
		startAnimation();

		// Debug: prove that session_start is running.
		ctx.ui.notify("[ctx-pulse] session_start fired", "info");

		class PulsingEditor extends CustomEditor {
			constructor(
				tui: TUI,
				theme: EditorTheme,
				keybindings: KeybindingsManager,
			) {
				super(tui, theme, keybindings);
				activeTui = tui;

				// Debug: prove that the factory actually gets called (i.e. this
				// editor is the one on screen, not some other extension's).
				ctx.ui.setStatus("context-pulse", "\u25CF ctx-pulse");

				const defaultBorderColor = this.borderColor;
				this.borderColor = (s: string) => {
					// Called inside Editor.render() every frame. If anything in
					// here throws, it takes pi's TUI loop down with it and leaves
					// the terminal stuck in alt-screen + raw mode (same failure
					// mode as the context-trace "theme.fg('fg', ...)" bug).
					try {
						if (!enabled) return defaultBorderColor(s);
						const pct = currentPercent();
						if (pct < THRESHOLD_PCT) return defaultBorderColor(s);
						return pulseColor(s, pct);
					} catch {
						return defaultBorderColor(s);
					}
				};
			}
		}

		ctx.ui.setEditorComponent(
			(tui, theme, keybindings) => new PulsingEditor(tui, theme, keybindings),
		);
	});

	pi.on("session_shutdown", () => {
		stopAnimation();
		activeTui = undefined;
		activeCtx = undefined;
	});

	pi.registerCommand("context-pulse", {
		description:
			"Toggle the context-window pulsing border, or '/context-pulse test <pct>' to preview",
		handler: async (args, ctx) => {
			const trimmed = (args ?? "").trim();

			// /context-pulse test <pct>
			if (trimmed.toLowerCase().startsWith("test")) {
				const rest = trimmed.slice(4).trim();
				const pct = Number.parseFloat(rest);
				if (!Number.isFinite(pct)) {
					ctx.ui.notify(
						"Usage: /context-pulse test <percent>  (e.g. /context-pulse test 80)",
						"warning",
					);
					return;
				}
				forcedPercent = Math.max(0, Math.min(100, pct));
				forcedUntil = Date.now() + 8000;
				ctx.ui.notify(
					`Forcing context-pulse to ${forcedPercent}% for 8s`,
					"info",
				);
				activeTui?.requestRender();
				return;
			}

			// /context-pulse         → toggle
			// /context-pulse on/off  → explicit
			if (trimmed === "on") enabled = true;
			else if (trimmed === "off") enabled = false;
			else enabled = !enabled;

			ctx.ui.notify(`context-pulse ${enabled ? "on" : "off"}`, "info");
			activeTui?.requestRender();
		},
	});
}
