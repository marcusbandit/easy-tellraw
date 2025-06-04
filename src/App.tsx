import React, { useState, useMemo, useEffect, useRef } from "react";
import { createEditor, Descendant, Editor as SlateEditor, Range } from "slate";
import "./App.css";
import "./minecraft.css";
import { initialValue } from "./components/TextEditor";
import Sidebar from "./components/Sidebar";
import EditorContainer from "./components/EditorContainer";
import ActionsPanel from "./components/ActionsPanel";
import { useTellrawSegments } from "./hooks/useTellrawSegments";
import { Box, Container, Flex, Button } from "@radix-ui/themes";
import { Slate, withReact } from "slate-react";
import { withHistory } from "slate-history";
import { TELLRAW_PREFIX } from "./constants";

const App: React.FC = () => {
  // State for Slate content and remount key
  const [value, setValue] = useState<Descendant[]>(() => {
    const saved = window.localStorage.getItem('editorValue');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return initialValue;
  });
  const [slateKey, setSlateKey] = useState(0);
  const { segments, segmentPaths, tellrawJson } = useTellrawSegments(value);
  // State to hold character-level JSON splits when selection is active
  const [beforeSegs, setBeforeSegs] = useState<any[] | null>(null);
  const [markedSegs, setMarkedSegs] = useState<any[] | null>(null);
  const [afterSegs, setAfterSegs] = useState<any[] | null>(null);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const [clickAction, setClickAction] = useState("run_command");
  const [clickValue, setClickValue] = useState("");
  const [hoverText, setHoverText] = useState("");
  const [clickFieldFocused, setClickFieldFocused] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const editor = useMemo(() => withHistory(withReact(createEditor())), [slateKey]);
  // Track the last non-null selection to preserve highlights
  const [lastSelection, setLastSelection] = useState<Range | null>(null);
  // Ref to throttle JSON split updates
  const lastRecalcTimeRef = useRef<number>(0);
  // Tellraw target selector state
  const [target, setTarget] = useState<string>('@p');

  // Sync click and hover state when active segment changes
  useEffect(() => {
    if (!clickFieldFocused) {
      if (activeSegmentIndex != null && segments[activeSegmentIndex]) {
        const seg = segments[activeSegmentIndex] as any;
        // Click action
        if (seg.click_event) {
          setClickAction(seg.click_event.action || 'run_command');
          const clickVal = seg.click_event.command ?? seg.click_event.url ?? seg.click_event.value ?? '';
          setClickValue(clickVal);
        } else {
          setClickAction('run_command');
          setClickValue('');
        }
        // Hover text
        if (seg.hover_event) {
          const hoverVal = seg.hover_event.value ?? seg.hover_event.text ?? '';
          setHoverText(hoverVal);
        } else {
          setHoverText('');
        }
      } else {
        // No segment selected
        setClickAction('run_command');
        setClickValue('');
        setHoverText('');
      }
    }
  }, [activeSegmentIndex, segments, clickFieldFocused]);

  // Update value and cache on change
  const onChange = (val: Descendant[]) => {
    setValue(val);
    window.localStorage.setItem('editorValue', JSON.stringify(val));
    // Throttle split JSON recompute to max once per 100ms
    const now = Date.now();
    const sel = editor.selection ?? lastSelection;
    if (sel && !Range.isCollapsed(sel) && now - lastRecalcTimeRef.current > 100) {
      lastRecalcTimeRef.current = now;
      // flatten and squash functions
      const flatten = (nodes: any[]) => {
        const arr: any[] = [];
        nodes.forEach((node: any) => {
          if (node.children) node.children.forEach((child: any) => {
            if (!child.text) return;
            for (const char of child.text) arr.push({ ...child, text: char });
          });
        });
        return arr;
      };
      const squash = (segs: any[]) => {
        const res: any[] = [];
        segs.forEach(seg => {
          if (res.length > 0) {
            const prev = res[res.length - 1];
            const keys = Object.keys(seg).filter(k => k !== 'text');
            if (keys.every(k => JSON.stringify(prev[k]) === JSON.stringify(seg[k]))) {
              prev.text += seg.text;
              return;
            }
          }
          res.push({ ...seg });
        });
        return res;
      };
      const frag = SlateEditor.fragment(editor, sel as any);
      setMarkedSegs(squash(flatten(frag)));
      const start = SlateEditor.start(editor, []);
      const end = SlateEditor.end(editor, []);
      const beforeFrag = SlateEditor.fragment(editor, { anchor: start, focus: Range.start(sel) } as any);
      const afterFrag = SlateEditor.fragment(editor, { anchor: Range.end(sel), focus: end } as any);
      setBeforeSegs(squash(flatten(beforeFrag)));
      setAfterSegs(squash(flatten(afterFrag)));
    } else {
      // Clear split JSON when selection is collapsed or no marking
      setBeforeSegs(null);
      setMarkedSegs(null);
      setAfterSegs(null);
    }
  };

  // Map current Slate selection to segment index, treating offset=0 as previous segment
  const handleSelectionChange = (sel: any) => {
    if (!sel) {
      setActiveSegmentIndex(null);
      // clear split JSON
      setBeforeSegs(null);
      setMarkedSegs(null);
      setAfterSegs(null);
      return;
    }
    // Only save non-collapsed selections so highlights persist when cursor moves
    const isCollapsed = Range.isCollapsed(sel);
    if (!isCollapsed) {
      setLastSelection(sel);
    }
    const { path, offset } = sel.anchor;
    const idx = segmentPaths.findIndex(p => p !== null && p[0] === path[0] && p[1] === path[1]);
    let newIndex: number | null = null;
    if (idx >= 0) {
      newIndex = offset === 0 ? (idx > 0 ? idx - 1 : 0) : idx;
    }
    setActiveSegmentIndex(newIndex);
    // Clear split JSON when selection is collapsed or moves without a marked range
    if (isCollapsed) {
      // Clear persistent highlight when cursor collapses (click without marking)
      setLastSelection(null);
      setBeforeSegs(null);
      setMarkedSegs(null);
      setAfterSegs(null);
      return;
    }
    if (!isCollapsed) {
      // Helper to flatten fragment nodes to tellraw-like segments
      const flattenNodes = (nodes: any[]) => {
        const arr: any[] = [];
        nodes.forEach((node: any) => {
          if (node.children) {
            node.children.forEach((child: any) => {
              if (!child.text) return;
              // Split into individual characters
              for (const char of child.text) {
                const seg: any = { text: char, color: child.color || '#ffffff' };
                if (child.bold) seg.bold = true;
                if (child.italic) seg.italic = true;
                if (child.underline) seg.underline = true;
                if (child.strikethrough) seg.strikethrough = true;
                if (child.obfuscated) seg.obfuscated = true;
                if (child.click_event) seg.click_event = child.click_event;
                if (child.hover_event) seg.hover_event = child.hover_event;
                arr.push(seg);
              }
            });
          }
        });
        return arr;
      };
      // Helper to squash adjacent segments with identical attributes into longer text runs
      const squashSegments = (segs: any[]) => {
        const result: any[] = [];
        for (const seg of segs) {
          if (result.length > 0) {
            const prev = result[result.length - 1];
            const aKeys = Object.keys(prev).filter(k => k !== 'text');
            const bKeys = Object.keys(seg).filter(k => k !== 'text');
            if (aKeys.length === bKeys.length && aKeys.every(key => JSON.stringify(prev[key]) === JSON.stringify(seg[key]))) {
              prev.text += seg.text;
              continue;
            }
          }
          result.push({ ...seg });
        }
        return result;
      };
      // Compute JSON for marked text
      const selFrag = SlateEditor.fragment(editor, sel as any);
      const squashedMarked = squashSegments(flattenNodes(selFrag));
      setMarkedSegs(squashedMarked);
      // compute before/after
      const docStart = SlateEditor.start(editor, []);
      const docEnd = SlateEditor.end(editor, []);
      const selStart = Range.start(sel);
      const selEnd = Range.end(sel);
      const beforeFrag = SlateEditor.fragment(editor, { anchor: docStart, focus: selStart } as any);
      const afterFrag = SlateEditor.fragment(editor, { anchor: selEnd, focus: docEnd } as any);
      const squashedBefore = squashSegments(flattenNodes(beforeFrag));
      const squashedAfter = squashSegments(flattenNodes(afterFrag));
      setBeforeSegs(squashedBefore);
      setAfterSegs(squashedAfter);
    }
  };

  // Handler to reset editor: clear localStorage and remount Slate
  const handleReset = () => {
    // Clear stored content
    window.localStorage.removeItem('editorValue');
    // Clear selection and segment highlights
    setLastSelection(null);
    setActiveSegmentIndex(null);
    setBeforeSegs(null);
    setMarkedSegs(null);
    setAfterSegs(null);
    // Reset value and recreate editor
    setValue(initialValue);
    setSlateKey(k => k + 1);
  };

  // Handler to copy collapsed tellraw JSON to clipboard
  const handleCopy = () => {
    // Collapsed JSON (no pretty indent) with dynamic target
    const collapsed = `tellraw ${target} ` + JSON.stringify(segments);
    navigator.clipboard.writeText(collapsed);
  };

  // Import tellraw JSON or command string
  const importJson = (input: string) => {
    // Determine target from command
    const tokens = input.trim().split(/\s+/);
    if (tokens[0].replace(/^\//, '') === 'tellraw' && tokens.length >= 2 && tokens[1].startsWith('@')) {
      setTarget(tokens[1]);
    }
    let jsonStr = input.trim();
    // Strip '/tellraw' or 'tellraw' prefix if present
    if (tokens[0].replace(/^\//, '') === 'tellraw') {
      // Remove command and selector tokens (e.g., '/tellraw @s')
      if (tokens.length >= 3) {
        jsonStr = tokens.slice(2).join(' ');
      } else {
        const idx = jsonStr.indexOf('[');
        jsonStr = idx >= 0 ? jsonStr.substring(idx) : jsonStr;
      }
    }
    try {
      const arr = JSON.parse(jsonStr);
      if (!Array.isArray(arr)) throw new Error('Not an array');
      // Convert segments to Slate value
      const newValue = [
        { type: 'paragraph', children: arr.map((seg: any) => {
            const child: any = { text: seg.text || '' };
            if (seg.color) child.color = seg.color;
            if (seg.bold) child.bold = seg.bold;
            if (seg.italic) child.italic = seg.italic;
            if (seg.underline) child.underline = seg.underline;
            if (seg.strikethrough) child.strikethrough = seg.strikethrough;
            if (seg.obfuscated) child.obfuscated = seg.obfuscated;
            if (seg.click_event) child.click_event = seg.click_event;
            if (seg.hover_event) child.hover_event = seg.hover_event;
            return child;
          })
        }
      ];
      // Persist and update state
      window.localStorage.setItem('editorValue', JSON.stringify(newValue));
      setValue(newValue);
      setSlateKey(k => k + 1);
    } catch (e: any) {
      alert('Failed to import JSON: ' + e.message);
    }
  };

  return (
    <Box style={{ background: "var(--gray-a2)" }} p="4" minHeight="100vh">
      <Slate key={slateKey}
        editor={editor}
        initialValue={value}
        onChange={onChange}
        onSelectionChange={handleSelectionChange}
      >
        <Container size="4">
          <Flex gap="4">
            <Sidebar segments={segments} segmentPaths={segmentPaths} activeSegmentIndex={activeSegmentIndex} />
            <Box width="100%" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <EditorContainer
                tellrawJson={tellrawJson}
                segments={segments}
                activeSegmentIndex={activeSegmentIndex}
                beforeSegments={beforeSegs}
                markedSegments={markedSegs}
                afterSegments={afterSegs}
                selection={lastSelection}
                onImport={importJson}
                onReset={handleReset}
                onCopy={handleCopy}
                target={target}
                setTarget={setTarget}
              />
              <ActionsPanel
                clickAction={clickAction}
                setClickAction={setClickAction}
                clickValue={clickValue}
                setClickValue={setClickValue}
                hoverText={hoverText}
                setHoverText={setHoverText}
                clickFieldFocused={clickFieldFocused}
                setClickFieldFocused={setClickFieldFocused}
                activeSegmentIndex={activeSegmentIndex}
                segmentPaths={segmentPaths}
              />
            </Box>
          </Flex>
        </Container>
      </Slate>
    </Box>
  );
};

export default App;
