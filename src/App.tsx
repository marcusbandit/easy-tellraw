import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createEditor, Descendant, Editor as SlateEditor, Range } from "slate";
import "./App.css";
import "./minecraft.css";
import { initialValue } from "./components/TextEditor";
import Sidebar from "./components/Sidebar";
import EditorContainer from "./components/EditorContainer";
import ActionsPanel from "./components/ActionsPanel";
import GraphEditor from "./components/ui/GraphEditor";
import { useTellrawSegments } from "./hooks/useTellrawSegments";
import { Flex, Tabs, Box } from "@radix-ui/themes";
import { Slate, withReact } from "slate-react";
import { withHistory } from "slate-history";
import { Transforms } from "slate";

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
  // Ref to track programmatic updates
  const isProgrammaticUpdateRef = useRef<boolean>(false);
  // Tellraw target selector state
  const [target, setTarget] = useState<string>('@p');
  const [activeTab, setActiveTab] = useState<'editor' | 'graph'>('editor');

  // Helper function to safely update editor without triggering onChange loops
  const safeUpdateEditor = useCallback((operation: () => void) => {
    isProgrammaticUpdateRef.current = true;
    try {
      operation();
    } finally {
      // Reset the flag after a short delay
      setTimeout(() => {
        isProgrammaticUpdateRef.current = false;
      }, 10);
    }
  }, []);

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
    // Skip if this is a programmatic update to prevent infinite loops
    if (isProgrammaticUpdateRef.current) {
      console.log('📝 Skipping onChange - programmatic update');
      return;
    }
    
    console.log('📝 onChange triggered - segments count:', val.length);
    setValue(val);
    window.localStorage.setItem('editorValue', JSON.stringify(val));
    
    // Throttle split JSON recompute to max once per 100ms
    const now = Date.now();
    const sel = editor.selection ?? lastSelection;
    if (sel && !Range.isCollapsed(sel) && now - lastRecalcTimeRef.current > 100) {
      console.log('🔄 Recalculating split JSON - selection:', sel);
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
      console.log('📦 Setting marked segments:', frag.length, 'items');
      setMarkedSegs(squash(flatten(frag)));
      const start = SlateEditor.start(editor, []);
      const end = SlateEditor.end(editor, []);
      const beforeFrag = SlateEditor.fragment(editor, { anchor: start, focus: Range.start(sel) } as any);
      const afterFrag = SlateEditor.fragment(editor, { anchor: Range.end(sel), focus: end } as any);
      console.log('📦 Setting before/after segments');
      setBeforeSegs(squash(flatten(beforeFrag)));
      setAfterSegs(squash(flatten(afterFrag)));
    } else {
      // Clear split JSON when selection is collapsed or no marking
      if (beforeSegs || markedSegs || afterSegs) {
        console.log('🗑️ Clearing split JSON - selection collapsed or no marking');
        setBeforeSegs(null);
        setMarkedSegs(null);
        setAfterSegs(null);
      }
    }
  };

  // Map current Slate selection to segment index, treating offset=0 as previous segment
  const handleSelectionChange = (sel: any) => {
    console.log('🎯 Selection change:', sel ? 'has selection' : 'no selection');
    
    if (!sel) {
      console.log('🗑️ No selection - clearing active segment');
      setActiveSegmentIndex(null);
      // clear split JSON
      setBeforeSegs(null);
      setMarkedSegs(null);
      setAfterSegs(null);
      return;
    }
    
    // Only save non-collapsed selections so highlights persist when cursor moves
    const isCollapsed = Range.isCollapsed(sel);
    console.log('🎯 Selection collapsed:', isCollapsed);
    
    if (!isCollapsed) {
      console.log('📌 Saving non-collapsed selection');
      setLastSelection(sel);
    }
    
    const { path, offset } = sel.anchor;
    const idx = segmentPaths.findIndex(p => p !== null && p[0] === path[0] && p[1] === path[1]);
    let newIndex: number | null = null;
    if (idx >= 0) {
      newIndex = offset === 0 ? (idx > 0 ? idx - 1 : 0) : idx;
      console.log('🎯 Found segment index:', idx, '-> newIndex:', newIndex, 'offset:', offset);
    } else {
      console.log('🎯 No matching segment found for path:', path);
    }
    
    setActiveSegmentIndex(newIndex);
    
    // Clear split JSON when selection is collapsed or moves without a marked range
    if (isCollapsed) {
      // Clear persistent highlight when cursor collapses (click without marking)
      console.log('🗑️ Selection collapsed - clearing highlights');
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

  // Clear selection when switching to graph mode to prevent freezes
  const handleTabChange = (value: string) => {
    console.log('🔄 Tab change requested:', value, 'Current activeTab:', activeTab);
    
    if (value === 'graph') {
      console.log('📊 Switching to graph mode - clearing selections...');
      
      // Clear Slate selection to prevent freezes
      if (editor.selection) {
        console.log('🗑️ Clearing Slate selection:', editor.selection);
        Transforms.deselect(editor);
      }
      
      console.log('🗑️ Clearing segment states...');
      setActiveSegmentIndex(null);
      setLastSelection(null);
      setBeforeSegs(null);
      setMarkedSegs(null);
      setAfterSegs(null);
      
      console.log('✅ Graph mode cleanup complete');
    } else {
      console.log('✏️ Switching to editor mode');
    }
    
    setActiveTab(value as 'editor' | 'graph');
    console.log('🔄 Tab change complete. New activeTab:', value);
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Main content area */}
      <div style={{ flex: '1 1 auto', minWidth: 0, background: 'var(--gray-a2)', display: 'flex', flexDirection: 'column', padding: '16px', overflow: 'auto' }}>
        <Tabs.Root value={activeTab} onValueChange={handleTabChange} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Tabs.List>
            <Tabs.Trigger value="editor">Editor</Tabs.Trigger>
            <Tabs.Trigger value="graph">Graph</Tabs.Trigger>
          </Tabs.List>
          
          <Box pt="3" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'editor' && (
              <Tabs.Content value="editor" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Slate key={slateKey} editor={editor} initialValue={value} onChange={onChange} onSelectionChange={handleSelectionChange}>
                  <section style={{ flex: 1, display: 'flex' }}>
                    <Flex gap="4" style={{ flex: 1 }}>
                      <Sidebar segments={segments} segmentPaths={segmentPaths} activeSegmentIndex={activeSegmentIndex} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto' }}>
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
                      </div>
                    </Flex>
                  </section>
                </Slate>
              </Tabs.Content>
            )}
            
            {activeTab === 'graph' && (
              <Tabs.Content value="graph" style={{ flex: 1 }}>
                <GraphEditor segments={segments} />
              </Tabs.Content>
            )}
          </Box>
        </Tabs.Root>
      </div>
    </div>
  );
};

export default App;
