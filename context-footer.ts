/**
 * context-footer
 *
 * Turn-by-turn context-usage readout in the footer.
 *
 *   [████████░░] 42.3% 84k/200k +1.2k  assistant: thinking + tool-calls (320 out)
 *   ^bar         ^pct  ^tokens ^delta  ^last event
 *
 * Fed by real token counts from `ctx.getContextUsage()` after every assistant
 * `message_end`, and by ~4-chars-per-token estimates between assistant messages
 * (user prompts, tool results). The estimate is reconciled against the real
 * value on the next assistant turn.
 *
 * Design notes (learned from the old context-trace.ts bugs):
 *   - This is a FOOTER ONLY. No `pi.sendMessage()`, no `on("context")` filter.
 *     It never touches the LLM's view of the conversation, so it cannot pollute
 *     context or trigger reply loops.
 *   - Only uses documented ThemeColor keys (text, accent, muted, dim, success,
 *     warning, error) — never "fg" or "info", which don't exist on the current
 *     palette and make `theme.fg()` throw from inside the render loop.
 *   - Every lifecycle handler and the footer's `render()` are wrapped in
 *     try/catch so an unexpected throw can't take pi's TUI loop down.
 *
 * Commands:
 *   /context-footer           → toggle on/off
 *   /context-footer on|off    → explicit
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";

const BAR_WIDTH = 10;
const CHARS_PER_TOKEN = 4;
// How many recent snapshots to show in the footer by default.
// Tunable at runtime via '/context-footer <N>'.
const DEFAULT_HISTORY_SIZE = 1;
const MAX_HISTORY_SIZE = 20;

type Kind = "user" | "assistant" | "tool";

interface Snapshot {
	kind: Kind;
	label: string;
	tokens: number | null;
	contextWindow: number;
	percent: number | null;
	delta: number;
	estimated: boolean;
}

function estimateTokens(text: string): number {
	if (!text) return 0;
	return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

function extractText(content: unknown): string {
	if (content == null) return "";
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const c of content as Array<Record<string, unknown>>) {
		if (typeof c === "string") {
			parts.push(c);
			continue;
		}
		if (!c || typeof c !== "object") continue;
		if (typeof c.text === "string") parts.push(c.text);
		else if (typeof c.thinking === "string") parts.push(c.thinking);
	}
	return parts.join("\n");
}

function formatTokens(n: number | null): string {
	if (n == null) return "?";
	const abs = Math.abs(n);
	if (abs < 1000) return `${n}`;
	if (abs < 1_000_000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
	return `${(n / 1_000_000).toFixed(2)}M`;
}

function shortPreview(text: string, max: number): string {
	const firstLine = text.trim().split("\n")[0] ?? "";
	if (firstLine.length <= max) return firstLine;
	return firstLine.slice(0, max - 1) + "…";
}

function summarizeToolInput(name: string, input: unknown): string {
	if (!input || typeof input !== "object") return name;
	const i = input as Record<string, unknown>;
	switch (name) {
		case "read":
			return `read ${i.path ?? ""}`;
		case "write":
			return `write ${i.path ?? ""}`;
		case "edit":
			return `edit ${i.path ?? ""}`;
		case "bash":
			return `bash: ${shortPreview(String(i.command ?? ""), 40)}`;
		default:
			return name;
	}
}

// Only uses documented ThemeColor keys.
function renderBar(percent: number | null, width: number, theme: any): string {
	const pct = Math.max(0, Math.min(100, percent ?? 0));
	const filled = Math.round((pct / 100) * width);
	const empty = Math.max(0, width - filled);
	let color: string;
	if (pct >= 85) color = "error";
	else if (pct >= 65) color = "warning";
	else color = "success";
	return (
		theme.fg(color, "█".repeat(filled)) + theme.fg("dim", "░".repeat(empty))
	);
}

export default function (pi: ExtensionAPI) {
	let enabled = true;
	let historySize = DEFAULT_HISTORY_SIZE;
	// Oldest at index 0, newest at the end. Trimmed to historySize on each append
	// and whenever historySize is reduced via the command.
	const history: Snapshot[] = [];

	// Running state for reconciling estimates against real provider readings.
	let lastRealTokens: number | null = null;
	let lastRealContextWindow = 0;
	let estAccumulator = 0;

	function snapshot(
		ctx: ExtensionContext,
		kind: Kind,
		label: string,
		deltaEst: number,
		reconcile: boolean,
	) {
		try {
			const usage = ctx.getContextUsage?.();
			const contextWindow = usage?.contextWindow ?? lastRealContextWindow ?? 0;
			lastRealContextWindow = contextWindow;

			let tokens: number | null;
			let percent: number | null;
			let estimated: boolean;
			let delta = deltaEst;

			const realTokens =
				reconcile && usage && usage.tokens != null ? usage.tokens : null;
			if (realTokens != null && usage) {
				// Real reading → reset the estimator.
				const prev = lastRealTokens;
				tokens = realTokens;
				percent = usage.percent ?? null;
				estimated = false;
				delta = prev != null ? Math.max(0, realTokens - prev) : realTokens;
				lastRealTokens = realTokens;
				estAccumulator = 0;
			} else {
				estAccumulator += deltaEst;
				const base = lastRealTokens ?? 0;
				tokens = base + estAccumulator;
				percent =
					contextWindow > 0
						? Math.round((tokens / contextWindow) * 1000) / 10
						: null;
				estimated = true;
			}

			history.push({
				kind,
				label,
				tokens,
				contextWindow,
				percent,
				delta,
				estimated,
			});
			while (history.length > historySize) history.shift();
		} catch {
			// Never let a lifecycle handler throw into pi.
		}
	}

	// --- Lifecycle handlers (all defensive) ---

	pi.on("message_start", async (event, ctx) => {
		try {
			if (event.message.role !== "user") return;
			const text = extractText((event.message as { content: unknown }).content);
			const delta = estimateTokens(text);
			const preview = shortPreview(text, 40) || "(empty)";
			snapshot(ctx, "user", `you: ${preview}`, delta, false);
		} catch {
			/* swallow */
		}
	});

	pi.on("message_end", async (event, ctx) => {
		try {
			if (event.message.role !== "assistant") return;
			const m = event.message as {
				content?: Array<Record<string, unknown>>;
				usage?: { output?: number };
			};
			const outTokens = m.usage?.output ?? 0;
			const content = Array.isArray(m.content) ? m.content : [];
			const hadThinking = content.some((c) => c?.type === "thinking");
			const hadTools = content.some((c) => c?.type === "toolCall");
			const bits: string[] = [];
			if (hadThinking) bits.push("thinking");
			if (hadTools) bits.push("tool-calls");
			if (!bits.length) bits.push("response");
			const label = `assistant: ${bits.join(" + ")} (${formatTokens(outTokens)} out)`;
			snapshot(ctx, "assistant", label, outTokens, true);
		} catch {
			/* swallow */
		}
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		try {
			const anyEv = event as {
				toolName: string;
				result?: { content?: unknown };
				args?: unknown;
				input?: unknown;
			};
			const resultText = extractText(anyEv.result?.content);
			const delta = estimateTokens(resultText);
			const label = summarizeToolInput(
				event.toolName,
				anyEv.args ?? anyEv.input,
			);
			snapshot(ctx, "tool", label, delta, false);
		} catch {
			/* swallow */
		}
	});

	// --- Footer ---

	function renderSnapshotLine(
		snap: Snapshot,
		width: number,
		theme: any,
	): string {
		const bar = renderBar(snap.percent, BAR_WIDTH, theme);
		const pctStr = snap.percent != null ? `${snap.percent.toFixed(1)}%` : "?%";
		const tokStr = `${formatTokens(snap.tokens)}/${formatTokens(snap.contextWindow)}`;
		const estTag = snap.estimated ? theme.fg("dim", "~") : " ";

		const left = `${bar} ${estTag}${theme.fg("text", pctStr)} ${theme.fg("dim", tokStr)}`;
		const deltaPart =
			snap.delta > 0 ? theme.fg("dim", ` +${formatTokens(snap.delta)}`) : "";
		const labelPart = theme.fg("muted", `  ${snap.label}`);

		return truncateToWidth(left + deltaPart + labelPart, width, "…");
	}

	function renderLiveLine(
		ctx: ExtensionContext,
		width: number,
		theme: any,
	): string {
		// No history yet — synthesize a single placeholder line from the live reading.
		const live = ctx.getContextUsage?.();
		const percent = live?.percent ?? null;
		const tokens = live?.tokens ?? null;
		const contextWindow = live?.contextWindow ?? 0;

		const bar = renderBar(percent, BAR_WIDTH, theme);
		const pctStr = percent != null ? `${percent.toFixed(1)}%` : "?%";
		const tokStr = `${formatTokens(tokens)}/${formatTokens(contextWindow)}`;

		const line = `${bar}  ${theme.fg("text", pctStr)} ${theme.fg("dim", tokStr)}${theme.fg(
			"muted",
			"  (waiting for first turn…)",
		)}`;
		return truncateToWidth(line, width, "…");
	}

	function installFooter(ctx: ExtensionContext) {
		ctx.ui.setFooter((tui, theme, _footerData) => ({
			invalidate() {},
			render(width: number): string[] {
				try {
					if (!enabled) return [];
					void tui;

					if (history.length === 0) {
						return [renderLiveLine(ctx, width, theme)];
					}

					// Oldest first — newest renders closest to the input editor.
					return history.map((snap) => renderSnapshotLine(snap, width, theme));
				} catch {
					// Never throw from inside render — it takes pi's TUI loop down.
					try {
						return [theme.fg("dim", "ctx ?")];
					} catch {
						return ["ctx ?"];
					}
				}
			},
			dispose: () => {},
		}));
	}

	pi.on("session_start", async (_event, ctx) => {
		if (enabled) installFooter(ctx);
	});

	pi.on("session_shutdown", () => {
		// Footer is torn down by pi on shutdown; nothing to do here.
	});

	pi.registerCommand("context-footer", {
		description:
			"Toggle the per-turn context footer. '/context-footer N' sets history lines (0=hide). 'on'/'off' for explicit toggle.",
		handler: async (args, ctx) => {
			const arg = (args ?? "").trim().toLowerCase();

			// Numeric argument sets the history size directly (0 hides).
			const parsed = Number.parseInt(arg, 10);
			if (Number.isFinite(parsed) && String(parsed) === arg) {
				const clamped = Math.max(0, Math.min(MAX_HISTORY_SIZE, parsed));
				if (clamped === 0) {
					enabled = false;
					ctx.ui.setFooter(undefined);
					ctx.ui.notify("context-footer off", "info");
					return;
				}
				historySize = clamped;
				while (history.length > historySize) history.shift();
				if (!enabled) {
					enabled = true;
					installFooter(ctx);
				}
				ctx.ui.notify(
					`context-footer showing ${historySize} line${historySize === 1 ? "" : "s"}`,
					"info",
				);
				return;
			}

			if (arg === "on") enabled = true;
			else if (arg === "off") enabled = false;
			else enabled = !enabled;

			if (enabled) installFooter(ctx);
			else ctx.ui.setFooter(undefined);

			ctx.ui.notify(`context-footer ${enabled ? "on" : "off"}`, "info");
		},
	});
}
