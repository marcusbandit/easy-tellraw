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
          const isWordChar = (ch: string) => /[A-Za-z0-9_@#\-]/.test(ch);
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
            const isWordChar = (ch: string) => /[A-Za-z0-9_@#\-]/.test(ch);
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
            msg = `Error: style '${text || 'unknown'}' does not exist`;
            break;
          case 'unknown_property':
            msg = `Error: unknown property '${text || 'unknown'}'`;
            break;
          case 'invalid_color':
            msg = `Error: invalid color '${text || 'unknown'}'`;
            break;
          case 'invalid_boolean':
            msg = `Error: invalid boolean '${text || 'unknown'}' (must be 'true')`;
            break;
          default:
            msg = 'Error: unknown, Error type: unknown';
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
        const isWordChar = (ch: string) => /[A-Za-z0-9_\-@]/.test(ch);
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
        const m = ln.trim().match(/^style\.([A-Za-z0-9_\-]+)\b/i);
        if (m) knownStyleNames.add(m[1]);
      });
    } catch {}

    const colorize = (escapedLine: string) => {
      // First: hex color codes -> colored background, white text
      let out = escapedLine.replace(/#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})\b/g, (m) => {
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
        return `<span style="background-color:${cssColor}; color:#fff; padding:0 2px; border-radius:2px">${m}</span>`;
      });
      // Unknown style=NAME anywhere on the line: mark with red underline
      out = out.replace(/(\bstyle\s*=\s*)([A-Za-z0-9_-]+)/g, (_m, p1, p2) => {
        if (!knownStyleNames.has(p2)) {
          return `${p1}<span data-error="true" data-error-type="style_missing" style="text-decoration: underline wavy #FF4D4F">${p2}</span>`;
        }
        return `${p1}${p2}`;
      });
      // Invalid style key=value in @styles block: only allow color, bold, italic, underline, strikethrough, name_color, text_color, name_*, text_*
      if (/^\s*(style\.|character\.|button\.)/i.test(escapedLine)) {
        out = out.replace(/(\b)([A-Za-z_][A-Za-z0-9_]*)(?==)/g, (m, p1, key) => {
          const allowed = new Set([
            'color','bold','italic','underline','strikethrough',
            'name_color','name_bold','name_italic','name_underline','name_strikethrough',
            'text_color','text_bold','text_italic','text_underline','text_strikethrough',
            'label','style'
          ]);
          return allowed.has(key) ? m : `${p1}<span data-error="true" data-error-type="unknown_property" style="text-decoration: underline wavy #FF4D4F">${key}</span>`;
        });
      }
      // Then: [] yellow, {} pink
      out = out.replace(/\[|\]/g, (m) => `<span style="color:${syntaxColors.bracket}">${m}</span>`);
      out = out.replace(/\{|\}/g, (m) => `<span style="color:${syntaxColors.brace}">${m}</span>`);
      // inline @name with active highlight
      out = out.replace(/@([A-Za-z0-9_\-]+)/g, (_m, p1) => {
        const isActive = !!activeRef && p1 === activeRef;
        const bg = isActive ? 'rgba(255,255,255,0.12)' : 'transparent';
        const pad = isActive ? '0 2px' : '0';
        return `<span data-ref="${p1}" style="color:${syntaxColors.selector}; background:${bg}; padding:${pad}; border-radius:2px">@${p1}</span>`;
      });
      // arrows '->'
      out = out.replace(/-&gt;/g, `<span style="color:${syntaxColors.punctuation}">-&gt;</span>`);
      // Keywords for definitions
      out = out.replace(/\b(style|character|button)\.([A-Za-z0-9_-]+)\b/g, (_m, a, b) => `<span style="color:${syntaxColors.keyword}">${a}.${b}</span>`);
      return out;
    };

    return code
      .split(/\r?\n/)
      .map((line) => {
        const escaped = escapeHtml(line);
        // Scene header lines like "@name"
        const sceneHeader = line.match(/^\s*@([A-Za-z0-9_\-]+)\s*$/);
        if (sceneHeader) {
          const name = sceneHeader[1];
          const isActive = !!activeRef && name === activeRef;
          const bg = isActive ? 'rgba(255,255,255,0.12)' : 'transparent';
          const pad = isActive ? '0 2px' : '0';
          return `<span class="token node_name_definition" data-ref="${name}" style="background:${bg}; padding:${pad}; border-radius:2px">${escaped}</span>`;
        }
        return colorize(escaped);
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
            const sceneStart = /^@([A-Za-z0-9_\-]+)\s*$/;
            let inStyles = false;
            lines.forEach((line, idx) => {
              if (/^\s*@/.test(line) && !sceneStart.test(line.trim())) {
                errs.push({ line: idx + 1, message: 'Invalid node name. Use @name with letters, digits, _ or - only.' });
              }
              const t = line.trim();
              if (/^@styles\s*$/i.test(t)) { inStyles = true; return; }
              if (/^@endstyles\s*$/i.test(t)) { inStyles = false; return; }
              if (inStyles && /^(style\.|character\.|button\.)/i.test(t)) {
                // Validate key=value pairs
                const [, props = ''] = t.split(/\s+/, 2);
                if (props) {
                  let pos = line.indexOf(props);
                  props.split(/\s+/).forEach(kv => {
                    const [key, value] = kv.split('=');
                    const allowedKeys = new Set([
                      'color','bold','italic','underline','strikethrough',
                      'name_color','name_bold','name_italic','name_underline','name_strikethrough',
                      'text_color','text_bold','text_italic','text_underline','text_strikethrough',
                      'label','style'
                    ]);
                    if (!allowedKeys.has(key)) {
                      errs.push({ line: idx + 1, message: `Unknown property '${key}' in styles.` });
                      rich.push({ line: idx + 1, start: pos, end: pos + key.length, type: 'unknown_property', name: key });
                    } else if (/color/i.test(key) && !/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(value || '')) {
                      errs.push({ line: idx + 1, message: `Invalid color value '${value}'.` });
                      rich.push({ line: idx + 1, start: pos, end: pos + key.length, type: 'invalid_color', name: value });
                    } else if (/(bold|italic|underline|strikethrough)$/i.test(key) && value !== 'true') {
                      errs.push({ line: idx + 1, message: `Boolean property '${key}' must be 'true' if present.` });
                      rich.push({ line: idx + 1, start: pos, end: pos + key.length, type: 'invalid_boolean', name: key });
                    }
                    pos += kv.length + 1;
                  });
                }
                // Also record unknown style references in this line
                const styleRef = /\bstyle\s*=\s*([A-Za-z0-9_\-]+)/g;
                let m: RegExpExecArray | null;
                while ((m = styleRef.exec(line)) !== null) {
                  const name = m[1];
                  if (!new RegExp(`(^|\n)style\\.${name}\\b`, 'i').test(code)) {
                    const s = m.index + m[0].lastIndexOf(name);
                    rich.push({ line: idx + 1, start: s, end: s + name.length, type: 'style_missing', name });
                    errs.push({ line: idx + 1, message: `Style '${name}' does not exist.` });
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
            borderRadius: 6,
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
              color: '#FF4D4F',
              border: '1px solid #FF4D4F',
              borderRadius: 6,
              padding: '4px 8px',
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


