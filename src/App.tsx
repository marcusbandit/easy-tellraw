import React, { useState, useMemo, useEffect, useRef } from "react";
import { createEditor, Descendant, Text, Transforms, Editor as SlateEditor, Range } from "slate";
import "./App.css";
import "./minecraft.css";
import { initialValue } from "./components/TextEditor";
import Sidebar from "./components/Sidebar";
import EditorContainer from "./components/EditorContainer";
import ActionsPanel from "./components/ActionsPanel";
import { useTellrawSegments } from "./hooks/useTellrawSegments";
import { Box, Container, Flex } from "@radix-ui/themes";
import { Slate, Editable, withReact } from "slate-react";
import { withHistory } from "slate-history";

const App: React.FC = () => {
  const [value, setValue] = useState<Descendant[]>(() => {
    const saved = window.localStorage.getItem('editorValue');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return initialValue;
  });
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
  const editor = useMemo(() => withHistory(withReact(createEditor())), []);
  // Track the last non-null selection to preserve highlights
  const [lastSelection, setLastSelection] = useState<Range | null>(null);
  // Ref to throttle JSON split updates
  const lastRecalcTimeRef = useRef<number>(0);

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

  // Function to toggle text marks
  const toggleMark = (format: string) => {
    const marks: any = SlateEditor.marks(editor) || {};
    const isActive = marks[format];
    Transforms.setNodes(
      editor,
      { [format]: !isActive },
      { match: (n) => Text.isText(n), split: true }
    );
  };

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

  return (
    <Box style={{ background: "var(--gray-a2)" }} p="4" minHeight="100vh">
      <Slate
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
