import React from 'react';
import { Card, Text, Button } from '@radix-ui/themes';
import Editor from 'react-simple-code-editor';
import { syntaxColors } from '../../syntaxColors';

export interface RawTabProps {
  dialogueSource: string;
  onChange: (value: string) => void;
  onApplyToGraph: () => void;
  rawLintErrors: Array<{ line: number; message: string }>;
  setRawLintErrors: (errs: Array<{ line: number; message: string }>) => void;
}

const RawTab: React.FC<RawTabProps> = ({
  dialogueSource,
  onChange,
  onApplyToGraph,
  rawLintErrors,
  setRawLintErrors,
}) => {
  const editorWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [hoverError, setHoverError] = React.useState<string>('no word');
  const [hoverPos, setHoverPos] = React.useState<{ left: number; top: number }>({ left: 8, top: 8 });
  const [showTooltip, setShowTooltip] = React.useState<boolean>(false);
  const hoverTimerRef = React.useRef<number | null>(null);
  const pendingMsgRef = React.useRef<string>('no word');
  const pendingPosRef = React.useRef<{ left: number; top: number }>({ left: 8, top: 8 });
  const lockedWordRef = React.useRef<string | null>(null);
  const [activeRef, setActiveRef] = React.useState<string>('');
  
  // Attach hover listeners on container; temporarily disable textarea pointer-events
  // to peek underlying <pre> spans for hover detection without breaking typing
  React.useEffect(() => {
    const container = editorWrapRef.current;
    if (!container) return;
    const pre = container.querySelector('pre');
    if (!pre) return;
    const markerId = 'raw-active-ref-marker';
    let marker = document.getElementById(markerId);
    if (!marker) {
      marker = document.createElement('div');
      marker.id = markerId;
      marker.style.display = 'none';
      container.appendChild(marker);
    }
    const getWordAtPoint = (clientX: number, clientY: number): { word: string; element: HTMLElement | null } => {
      try {
        const anyDoc: any = document as any;
        const container = editorWrapRef.current;
        const textarea = container?.querySelector('textarea') as HTMLElement | null;
        const prev = textarea ? textarea.style.pointerEvents : '';
        if (textarea) textarea.style.pointerEvents = 'none';
        const range: Range | null = (document as any).caretRangeFromPoint
          ? (document as any).caretRangeFromPoint(clientX, clientY)
          : null;
        if (range && range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
          const text = range.startContainer.textContent || '';
          let index = range.startOffset;
          const isWordChar = (ch: string) => /[A-Za-z0-9_@#-]/.test(ch);
          let start = index;
          let end = index;
          while (start > 0 && isWordChar(text[start - 1])) start--;
          while (end < text.length && isWordChar(text[end])) end++;
          const word = text.slice(start, end).trim();
          if (textarea) textarea.style.pointerEvents = prev;
          return { word: word || '', element: (range.startContainer as any).parentElement || null };
        }
        if (anyDoc.caretPositionFromPoint) {
          const pos = anyDoc.caretPositionFromPoint(clientX, clientY);
          if (pos && pos.offsetNode && pos.offsetNode.nodeType === Node.TEXT_NODE) {
            const text = (pos.offsetNode.textContent as string) || '';
            let index = pos.offset || 0;
            const isWordChar = (ch: string) => /[A-Za-z0-9_@#-]/.test(ch);
            let start = index;
            let end = index;
            while (start > 0 && isWordChar(text[start - 1])) start--;
            while (end < text.length && isWordChar(text[end])) end++;
            const word = text.slice(start, end).trim();
            if (textarea) textarea.style.pointerEvents = prev;
            const el = (pos.offsetNode as any).parentElement || null;
            return { word: word || '', element: el };
          }
        }
        if (textarea) textarea.style.pointerEvents = prev;
      } catch {}
      return { word: '', element: null };
    };

    const onMove = (e: MouseEvent) => {
      const textarea = container.querySelector('textarea') as HTMLElement | null;
      const containerRect = container.getBoundingClientRect();
      let hovered: HTMLElement | null = null;
      if (textarea) {
        const prev = textarea.style.pointerEvents;
        textarea.style.pointerEvents = 'none';
        hovered = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        textarea.style.pointerEvents = prev;
      } else {
        hovered = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      }
      const { word, element } = getWordAtPoint(e.clientX, e.clientY);
      // On click store active @ref to drive global highlight
      const lastClickHandler = (ev: MouseEvent) => {
        const ta = container.querySelector('textarea') as HTMLElement | null;
        const prevPE = ta ? ta.style.pointerEvents : '';
        if (ta) ta.style.pointerEvents = 'none';
        const elAt = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
        if (ta) ta.style.pointerEvents = prevPE;
        let refName: string | null = null;
        if (elAt) {
          const refEl = elAt.matches?.('[data-ref]') ? elAt : elAt.closest?.('[data-ref]');
          if (refEl) refName = (refEl as HTMLElement).getAttribute('data-ref');
        }
        if (refName) marker!.setAttribute('data-active-ref', refName);
        else marker!.removeAttribute('data-active-ref');
        // Force editor to rerender highlighting after selection
        try {
          const ta2 = container.querySelector('textarea') as HTMLTextAreaElement | null;
          if (ta2) {
            const v = ta2.value;
            ta2.value = v;
            ta2.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } catch {}
      };
      // Ensure we have one click listener
      pre.addEventListener('mousedown', lastClickHandler);
      pre.addEventListener('click', lastClickHandler);
      pre.addEventListener('mouseup', lastClickHandler);
      const errorEl: HTMLElement | null = (hovered && (hovered as any).matches && hovered.matches('span[data-error="true"]'))
        ? (hovered as HTMLElement)
        : (element ? ((element as any).matches && element.matches('span[data-error="true"]')
          ? (element as HTMLElement)
          : ((element as any).closest && (element.closest('span[data-error="true"]') as HTMLElement | null))) : null);
      const containerRect2 = container.getBoundingClientRect();
      const currentWord = (errorEl ? (errorEl.textContent || '') : (word || '')).trim();

      // If tooltip already shown for this word, keep visible and just reposition
      if (showTooltip && lockedWordRef.current && currentWord === lockedWordRef.current) {
        if (errorEl) {
          const rect = errorEl.getBoundingClientRect();
          const tipH = (document.querySelector('[data-raw-tooltip]') as HTMLElement | null)?.offsetHeight || 24;
          const tipW = (document.querySelector('[data-raw-tooltip]') as HTMLElement | null)?.offsetWidth || 0;
          let left = rect.left - containerRect2.left;
          const maxLeft = Math.max(8, containerRect2.width - tipW - 8);
          left = Math.min(Math.max(8, left), maxLeft);
          setHoverPos({ left, top: rect.top - containerRect2.top - tipH - 8 });
        } else if (currentWord) {
          setHoverPos({ left: e.clientX - containerRect2.left + 12, top: e.clientY - containerRect2.top + 12 });
        } else {
          setShowTooltip(false);
          lockedWordRef.current = null;
        }
        return;
      }
      if (errorEl) {
        const rect = errorEl.getBoundingClientRect();
        const type = errorEl.getAttribute('data-error-type') || 'unknown';
        const text = errorEl.textContent || '';
        let msg = '';
        switch (type) {
          case 'style_missing':
            {
              const suggest = errorEl.getAttribute('data-suggest');
              msg = `Warning: style '${text || 'unknown'}' does not exist and will show up in final text` + (suggest ? ` — Did you mean '${suggest}'?` : '');
            }
            break;
          case 'unknown_property':
            {
              const suggest = errorEl.getAttribute('data-suggest');
              msg = `Warning: unknown property '${text || 'unknown'}'` + (suggest ? ` — Did you mean '${suggest}'?` : '');
            }
            break;
          case 'invalid_color':
            msg = `Warning: invalid color '${text || 'unknown'}'`;
            break;
          case 'invalid_boolean':
            msg = `Warning: invalid boolean '${text || 'unknown'}' (must be 'true')`;
            break;
          case 'unclosed_brace':
            msg = `Warning: brace is not closed on this line and will show up in the final text`;
            break;
          case 'missing_inline_close':
            msg = `Warning: missing '{/}' — inline block will render literally`;
            break;
          case 'unknown_character':
            {
              const suggest = errorEl.getAttribute('data-suggest');
              msg = `Warning: unknown character reference` + (suggest ? ` — Did you mean '${suggest}'?` : '');
            }
            break;
          case 'unknown_button':
            {
              const suggest = errorEl.getAttribute('data-suggest');
              msg = `Warning: unknown button reference` + (suggest ? ` — Did you mean '${suggest}'?` : '');
            }
            break;
          default:
            msg = 'Warning';
        }
        pendingMsgRef.current = msg;
        // initial; corrected after tooltip renders
        pendingPosRef.current = { left: rect.left - containerRect.left, top: rect.top - containerRect.top - 30 };
      } else {
        // No special data under cursor: do not show tooltip
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        setShowTooltip(false);
        lockedWordRef.current = null;
        return;
      }
      setShowTooltip(false);
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
      hoverTimerRef.current = window.setTimeout(() => {
        setHoverError(pendingMsgRef.current);
        setShowTooltip(true);
        // After render, measure tooltip size and anchor position
        requestAnimationFrame(() => {
          const contRect = container.getBoundingClientRect();
          const tipEl = document.querySelector('[data-raw-tooltip]') as HTMLElement | null;
          if (errorEl) {
            const rectNow = errorEl.getBoundingClientRect();
            const tipH = tipEl?.offsetHeight || 24;
            const tipW = tipEl?.offsetWidth || 0;
            let left = rectNow.left - contRect.left;
            const maxLeft = Math.max(8, contRect.width - tipW - 8);
            left = Math.min(Math.max(8, left), maxLeft);
            setHoverPos({ left, top: rectNow.top - contRect.top - tipH - 8 });
          } else {
            setHoverPos(pendingPosRef.current);
          }
          lockedWordRef.current = currentWord || null;
        });
      }, 250);
    };
    const onLeave = () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setShowTooltip(false);
      lockedWordRef.current = null;
      setHoverError('no word');
      setHoverPos({ left: 8, top: 8 });
    };
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
    };
  }, [dialogueSource]);

  // Track caret in textarea and set active @reference (word starting with @)
  React.useEffect(() => {
    const container = editorWrapRef.current;
    if (!container) return;
    const handler = () => {
      try {
        const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null;
        if (!textarea || document.activeElement !== textarea) { setActiveRef(''); return; }
        const value = textarea.value || '';
        const caret = textarea.selectionEnd ?? 0;
        const isWordChar = (ch: string) => /[A-Za-z0-9_@-]/.test(ch);
        let start = caret;
        let end = caret;
        while (start > 0 && isWordChar(value[start - 1])) start--;
        while (end < value.length && isWordChar(value[end])) end++;
        const token = value.slice(start, end);
        if (token.startsWith('@') && token.length > 1) {
          setActiveRef(token.slice(1));
        } else {
          setActiveRef('');
        }
      } catch {
        setActiveRef('');
      }
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);


  const highlight = (code: string) => {
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Use current focused @reference from state
    // Collect named style definitions directly from RAW text
    const knownStyleNames = new Set<string>();
    try {
      code.split(/\r?\n/).forEach((ln) => {
        const m = ln.trim().match(/^style\.([A-Za-z0-9_-]+)\b/i);
        if (m) knownStyleNames.add(m[1]);
      });
    } catch {}

    // Small Levenshtein to generate "Did you mean ..." suggestions
    const levenshtein = (a: string, b: string) => {
      const m = a.length; const n = b.length;
      const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + cost,
          );
        }
      }
      return dp[m][n];
    };
    const suggestClosest = (word: string, candidates: string[], max = 2): string | null => {
      let best: string | null = null;
      let bestDist = Infinity;
      const lower = word.toLowerCase();
      for (const c of candidates) {
        const d = levenshtein(lower, c.toLowerCase());
        if (d < bestDist) { bestDist = d; best = c; }
      }
      return bestDist <= max ? best : null;
    };

    // Collect known characters and buttons for suggestions
    const knownCharacterNames = new Set<string>();
    const knownButtonNames = new Set<string>();
    try {
      code.split(/\r?\n/).forEach((ln) => {
        const t = ln.trim();
        let m: RegExpMatchArray | null;
        if ((m = t.match(/^character\.([A-Za-z0-9_-]+)\s+(.+)$/i))) {
          knownCharacterNames.add(m[1].toLowerCase());
          const props = m[2];
          const nameMatch = props.match(/(?:^|\s)name\s*=\s*([A-Za-z0-9_-]+)/);
          if (nameMatch) knownCharacterNames.add(nameMatch[1].toLowerCase());
        } else if ((m = t.match(/^character\.(\d+)\s+(.+)$/i))) {
          const props = m[2];
          const nameMatch = props.match(/(?:^|\s)name\s*=\s*([A-Za-z0-9_-]+)/);
          if (nameMatch) knownCharacterNames.add(nameMatch[1].toLowerCase());
        }
        if ((m = t.match(/^button\.([A-Za-z0-9_-]+)\s+(.+)$/i))) {
          knownButtonNames.add(m[1].toLowerCase());
        } else if ((m = t.match(/^button\.(\d+)\s+(.+)$/i))) {
          const idx = m[1];
          knownButtonNames.add(`button_${idx}`.toLowerCase());
          const props = m[2];
          const labelMatch = props.match(/(?:^|\s)label\s*=\s*([A-Za-z0-9_-]+)/);
          if (labelMatch) knownButtonNames.add(labelMatch[1].toLowerCase());
        }
        // Speaker lines like "Name: text" imply character existence
        const speaker = t.match(/^([A-Za-z0-9_-]+)(\{[^}]*\})?\s*:/);
        if (speaker) knownCharacterNames.add(speaker[1].toLowerCase());
      });
    } catch {}

    // Per-line unmatched brace detector (counts only brace characters in order)
    const computeUnmatchedBraceOrdinals = (rawLine: string): Set<number> => {
      const unmatched = new Set<number>();
      const stack: number[] = [];
      let ordinal = 0;
      for (let i = 0; i < rawLine.length; i++) {
        const ch = rawLine[i];
        if (ch === '{' || ch === '}') {
          if (ch === '{') {
            stack.push(ordinal);
          } else {
            if (stack.length > 0) stack.pop();
            else unmatched.add(ordinal);
          }
          ordinal++;
        }
      }
      for (const ord of stack) unmatched.add(ord);
      return unmatched;
    };

    const colorize = (escapedLine: string, rawLine: string) => {
      // Build underline ranges for unmatched braces and include adjacent token for visibility
      const U_START = '\u0005US';
      const U_END = '\u0006UE';
      const isWordChar = (ch: string) => /[^\s{}\[\]]/.test(ch);
      const isSpace = (ch: string) => ch === ' ';
      const unmatchedOrdinals = computeUnmatchedBraceOrdinals(rawLine);
      type Range = { start: number; end: number };
      const ranges: Range[] = [];
      let ordinal = 0;
      for (let i = 0; i < rawLine.length; i++) {
        const ch = rawLine[i];
        if (ch === '{' || ch === '}') {
          const thisOrd = ordinal++;
          if (!unmatchedOrdinals.has(thisOrd)) continue;
          if (ch === '{') {
            let start = i;
            let k = i + 1;
            while (k < rawLine.length && isSpace(rawLine[k])) k++;
            if (k < rawLine.length) {
              if (isWordChar(rawLine[k])) {
                let e = k + 1;
                while (e < rawLine.length && isWordChar(rawLine[e])) e++;
                ranges.push({ start, end: e });
              } else {
                ranges.push({ start, end: k });
              }
            } else {
              ranges.push({ start, end: k });
            }
          } else {
            // closing brace unmatched: include preceding word and spaces
            let end = i + 1;
            let k = i - 1;
            while (k >= 0 && isSpace(rawLine[k])) k--;
            let wordEnd = k + 1;
            while (k >= 0 && isWordChar(rawLine[k])) k--;
            const start = Math.max(0, k + 1);
            ranges.push({ start, end: Math.max(end, wordEnd) });
          }
        }
      }
      // Merge overlapping
      ranges.sort((a, b) => a.start - b.start);
      const merged: Range[] = [];
      for (const r of ranges) {
        if (!merged.length || r.start > merged[merged.length - 1].end) merged.push({ ...r });
        else merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
      }
      // Inject markers into raw line, then escape
      let marked = '';
      let pos = 0;
      for (const r of merged) {
        if (pos < r.start) marked += rawLine.slice(pos, r.start);
        marked += U_START + rawLine.slice(r.start, r.end) + U_END;
        pos = r.end;
      }
      marked += rawLine.slice(pos);
      let out = escapeHtml(marked);

      // First: hex color codes -> colored background, white text
      out = out.replace(/#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})\b/g, (m) => {
        const hex = m.replace('#','');
        let cssColor = '#' + hex;
        if (hex.length === 3) {
          cssColor = '#' + hex.split('').map(ch => ch + ch).join('');
        } else if (hex.length === 8) {
          const r = parseInt(hex.slice(0,2), 16);
          const g = parseInt(hex.slice(2,4), 16);
          const b = parseInt(hex.slice(4,6), 16);
          const a = parseInt(hex.slice(6,8), 16) / 255;
          cssColor = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
        }
        // Avoid padding to prevent geometry shifts between <pre> and <textarea>
        return `<span style="background-color:${cssColor}; color:#fff; border-radius:2px">${m}</span>`;
      });
      // NOTE: style=NAME highlighting is now handled inside inline {...} blocks to avoid corrupting injected markup
      // Detect inline opening blocks like {bold} without a closing {/} on the same line
      if (!/\{\/\}/.test(rawLine)) {
        out = out.replace(/\{[^}]+\}/g, (m: string, _o: number, s: string) => {
          const inner = m.slice(1, -1);
          if (!inner || inner.startsWith('/')) return m;
          // Variables like {character.X} or {button.Y} do not require closing {/}
          if (/^(character|button)\.[A-Za-z0-9_-]+$/.test(inner)) return m;
          // If immediately after a choice [...] metadata, skip (that form does not require {/})
          const idx = s.indexOf(m);
          let p = idx - 1;
          while (p >= 0 && s[p] === ' ') p--;
          if (p >= 0 && s[p] === ']') return m;
          return `<span data-error="true" data-error-type="missing_inline_close" style="text-decoration: underline wavy #F59E0B">${m}</span>`;
        });
      }
      // Invalid style key=value in @styles block: only allow color, style, italic, bold, underlined, strikethrough, name_*, text_*
      if (/^\s*(style\.|character\.|button\.)/i.test(escapedLine)) {
        const isAllowedKey = (key: string) => {
          if (key === 'color' || key === 'style') return true;
          if (key === 'italic' || key === 'bold' || key === 'underlined' || key === 'strikethrough') return true;
          if (/^name_.+/.test(key)) return true;
          if (/^text_.+/.test(key)) return true;
          return false;
        };
        const candidates = ['color','style','italic','bold','underlined','strikethrough'];
        out = out.replace(/(\b)([A-Za-z_][A-Za-z0-9_]*)(?==)/g, (m, p1, key) => {
          if (isAllowedKey(key)) return m;
          const suggest = suggestClosest(key, candidates);
          const dataSuggest = suggest ? ` data-suggest="${suggest}"` : '';
          return `${p1}<span data-error="true" data-error-type="unknown_property"${dataSuggest} style="text-decoration: underline wavy #F59E0B">${key}</span>`;
        });
      }
      // Within inline {...} blocks anywhere, underline unknown keys
      const isAllowedInlineKey = (key: string) => {
        if (key === 'color' || key === 'style') return true;
        if (key === 'italic' || key === 'bold' || key === 'underline' || key === 'underlined' || key === 'strikethrough') return true;
        if (/^name_.+/.test(key)) return true;
        if (/^text_.+/.test(key)) return true;
        return false;
      };
      out = out.replace(/\{([^}]*)\}/g, (_m, inner) => {
        const innerStr = String(inner);
        if (!/=/.test(innerStr)) return `{${innerStr}}`;
        const inlineCandidates = ['color','style','italic','bold','underline','underlined','strikethrough'];
        let replaced = innerStr.replace(/(\b)([A-Za-z_][A-Za-z0-9_]*)(?==)/g, (mm, p1, key) => {
          if (isAllowedInlineKey(key)) return mm;
          const suggest = suggestClosest(key, inlineCandidates);
          const dataSuggest = suggest ? ` data-suggest=\"${suggest}\"` : '';
          return `${p1}<span data-error=\"true\" data-error-type=\"unknown_property\"${dataSuggest} style=\"text-decoration: underline wavy #F59E0B\">${key}</span>`;
        });
        // style=NAME value highlight if style name is unknown
        replaced = replaced.replace(/(\bstyle\s*=\s*)([A-Za-z0-9_-]+)/g, (_mm, p1, name) => {
          if (!knownStyleNames.has(name)) {
            const suggest = suggestClosest(name, Array.from(knownStyleNames));
            const dataSuggest = suggest ? ` data-suggest=\"${suggest}\"` : '';
            return `${p1}<span data-error=\"true\" data-error-type=\"style_missing\"${dataSuggest} style=\"text-decoration: underline wavy #F59E0B\">${name}</span>`;
          }
          return `${p1}${name}`;
        });
        return `{${replaced}}`;
      });

      // Unknown {character.NAME} and {button.NAME} variables anywhere (no closing required)
      const wrapUnknownVar = (tokenType: 'character' | 'button', name: string, html: string) => {
        const set = tokenType === 'character' ? knownCharacterNames : knownButtonNames;
        const lower = name.toLowerCase();
        if (set.has(lower)) return html;
        const suggest = suggestClosest(name, Array.from(set));
        const dataSuggest = suggest ? ` data-suggest=\"${suggest}\"` : '';
        const escapedToken = escapeHtml(`{${tokenType}.${name}}`);
        const re = new RegExp(escapedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        return html.replace(re, `<span data-error=\"true\" data-error-type=\"unknown_${tokenType}\"${dataSuggest} style=\"text-decoration: underline wavy #F59E0B\">${escapedToken}</span>`);
      };
      // Detect tokens in raw line and wrap them in out
      let mChar: RegExpExecArray | null;
      const charRe = /\{character\.([A-Za-z0-9_-]+)\}/g;
      while ((mChar = charRe.exec(rawLine)) !== null) {
        out = wrapUnknownVar('character', mChar[1], out);
      }
      let mBtn: RegExpExecArray | null;
      const btnRe = /\{button\.([A-Za-z0-9_-]+)\}/g;
      while ((mBtn = btnRe.exec(rawLine)) !== null) {
        out = wrapUnknownVar('button', mBtn[1], out);
      }
      // Then: [] yellow, {} pink (brace color only; underline handled via markers)
      out = out.replace(/\[|\]/g, (m) => `<span style="color:${syntaxColors.bracket}">${m}</span>`);
      out = out.replace(/\{|\}/g, (m) => `<span style="color:${syntaxColors.brace}">${m}</span>`);
      // inline @name with active highlight
      out = out.replace(/@([A-Za-z0-9_-]+)/g, (_m, p1) => {
        const isActive = !!activeRef && p1 === activeRef;
        const bg = isActive ? 'rgba(255,255,255,0.12)' : 'transparent';
        // No padding to keep overlay alignment exact
        return `<span data-ref="${p1}" style="color:${syntaxColors.selector}; background:${bg}; border-radius:2px">@${p1}</span>`;
      });
      // arrows '->'
      out = out.replace(/-&gt;/g, `<span style="color:${syntaxColors.punctuation}">-&gt;</span>`);
      // Keywords for definitions
      out = out.replace(/\b(style|character|button)\.([A-Za-z0-9_-]+)\b/g, (_m, a, b) => `<span style="color:${syntaxColors.keyword}">${a}.${b}</span>`);
      // Finally, materialize underline markers to spans (after all other token replacements)
      out = out
        .replace(new RegExp(U_START, 'g'), '<span data-error="true" data-error-type="unclosed_brace" style="text-decoration: underline wavy #F59E0B">')
        .replace(new RegExp(U_END, 'g'), '</span>');
      return out;
    };

    return code
      .split(/\r?\n/)
      .map((line) => {
        const escaped = escapeHtml(line);
        // Scene header lines like "@name"
        const sceneHeader = line.match(/^\s*@([A-Za-z0-9_-]+)\s*$/);
        if (sceneHeader) {
          const name = sceneHeader[1];
          const isActive = !!activeRef && name === activeRef;
          const bg = isActive ? 'rgba(255,255,255,0.12)' : 'transparent';
          // No padding to avoid width differences with the textarea overlay
          return `<span class="token node_name_definition" data-ref="${name}" style="background:${bg}; border-radius:2px">${escaped}</span>`;
        }
        return colorize(escaped, line);
      })
      .join('\n');
  };

  

  return (
    <Card data-raw-tab-root="1" size="2" variant="surface" style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <Text as="div" size="2">Edit dialogue.txt</Text>
      <div style={{ flex: 1, minHeight: 0 }}>
        <div ref={editorWrapRef} style={{ height: '100%', position: 'relative' }}>
        <Editor
          value={dialogueSource}
          onValueChange={(code) => {
            onChange(code);
            // lint scene headers and @styles content; compute error ranges
            const lines = code.split(/\r?\n/);
            const errs: Array<{ line: number; message: string }> = [];
            const rich: Array<any> = [];
            const sceneStart = /^@([A-Za-z0-9_-]+)\s*$/;
            let inStyles = false;
            lines.forEach((line, idx) => {
              if (/^\s*@/.test(line) && !sceneStart.test(line.trim())) {
                errs.push({ line: idx + 1, message: 'Invalid node name. Use @name with letters, digits, _ or - only.' });
              }
              const t = line.trim();
              if (/^@styles\s*$/i.test(t)) { inStyles = true; return; }
              if (/^@endstyles\s*$/i.test(t)) { inStyles = false; return; }
              // Unknown keys inside inline {...} blocks
              const braceRe = /\{([^}]*)\}/g;
              let bm: RegExpExecArray | null;
              while ((bm = braceRe.exec(line)) !== null) {
                const inner = bm[1] || '';
                const keyRe = /(\b)([A-Za-z_][A-Za-z0-9_]*)(?==)/g;
                let km: RegExpExecArray | null;
                while ((km = keyRe.exec(inner)) !== null) {
                  const key = km[2];
                  const allowed = (k: string) => (
                    k === 'color' || k === 'style' || k === 'class' ||
                    k === 'italic' || k === 'bold' || k === 'underline' || k === 'underlined' || k === 'strikethrough' ||
                    /^name_.+/.test(k) || /^text_.+/.test(k)
                  );
                  if (!allowed(key)) {
                    errs.push({ line: idx + 1, message: `Warning: unknown property '${key}' in inline block.` });
                  }
                }
              }
              if (inStyles && /^(style\.|character\.|button\.)/i.test(t)) {
                // Validate key=value pairs
                const [, props = ''] = t.split(/\s+/, 2);
                if (props) {
                  let pos = line.indexOf(props);
                  props.split(/\s+/).forEach(kv => {
                    const [key, value] = kv.split('=');
                    const isAllowedKey = (k: string) => {
                      if (k === 'color' || k === 'style') return true;
                      if (k === 'italic' || k === 'bold' || k === 'underlined' || k === 'strikethrough') return true;
                      if (/^name_.+/.test(k)) return true;
                      if (/^text_.+/.test(k)) return true;
                      return false;
                    };
                    if (!isAllowedKey(key)) {
                      errs.push({ line: idx + 1, message: `Warning: unknown property '${key}' in styles.` });
                      rich.push({ line: idx + 1, start: pos, end: pos + key.length, type: 'unknown_property', name: key });
                    } else if ((key === 'color' || /_color$/i.test(key)) && !/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(value || '')) {
                      errs.push({ line: idx + 1, message: `Warning: invalid color value '${value}'.` });
                      rich.push({ line: idx + 1, start: pos, end: pos + (value ? value.length : 0), type: 'invalid_color', name: value });
                    } else if ((key === 'italic' || key === 'bold' || key === 'underlined' || key === 'strikethrough') && value !== 'true') {
                      errs.push({ line: idx + 1, message: `Warning: boolean property '${key}' must be 'true' if present.` });
                      rich.push({ line: idx + 1, start: pos, end: pos + key.length, type: 'invalid_boolean', name: key });
                    }
                    pos += kv.length + 1;
                  });
                }
                // Also record unknown style references in this line
                const styleRef = /\bstyle\s*=\s*([A-Za-z0-9_-]+)/g;
                let m: RegExpExecArray | null;
                while ((m = styleRef.exec(line)) !== null) {
                  const name = m[1];
                  if (!new RegExp(`(^|\n)style\\.${name}\\b`, 'i').test(code)) {
                    const s = m.index + m[0].lastIndexOf(name);
                    rich.push({ line: idx + 1, start: s, end: s + name.length, type: 'style_missing', name });
                    errs.push({ line: idx + 1, message: `Warning: style '${name}' does not exist and will show up in the final text.` });
                  }
                }
              }
            });
            setRawLintErrors(errs);
            // eslint-disable-next-line no-console
            console.log('[RAW] Lint errors:', errs);
            // eslint-disable-next-line no-console
            console.log('[RAW] Rich error ranges:', rich);
            // Also inspect rendered <pre> for data-error spans to ensure parity with highlighter
            try {
              requestAnimationFrame(() => {
                const container = editorWrapRef.current;
                const pre = container?.querySelector('pre');
                if (!pre) return;
                const spans = Array.from(pre.querySelectorAll('span[data-error="true"]')) as HTMLElement[];
                const domErrors = spans.map((el) => ({
                  type: el.getAttribute('data-error-type') || 'unknown',
                  text: el.textContent || '',
                }));
                // eslint-disable-next-line no-console
                console.log('[RAW] DOM error spans:', domErrors);
              });
            } catch {}
          }}
          highlight={highlight}
          padding={12}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            backgroundColor: 'var(--gray-a2)',
            color: 'white',
            border: '1px solid var(--gray-a6)',
            borderRadius: 8,
            minHeight: '280px',
            height: '100%',
            overflow: 'auto'
          }}
        />
        {/* Hidden collector for active @reference via click */}
        <div
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          aria-hidden
        />
        {/* Hover tooltip (appears after 1s of mouse stillness) */}
        {showTooltip && (
          <div
            data-raw-tooltip
            style={{
              position: 'absolute',
              left: hoverPos.left,
              top: hoverPos.top,
              background: '#1C1F20',
              color: '#F59E0B',
              border: '1px solid #F59E0B',
              borderRadius: 8,
              padding: '8px 8px',
              fontSize: 12,
              zIndex: 9999,
              pointerEvents: 'none',
              maxWidth: 280,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}
          >
            {hoverError}
          </div>
        )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTop: '1px dashed var(--gray-a6)', paddingTop: 8 }}>
        {rawLintErrors.length > 0 ? (
          <div>
            <Text as="div" size="2" style={{ color: 'var(--red9)' }}>
              {rawLintErrors.length} problem{rawLintErrors.length === 1 ? '' : 's'}
            </Text>
          </div>
        ) : (
          <div />
        )}
        <div>
          <Button size="2" onClick={onApplyToGraph}>Apply to Graph</Button>
        </div>
      </div>
    </Card>
  );
}

export default RawTab;


