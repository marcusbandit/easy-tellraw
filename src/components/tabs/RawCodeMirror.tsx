import React from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { lineNumbers } from '@codemirror/view';
import { linter, Diagnostic } from '@codemirror/lint';
import { syntaxColors } from '../../syntaxColors';
import { StateField, RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, WidgetType } from '@codemirror/view';

export interface RawCodeMirrorProps {
	value: string;
	onChange: (next: string) => void;
	onDiagnostics?: (diags: Array<{ line: number; message: string }>) => void;
}

const allowedInlineKeys = new Set<string>([
	'color', 'style', 'class', 'italic', 'bold', 'underline', 'underlined', 'strikethrough'
]);
const inlineBooleanKeys = new Set<string>(['italic','bold','underline','underlined','strikethrough']);

const allowedStylesBlockKeys = new Set<string>([
	'color', 'style', 'italic', 'bold', 'underline', 'underlined', 'strikethrough'
]);

function computeKnowns(source: string) {
	const knownStyles = new Set<string>();
	const knownChars = new Set<string>();
	const knownButtons = new Set<string>();
	try {
		source.split(/\r?\n/).forEach((ln) => {
			const t = ln.trim();
			let m: RegExpMatchArray | null;
			if ((m = t.match(/^style\.([A-Za-z0-9_-]+)\b/i))) {
				knownStyles.add(m[1]);
			}
			if ((m = t.match(/^character\.([A-Za-z0-9_-]+)/i))) {
				knownChars.add(m[1].toLowerCase());
			}
			if ((m = t.match(/^character\.(\d+)\s+(.+)$/i))) {
				const props = m[2];
				const nameMatch = props.match(/(?:^|\s)name\s*=\s*([A-Za-z0-9_-]+)/);
				if (nameMatch) knownChars.add(nameMatch[1].toLowerCase());
			}
			if ((m = t.match(/^button\.([A-Za-z0-9_-]+)/i))) {
				knownButtons.add(m[1].toLowerCase());
			}
			if ((m = t.match(/^button\.(\d+)\s+(.+)$/i))) {
				const idx = m[1];
				knownButtons.add(`button_${idx}`.toLowerCase());
				const props = m[2];
				const labelMatch = props.match(/(?:^|\s)label\s*=\s*([A-Za-z0-9_-]+)/);
				if (labelMatch) knownButtons.add(labelMatch[1].toLowerCase());
			}
			const speaker = t.match(/^([A-Za-z0-9_-]+)(\{[^}]*\})?\s*:/);
			if (speaker) knownChars.add(speaker[1].toLowerCase());
		});
	} catch {}
	return { knownStyles, knownChars, knownButtons };
}

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}

function suggestClosest(word: string, candidates: string[], max = 2): string | null {
    let best: string | null = null;
    let bestDist = Infinity;
    const lower = word.toLowerCase();
    for (const c of candidates) {
        const d = levenshtein(lower, c.toLowerCase());
        if (d < bestDist) { bestDist = d; best = c; }
    }
    return bestDist <= max ? best : null;
}

function computeDiagnostics(doc: string): Diagnostic[] {
	const diags: Diagnostic[] = [];
	const { knownStyles, knownChars, knownButtons } = computeKnowns(doc);
	const lines = doc.split(/\r?\n/);
	let inStyles = false;
	let offsetBase = 0;
	for (let i = 0; i < lines.length; i++) {
		const ln = lines[i];
		const t = ln.trim();
		// Track styles block
		if (/^@styles\s*$/i.test(t)) { inStyles = true; offsetBase += ln.length + 1; continue; }
		if (/^@endstyles\s*$/i.test(t)) { inStyles = false; offsetBase += ln.length + 1; continue; }
		// Invalid scene header
		if (/^\s*@/.test(ln) && !/^\s*@([A-Za-z0-9_-]+)\s*$/.test(ln)) {
			diags.push({
				from: offsetBase + ln.indexOf('@'),
				to: offsetBase + ln.indexOf('@') + 1,
				severity: 'warning',
				message: 'Invalid node name. Use @name with letters, digits, _ or - only.'
			});
		}
		// Inline blocks: unknown keys + missing inline close when applicable
		let m: RegExpExecArray | null;
		const braceRe = /\{([^}]*)\}/g;
		while ((m = braceRe.exec(ln)) !== null) {
			const inner = m[1] || '';
			// Unknown inline keys
			const keyRe = /(\b)([A-Za-z_][A-Za-z0-9_]*)(?==)/g;
			let km: RegExpExecArray | null;
			while ((km = keyRe.exec(inner)) !== null) {
				const key = km[2];
                if (!allowedInlineKeys.has(key) && !/^name_.+/.test(key) && !/^text_.+/.test(key)) {
                    const from = offsetBase + m.index + 1 + km.index + km[1].length;
                    const to = from + key.length;
                    const candidates = ['color','style','bold','italic','underline','underlined','strikethrough'];
                    const suggestion = suggestClosest(key, candidates);
                    const msg = `Warning: unknown property '${key}'\nDid you mean:`;
                    const actions = suggestion ? [{ name: `${suggestion}`, apply: (view: EditorView) => view.dispatch({ changes: { from, to, insert: suggestion } }) }] : undefined;
                    diags.push({ from, to, severity: 'warning', message: msg, actions: actions as any });
				}
			}
			// Inline boolean value suggestions (e.g., tru -> true, fls -> false)
			const assignRe = /([A-Za-z_][A-Za-z0-9_]*)(\s*)=(\s*)([^\s}]+)/g;
			let am: RegExpExecArray | null;
			while ((am = assignRe.exec(inner)) !== null) {
				const key = am[1];
				const value = am[4];
				// Suggest for style=NAME on the value side
				if ((key === 'style' || /_style$/i.test(key)) && value && !knownStyles.has(value)) {
					const suggestion = suggestClosest(value, Array.from(knownStyles));
					if (suggestion) {
						const valueStart = offsetBase + m.index + 1 + am.index + am[1].length + am[2].length + 1 + am[3].length;
						const from = valueStart;
						const to = valueStart + value.length;
						const msg = `Warning: unknown style '${value}'\nDid you mean:`;
						const actions = [{ name: `${suggestion}`, apply: (view: EditorView) => view.dispatch({ changes: { from, to, insert: suggestion } }) }];
						diags.push({ from, to, severity: 'warning', message: msg, actions: actions as any });
					}
				}
				if ((inlineBooleanKeys.has(key) || /^(?:name|text)_(?:italic|bold|underline|underlined|strikethrough)$/i.test(key)) && !/^(true|false)$/i.test(value)) {
					const suggestion = suggestClosest(value, ['true','false']);
					if (suggestion) {
						const valueStart = offsetBase + m.index + 1 + am.index + am[1].length + am[2].length + 1 + am[3].length;
						const from = valueStart;
						const to = valueStart + value.length;
						const msg = `Warning: invalid boolean value '${value}'\nDid you mean:`;
						const actions = [{ name: `${suggestion}`, apply: (view: EditorView) => view.dispatch({ changes: { from, to, insert: suggestion } }) }];
						diags.push({ from, to, severity: 'warning', message: msg, actions: actions as any });
					}
				}
			}
		}
		// In styles block: validate keys, colors, booleans
        if (inStyles && /^(style\.|character\.|button\.)/i.test(t)) {
            // Compute props start precisely from the original line (not trimmed)
            const headerMatch = ln.match(/^(\s*)(style|character|button)\.[A-Za-z0-9_-]+(\s+)/i);
            if (headerMatch) {
                const propsStart = headerMatch[0].length;
                const props = ln.slice(propsStart);
                const assignRe = /([A-Za-z_][A-Za-z0-9_]*)(\s*)=(\s*)(\S+)/g;
                let am: RegExpExecArray | null;
                while ((am = assignRe.exec(props)) !== null) {
                    const key = am[1];
                    const value = am[4];
                    const keyFromAbs = offsetBase + propsStart + am.index;
                    const keyToAbs = keyFromAbs + key.length;
                    const valueFromAbs = offsetBase + propsStart + am.index + am[1].length + am[2].length + 1 + am[3].length;
                    const valueToAbs = valueFromAbs + value.length;
                    const keyAllowed = allowedStylesBlockKeys.has(key) || /^name_.+/.test(key) || /^text_.+/.test(key);
                    if (!keyAllowed) {
                        const candidates = ['color','style','bold','italic','underline','underlined','strikethrough','name_color','name_bold','name_italic','name_underline','name_underlined','name_strikethrough','text_color','text_bold','text_italic','text_underline','text_underlined','text_strikethrough'];
                        const suggestion = suggestClosest(key, candidates);
                        const msg = `Warning: unknown property '${key}'\nDid you mean:`;
                        const actions = suggestion ? [{ name: `${suggestion}`, apply: (view: EditorView) => view.dispatch({ changes: { from: keyFromAbs, to: keyToAbs, insert: suggestion } }) }] : undefined;
                        diags.push({ from: keyFromAbs, to: keyToAbs, severity: 'warning', message: msg, actions: actions as any });
                        if (typeof value === 'string' && value.length > 0) {
                            const boolSuggestion = suggestClosest(value, ['true','false']);
                            if (boolSuggestion) {
                                const vMsg = `Warning: invalid value '${value}'\nDid you mean:`;
                                const vActions = [{ name: `${boolSuggestion}`, apply: (view: EditorView) => view.dispatch({ changes: { from: valueFromAbs, to: valueToAbs, insert: boolSuggestion } }) }];
                                diags.push({ from: valueFromAbs, to: valueToAbs, severity: 'warning', message: vMsg, actions: vActions as any });
                            }
                        }
                        continue;
                    }
                    if ((key === 'color' || /_color$/i.test(key)) && !/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(value || '')) {
                        const missingHash = value ? /^([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(value) : false;
                        const suggestion = missingHash && value ? `#${value}` : undefined;
                        const msg = `Warning: invalid color value '${value}'` + (suggestion ? `\nDid you mean:` : '');
                        const actions = suggestion ? [{ name: `${suggestion}`, apply: (view: EditorView) => view.dispatch({ changes: { from: valueFromAbs, to: valueToAbs, insert: suggestion } }) }] : undefined;
                        diags.push({ from: valueFromAbs, to: valueToAbs, severity: 'warning', message: msg, actions: actions as any });
                        continue;
                    }
                    if (key === 'style' && value && !knownStyles.has(value)) {
                        const suggestion = suggestClosest(value, Array.from(knownStyles));
                        const msg = `Warning: unknown style '${value}'\nDid you mean:`;
                        const actions = suggestion ? [{ name: `${suggestion}`, apply: (view: EditorView) => view.dispatch({ changes: { from: valueFromAbs, to: valueToAbs, insert: suggestion } }) }] : undefined;
                        diags.push({ from: valueFromAbs, to: valueToAbs, severity: 'warning', message: msg, actions: actions as any });
                        continue;
                    }
                    if ((key === 'italic' || key === 'bold' || key === 'underline' || key === 'underlined' || key === 'strikethrough') && value !== 'true') {
                        const suggestion = suggestClosest(String(value || ''), ['true']);
                        const msg = `Warning: boolean property '${key}' must be 'true' if present\nDid you mean:`;
                        const actions = suggestion ? [{ name: `${suggestion}`, apply: (view: EditorView) => view.dispatch({ changes: { from: valueFromAbs, to: valueToAbs, insert: 'true' } }) }] : undefined;
                        diags.push({ from: valueFromAbs, to: valueToAbs, severity: 'warning', message: msg, actions: actions as any });
                        continue;
                    }
                }
            }
        }
		// Unknown {character.NAME} and {button.NAME} variables anywhere
		let vm: RegExpExecArray | null;
		const charRe = /\{character\.([A-Za-z0-9_-]+)\}/g;
		while ((vm = charRe.exec(ln)) !== null) {
			const name = vm[1];
			if (!knownChars.has(name.toLowerCase())) {
				const from = offsetBase + vm.index + '{character.'.length;
				const to = from + name.length;
				diags.push({ from, to, severity: 'warning', message: `Warning: unknown character reference '${name}'.` });
			}
		}
		const btnRe = /\{button\.([A-Za-z0-9_-]+)\}/g;
		while ((vm = btnRe.exec(ln)) !== null) {
			const name = vm[1];
			if (!knownButtons.has(name.toLowerCase())) {
				const from = offsetBase + vm.index + '{button.'.length;
				const to = from + name.length;
				diags.push({ from, to, severity: 'warning', message: `Warning: unknown button reference '${name}'.` });
			}
		}
		// Unmatched braces in order (simple per-line stack)
		const stack: number[] = [];
		for (let j = 0; j < ln.length; j++) {
			const ch = ln[j];
			if (ch === '{') stack.push(j);
			else if (ch === '}') {
				if (stack.length) stack.pop();
				else diags.push({ from: offsetBase + j, to: offsetBase + j + 1, severity: 'warning', message: 'Warning: brace is not closed on this line and will show up in the final text' });
			}
		}
		for (const start of stack) {
			diags.push({ from: offsetBase + start, to: offsetBase + start + 1, severity: 'warning', message: 'Warning: brace is not closed on this line and will show up in the final text' });
		}
		offsetBase += ln.length + 1;
	}
	return diags;
}

const cmTheme = EditorView.theme({
	'.cm-editor': {
		backgroundColor: 'var(--gray-a2)',
		color: 'white',
		border: '1px solid var(--gray-a6)',
		borderRadius: '8px',
		fontFamily: '\'JetBrainsMono Nerd Font\', \'JetBrains Mono\', \'Fira Code\', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \'Liberation Mono\', \'Courier New\', monospace',
		fontSize: 'var(--raw-font-size-2)',
		height: '100%'
	},
	'.cm-content': { caretColor: 'var(--gray-a12)' },
	'.cm-gutters': { backgroundColor: 'transparent', borderRight: '1px solid var(--gray-a6)' },
	'.cm-lintRange': { textDecoration: `underline wavy ${syntaxColors.lintWarning}` },
    '.cm-activeLine': { backgroundColor: syntaxColors.activeLineBg },
    '.cm-activeLineGutter': { backgroundColor: syntaxColors.activeLineGutterBg },
	'& .cm-tooltip.cm-tooltip-lint': {
		background: syntaxColors.tooltipBg,
		color: syntaxColors.tooltipText,
		border: `1px solid ${syntaxColors.tooltipBorder}`,
		borderRadius: '8px',
		padding: '8px 8px',
		fontSize: 'var(--raw-font-size-1)',
		maxWidth: '280px',
		boxShadow: `0 2px 8px ${syntaxColors.shadowColor}`
	},
	'& .cm-tooltip.cm-tooltip-lint .cm-diagnostic': {
		color: syntaxColors.tooltipText
	},
	'& .cm-tooltip.cm-tooltip-lint .cm-diagnosticText': {
		color: syntaxColors.tooltipText
	},
    '& .cm-scroller::-webkit-scrollbar': {
        width: '10px',
        height: '10px'
    },
    '& .cm-scroller::-webkit-scrollbar-track': {
        background: 'transparent'
    },
    '& .cm-scroller::-webkit-scrollbar-thumb': {
        background: 'var(--gray-a8)',
        borderRadius: '8px',
        border: '2px solid transparent',
        backgroundClip: 'padding-box'
    },
    '& .cm-scroller::-webkit-scrollbar-thumb:hover': {
        background: 'var(--gray-a9)',
        border: '2px solid transparent',
        backgroundClip: 'padding-box'
    }
});

function buildHighlightDecorations(state: EditorState): DecorationSet {
    type Piece = { from: number; to: number; deco: Decoration };
    const pieces: Piece[] = [];
    let inStyles = false;
    class InlineWidget extends WidgetType {
        private text: string;
        private styleText: string;
        constructor(text: string, styleText: string) {
            super();
            this.text = text;
            this.styleText = styleText;
        }
        toDOM() {
            const span = document.createElement('span');
            span.textContent = this.text;
            span.setAttribute('style', this.styleText);
            return span;
        }
    }
    for (let i = 1; i <= state.doc.lines; i++) {
        const line = state.doc.line(i);
        const text = line.text;
        const trimmed = text.trim();
        // Highlight @styles / @endstyles in yellow and update state
        if (/^@styles\s*$/i.test(trimmed)) {
            const idx = text.toLowerCase().indexOf('@styles');
            if (idx >= 0) {
                const from = line.from + idx;
                const to = from + '@styles'.length;
                pieces.push({ from, to, deco: Decoration.mark({ attributes: { style: `color:${syntaxColors.bracket}` } }) });
            }
            inStyles = true;
            continue;
        }
        if (/^@endstyles\s*$/i.test(trimmed)) {
            const idx = text.toLowerCase().indexOf('@endstyles');
            if (idx >= 0) {
                const from = line.from + idx;
                const to = from + '@endstyles'.length;
                pieces.push({ from, to, deco: Decoration.mark({ attributes: { style: `color:${syntaxColors.bracket}` } }) });
            }
            inStyles = false;
            continue;
        }
        // Compute inner ranges inside {...}
        const contentRanges: Array<[number, number]> = [];
        const braceContentRe = /\{[^}]*\}/g;
        let bm: RegExpExecArray | null;
        while ((bm = braceContentRe.exec(text)) !== null) {
            const start = line.from + bm.index + 1; // after '{'
            const end = line.from + bm.index + bm[0].length - 1; // before '}'
            contentRanges.push([start, end]);
        }
        const insideContext = (pos: number) => inStyles || contentRanges.some(([s, e]) => pos >= s && pos < e);
        // Precompute replacement ranges for visual widgets so we can skip overlapping marks
        const replacedRanges: Array<[number, number]> = [];
        // '->' arrow segments
        {
            const arrowReScan = /->/g;
            let mm: RegExpExecArray | null;
            while ((mm = arrowReScan.exec(text)) !== null) {
                const from = line.from + mm.index;
                const to = from + 2;
                replacedRanges.push([from, to]);
            }
        }
        const overlapsReplacement = (from: number, to: number) => replacedRanges.some(([s, e]) => !(to <= s || from >= e));
        // Hex colors → colored background, white text
        const hexRe = /#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})\b/g;
        let m: RegExpExecArray | null;
        while ((m = hexRe.exec(text)) !== null) {
            const from = line.from + m.index;
            const to = from + m[0].length;
            if (!insideContext(from) || overlapsReplacement(from, to)) continue;
            let cssColor = m[0];
            const hex = m[1];
            if (hex.length === 3) {
                const full = hex.split('').map((c) => c + c).join('');
                cssColor = '#' + full;
            } else if (hex.length === 8) {
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                const a = parseInt(hex.slice(6, 8), 16) / 255;
                cssColor = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
            }
            pieces.push({ from, to, deco: Decoration.mark({ attributes: { style: `background-color:${cssColor}; color:${syntaxColors.colorChipText}; border-radius:2px` } }) });
        }
        // Brackets []
        const bracketRe = /\[|\]/g;
        while ((m = bracketRe.exec(text)) !== null) {
            const from = line.from + m.index;
            const to = from + 1;
            if (!overlapsReplacement(from, to)) {
                pieces.push({ from, to, deco: Decoration.mark({ attributes: { style: `color:${syntaxColors.bracket}` } }) });
            }
        }
        // Braces {}
        const braceRe = /\{|\}/g;
        while ((m = braceRe.exec(text)) !== null) {
            const from = line.from + m.index;
            const to = from + 1;
            if (!overlapsReplacement(from, to)) {
                pieces.push({ from, to, deco: Decoration.mark({ attributes: { style: `color:${syntaxColors.brace}` } }) });
            }
        }
        // Keywords: style.X, character.X, button.X (keep separate color from property keys)
        const kwRe = /\b(style|character|button)\.([A-Za-z0-9_-]+)\b/g;
        while ((m = kwRe.exec(text)) !== null) {
            const from = line.from + m.index;
            const to = from + m[0].length;
            pieces.push({ from, to, deco: Decoration.mark({ attributes: { style: `color:${syntaxColors.keyword}` } }) });
        }
        // Property assignments: color key and '=' separately (only inside {} or @styles)
        const propKeys = ['color','style','bold','italic','underline','underlined','strikethrough','style'];
        const propAssignRe = new RegExp(`(^|[^A-Za-z0-9_])(${propKeys.join('|')})(\\s*)(=)`, 'g');
        let pm: RegExpExecArray | null;
        while ((pm = propAssignRe.exec(text)) !== null) {
            const keyFrom = line.from + pm.index + pm[1].length;
            const keyTo = keyFrom + pm[2].length;
            if (insideContext(keyFrom) && !overlapsReplacement(keyFrom, keyTo)) {
                pieces.push({ from: keyFrom, to: keyTo, deco: Decoration.mark({ attributes: { style: `color:${syntaxColors.property}` } }) });
            }
            const eqFrom = keyTo + pm[3].length;
            const eqTo = eqFrom + 1; // '='
            if (insideContext(eqFrom) && !overlapsReplacement(eqFrom, eqTo)) {
                pieces.push({ from: eqFrom, to: eqTo, deco: Decoration.mark({ attributes: { style: `color:${syntaxColors.punctuation}` } }) });
            }
        }
        // name_* and text_* variants before '='
        const suffixes = propKeys.join('|');
        const ntAssignRe = new RegExp(`(^|[^A-Za-z0-9_])((?:name|text)_(?:${suffixes}))(\\s*)(=)`, 'g');
        let nm: RegExpExecArray | null;
        while ((nm = ntAssignRe.exec(text)) !== null) {
            const keyFrom = line.from + nm.index + nm[1].length;
            const keyTo = keyFrom + nm[2].length;
            if (insideContext(keyFrom) && !overlapsReplacement(keyFrom, keyTo)) {
                pieces.push({ from: keyFrom, to: keyTo, deco: Decoration.mark({ attributes: { style: `color:${syntaxColors.property}` } }) });
            }
            const eqFrom = keyTo + nm[3].length;
            const eqTo = eqFrom + 1;
            if (insideContext(eqFrom) && !overlapsReplacement(eqFrom, eqTo)) {
                pieces.push({ from: eqFrom, to: eqTo, deco: Decoration.mark({ attributes: { style: `color:${syntaxColors.punctuation}` } }) });
            }
        }
        // Highlight style value in assignments like style=NAME with a greenish accent
        {
            const styleAssignRe = /(^|[^A-Za-z0-9_])(style)(\s*)(=)(\s*)([A-Za-z0-9_-]+)/g;
            let sm: RegExpExecArray | null;
            while ((sm = styleAssignRe.exec(text)) !== null) {
                const valFrom = line.from + sm.index + sm[1].length + sm[2].length + sm[3].length + sm[4].length + sm[5].length;
                const valTo = valFrom + sm[6].length;
                if (insideContext(valFrom) && !overlapsReplacement(valFrom, valTo)) {
                    pieces.push({ from: valFrom, to: valTo, deco: Decoration.mark({ attributes: { style: `color:${syntaxColors.string}` } }) });
                }
            }
        }
        // Values immediately after '=': color true/false only when full token matches
        const valueRe = /=\s*(true|false)\b/g;
        while ((m = valueRe.exec(text)) !== null) {
            const val = m[1];
            const start = line.from + m.index + m[0].indexOf(val);
            const end = start + val.length;
            const color = val === 'true' ? syntaxColors.booleanTrue : syntaxColors.booleanFalse;
            if (insideContext(start) && !overlapsReplacement(start, end)) {
                pieces.push({ from: start, to: end, deco: Decoration.mark({ attributes: { style: `color:${color}` } }) });
            }
        }
        // Presence-only boolean flags (bold, italic, underline, underlined, strikethrough) inside parameter sections
        {
            const presenceRe = /(^|[^A-Za-z0-9_])(bold|italic|underline|underlined|strikethrough)(?!\s*=)\b/g;
            let pm2: RegExpExecArray | null;
            while ((pm2 = presenceRe.exec(text)) !== null) {
                const keyFrom = line.from + pm2.index + pm2[1].length;
                const keyTo = keyFrom + pm2[2].length;
                if (insideContext(keyFrom) && !overlapsReplacement(keyFrom, keyTo)) {
                    pieces.push({ from: keyFrom, to: keyTo, deco: Decoration.mark({ attributes: { style: `color:${syntaxColors.property}` } }) });
                }
            }
        }
        // @refs
        const refRe = /@([A-Za-z0-9_-]+)/g;
        while ((m = refRe.exec(text)) !== null) {
            const from = line.from + m.index;
            const to = from + m[0].length;
            if (!overlapsReplacement(from, to)) {
                pieces.push({ from, to, deco: Decoration.mark({ attributes: { style: `color:${syntaxColors.selector}` } }) });
            }
        }
        // Add replacements last so they don't conflict with marks
        {
            const arrowRe = /->/g;
            let mm: RegExpExecArray | null;
            while ((mm = arrowRe.exec(text)) !== null) {
                const from = line.from + mm.index;
                const to = from + 2;
                const widget = new InlineWidget('→', `color:${syntaxColors.punctuation}; font-family: 'JetBrainsMono Nerd Font', 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace`);
                pieces.push({ from, to, deco: Decoration.replace({ widget }) });
            }
        }
        // Remove duplicate visual replacements block
    }
    pieces.sort((a, b) => (a.from - b.from) || (a.to - b.to));
    const builder = new RangeSetBuilder<Decoration>();
    for (const p of pieces) builder.add(p.from, p.to, p.deco);
    return builder.finish();
}

const highlightField = StateField.define<DecorationSet>({
    create(state) {
        return buildHighlightDecorations(state);
    },
    update(deco, tr) {
        if (tr.docChanged || tr.selection) {
            return buildHighlightDecorations(tr.state);
        }
        return deco;
    },
    provide: f => EditorView.decorations.from(f)
});

const RawCodeMirror: React.FC<RawCodeMirrorProps> = ({ value, onChange, onDiagnostics }) => {
	const hostRef = React.useRef<HTMLDivElement | null>(null);
	const viewRef = React.useRef<EditorView | null>(null);

	// Debounced diagnostics callback to provide rawLintErrors line+message array
	const reportDiagnostics = React.useCallback((doc: string) => {
		if (!onDiagnostics) return;
		const diags = computeDiagnostics(doc);
		const lines = doc.split(/\r?\n/);
		const result: Array<{ line: number; message: string }> = [];
		for (const d of diags) {
			// Compute line number from from-offset
			let remaining = d.from;
			let line = 1;
			for (const ln of lines) {
				if (remaining <= ln.length) break;
				remaining -= (ln.length + 1);
				line++;
			}
			result.push({ line, message: d.message });
		}
		onDiagnostics(result);
	}, [onDiagnostics]);

	React.useEffect(() => {
		if (!hostRef.current) return;
		// (scrollContainer removed previously)
		let lastHeadLine = -1;
		const startState = EditorState.create({
			doc: value,
			extensions: [
				lineNumbers(),
				history(),
				keymap.of([...defaultKeymap, ...historyKeymap]),
				cmTheme,
				highlightActiveLine(),
				highlightActiveLineGutter(),
				EditorView.lineWrapping,
				highlightField,
				linter(() => computeDiagnostics(viewRef.current?.state.doc.toString() || '')),
				EditorView.updateListener.of((v) => {
					if (v.docChanged) {
						const next = v.state.doc.toString();
						onChange(next);
						reportDiagnostics(next);
					}
					if (v.selectionSet) {
						const head = v.state.selection.main.head;
						const curLine = v.state.doc.lineAt(head).number;
						if (lastHeadLine < 0) lastHeadLine = curLine;
						const movingDown = curLine > lastHeadLine;
						lastHeadLine = curLine;
					if (movingDown) {
							const coords = v.view.coordsAtPos(head);
						const sc = v.view.scrollDOM; // ensure we use the editor's scroller
							if (coords && sc) {
								const scRect = sc.getBoundingClientRect();
								const relBottom = coords.bottom - scRect.top;
								const lineH = (v.view as any).defaultLineHeight || 24;
								const threshold = sc.clientHeight - 5 * lineH;
								if (relBottom > threshold) {
									sc.scrollTop += Math.round(lineH);
								}
							}
						}
					}
				}),
			]
		});
		const view = new EditorView({ state: startState, parent: hostRef.current });
		viewRef.current = view;
		// Initial diagnostics report
		reportDiagnostics(value);
		return () => { view.destroy(); viewRef.current = null; };
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Sync external value into editor
	React.useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const cur = view.state.doc.toString();
		if (cur === value) return;
		view.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
		reportDiagnostics(value);
	}, [value, reportDiagnostics]);

	return (
		<div style={{ height: '100%', minHeight: 0, overflow: 'auto' }}>
			<div ref={hostRef} style={{ height: '100%', minHeight: 0 }} />
		</div>
	);
};

export default RawCodeMirror;


