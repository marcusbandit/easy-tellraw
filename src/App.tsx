import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createEditor, Descendant, Editor as SlateEditor, Range } from "slate";
import "./App.css";
import "./minecraft.css";
import { initialValue } from "./components/TextEditor";
import Sidebar from "./components/Sidebar";
import EditorContainer from "./components/EditorContainer";
import ActionsPanel from "./components/ActionsPanel";
import EnhancedConversationGraph from "./components/ui/EnhancedConversationGraph";
import { useTellrawSegments } from "./hooks/useTellrawSegments";
import { Flex, Tabs, Box, Button, Card, Text } from "@radix-ui/themes";
import PresetsPanel from "./components/PresetsPanel";
import { Slate, withReact } from "slate-react";
import { withHistory } from "slate-history";
import { Transforms } from "slate";
import { flattenSlateFragmentToCharSegments, squashAdjacentSegments } from "./lib/segments";
import { DialogueGraph } from "./types/dialogue";
import { parseDialogue } from "./lib/dialogueParser";
import { syntaxColors } from "./syntaxColors";
import Editor from "react-simple-code-editor";

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
  const [activeTab, setActiveTab] = useState<'presets' | 'editor' | 'graph' | 'raw'>('editor');
  const [dialogueGraph, setDialogueGraph] = useState<DialogueGraph | null>(null);
  const [dialogueSource, setDialogueSource] = useState<string>("");
  const [rawLintErrors, setRawLintErrors] = useState<Array<{ line: number; message: string }>>([]);
  const dialogueFileInputRef = useRef<HTMLInputElement | null>(null);
  // Track last opened tellraw JSON file path for caching and hot reload (optional future use)
  const [lastTellrawFilePath, setLastTellrawFilePath] = useState<string | null>(() => {
    try { return window.localStorage.getItem('lastTellrawFilePath'); } catch { return null; }
  });
  // Node name field (for labeling current editor context)
  const [nodeName, setNodeName] = useState<string>(() => {
    try {
      const stored = window.localStorage.getItem('nodeName');
      return stored && stored.trim() !== '' ? stored : 'unnamed';
    } catch {
      return 'unnamed';
    }
  });
  const nodeNameInputRef = useRef<HTMLInputElement | null>(null);
  const desiredCaretPositionRef = useRef<number | null>(null);
  const sanitizeNodeName = useCallback((raw: string) => {
    // Lowercase, spaces to underscore, remove invalid chars; allow a-z, 0-9, _
    let v = (raw || '').toLowerCase();
    v = v.replace(/\s+/g, '_');
    v = v.replace(/[^a-z0-9_]+/g, '');
    return v;
  }, []);
  useEffect(() => {
    if (desiredCaretPositionRef.current != null && nodeNameInputRef.current) {
      const element = nodeNameInputRef.current;
      const position = Math.min(desiredCaretPositionRef.current, element.value.length);
      try { element.setSelectionRange(position, position); } catch {}
      desiredCaretPositionRef.current = null;
    }
  }, [nodeName]);
  useEffect(() => {
    try { window.localStorage.setItem('nodeName', nodeName); } catch {}
  }, [nodeName]);

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
      const frag = SlateEditor.fragment(editor, sel as any);
      console.log('📦 Setting marked segments:', frag.length, 'items');
      setMarkedSegs(squashAdjacentSegments(flattenSlateFragmentToCharSegments(frag)) as any[]);
      const start = SlateEditor.start(editor, []);
      const end = SlateEditor.end(editor, []);
      const beforeFrag = SlateEditor.fragment(editor, { anchor: start, focus: Range.start(sel) } as any);
      const afterFrag = SlateEditor.fragment(editor, { anchor: Range.end(sel), focus: end } as any);
      console.log('📦 Setting before/after segments');
      setBeforeSegs(squashAdjacentSegments(flattenSlateFragmentToCharSegments(beforeFrag)) as any[]);
      setAfterSegs(squashAdjacentSegments(flattenSlateFragmentToCharSegments(afterFrag)) as any[]);
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
      // Compute JSON for marked text
      const selFrag = SlateEditor.fragment(editor, sel as any);
      const squashedMarked = squashAdjacentSegments(flattenSlateFragmentToCharSegments(selFrag));
      setMarkedSegs(squashedMarked);
      // compute before/after
      const docStart = SlateEditor.start(editor, []);
      const docEnd = SlateEditor.end(editor, []);
      const selStart = Range.start(sel);
      const selEnd = Range.end(sel);
      const beforeFrag = SlateEditor.fragment(editor, { anchor: docStart, focus: selStart } as any);
      const afterFrag = SlateEditor.fragment(editor, { anchor: selEnd, focus: docEnd } as any);
      const squashedBefore = squashAdjacentSegments(flattenSlateFragmentToCharSegments(beforeFrag));
      const squashedAfter = squashAdjacentSegments(flattenSlateFragmentToCharSegments(afterFrag));
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

  const handleImportDialogue = (graph: DialogueGraph, opts?: { autoSwitch?: boolean }) => {
    setDialogueGraph(graph);
    if (opts?.autoSwitch) {
      setActiveTab('graph');
    }
  };

  // Serialize current styles block in the new RAW format shown by the user
  const serializeStylesToRaw = (styles: DialogueGraph['styles']): string => {
    const lines: string[] = [];
    // Named styles first (style.<name>)
    const named = (styles as any).styles || {};
    Object.entries(named).forEach(([key, st]: any) => {
      const parts: string[] = [];
      parts.push(`style.${key}`);
      if (st?.color) parts.push(`color=${st.color}`);
      if (st?.bold) parts.push(`bold=true`);
      if (st?.italic) parts.push(`italic=true`);
      if (st?.underline) parts.push(`underline=true`);
      if (st?.strikethrough) parts.push(`strikethrough=true`);
      lines.push(parts.join(' '));
    });
    if (Object.keys(named).length > 0) lines.push('');
    // Characters
    const speakerEntries = Object.entries(styles?.speakers || {});
    speakerEntries.forEach(([name, style], idx) => {
      const nameStyle: any = (style as any)?.name || {};
      const textStyle: any = (style as any)?.text || {
        color: (style as any)?.color,
        bold: (style as any)?.bold,
        italic: (style as any)?.italic,
        underline: (style as any)?.underline,
        strikethrough: (style as any)?.strikethrough,
      };
      const parts: string[] = [];
      parts.push(`character.${idx + 1}`);
      parts.push(`name=${name}`);
      if (nameStyle?.color) parts.push(`name_color=${nameStyle.color}`);
      if (nameStyle?.bold) parts.push(`name_bold=true`);
      if (nameStyle?.italic) parts.push(`name_italic=true`);
      if (nameStyle?.underline) parts.push(`name_underline=true`);
      if (nameStyle?.strikethrough) parts.push(`name_strikethrough=true`);
      if (textStyle?.color) parts.push(`text_color=${textStyle.color}`);
      if (textStyle?.bold) parts.push(`text_bold=true`);
      if (textStyle?.italic) parts.push(`text_italic=true`);
      if (textStyle?.underline) parts.push(`text_underline=true`);
      if (textStyle?.strikethrough) parts.push(`text_strikethrough=true`);
      lines.push(parts.join(' '));
    });
    if (speakerEntries.length > 0) lines.push("");
    // Buttons
    const buttonEntries = Object.entries(styles?.buttons || {});
    buttonEntries.forEach(([id, style], idx) => {
      const st: any = style as any;
      const label = st?.label || id;
      const parts: string[] = [];
      parts.push(`button.${idx + 1}`);
      parts.push(`label=${label}`);
      if (st?.color) parts.push(`color=${st.color}`);
      if (st?.bold) parts.push(`bold=true`);
      if (st?.italic) parts.push(`italic=true`);
      if (st?.underline) parts.push(`underline=true`);
      if (st?.strikethrough) parts.push(`strikethrough=true`);
      lines.push(parts.join(' '));
    });
    return lines.join('\n');
  };

  // Persist styles back into the raw dialogue file by replacing all character.X / button.X lines
  const applyStylesFragmentToRaw = useCallback((stylesFragment: string) => {
    setDialogueSource(prev => {
      const lines = prev.split(/\r?\n/);
      const startIdx = lines.findIndex(l => /^@styles\s*$/i.test(l.trim()));
      let endIdx = -1;
      if (startIdx >= 0) {
        for (let i = startIdx + 1; i < lines.length; i++) {
          if (/^@endstyles\s*$/i.test(lines[i].trim())) { endIdx = i; break; }
        }
      }
      const fragmentLines = stylesFragment ? stylesFragment.split(/\r?\n/) : [];
      if (startIdx >= 0 && endIdx > startIdx) {
        const before = lines.slice(0, startIdx + 1);
        const after = lines.slice(endIdx);
        return [...before, ...fragmentLines, ...after].join('\n');
      }
      // No styles section found; insert at top
      const block = ['@styles', ...fragmentLines, '@endstyles'];
      return [block.join('\n'), '', prev].join('\n');
    });
  }, []);

  // Open native file dialog for dialogue import (top-level toolbar)
  const handleOpenDialogueFile = useCallback(async () => {
    // Electron path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
    if (ipcRenderer) {
      const result = await ipcRenderer.invoke('open-file-dialog', {
        filters: [{ name: 'Dialogue Text', extensions: ['txt'] }]
      });
      if (!result?.canceled && result.filePaths && result.filePaths[0]) {
        const filePath = result.filePaths[0];
        try {
          const text: string = await ipcRenderer.invoke('read-file', filePath);
          const graph = parseDialogue(text);
          setDialogueSource(text);
          setDialogueSource(text);
          try { window.localStorage.setItem('lastDialogueFilePath', filePath); } catch {}
          handleImportDialogue(graph, { autoSwitch: true });
          // Optional: start watching in Electron main (EditorContainer handles change events when mounted)
          try { ipcRenderer.send('watch-file', filePath); } catch {}
        } catch (err: any) {
          alert('Failed to open dialogue file: ' + (err?.message || String(err)));
        }
      }
      return;
    }
    // Browser fallback
    dialogueFileInputRef.current?.click();
  }, []);

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

  // Optional helper to import JSON from a file path and cache path
  const importJsonFromPath = useCallback(async (filePath: string) => {
    try {
      // Only available in Electron
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
      if (!ipcRenderer) return;
      const text: string = await ipcRenderer.invoke('read-file', filePath);
      importJson(text);
      setDialogueSource(text);
      try { window.localStorage.setItem('lastTellrawFilePath', filePath); } catch {}
      setLastTellrawFilePath(filePath);
      ipcRenderer.send('watch-file', filePath);
      // Listen once to refresh from disk
      const onChanged = async (_event: any, payload: { path: string }) => {
        if (payload?.path === filePath) {
          const nextText: string = await ipcRenderer.invoke('read-file', filePath);
          importJson(nextText);
        }
      };
      ipcRenderer.on('file-changed', onChanged);
    } catch {
      // ignore
    }
  }, []);

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
    
    setActiveTab(value as 'presets' | 'editor' | 'graph' | 'raw');
    console.log('🔄 Tab change complete. New activeTab:', value);
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Main content area */}
      <div style={{ flex: '1 1 auto', minWidth: 0, background: 'var(--gray-a2)', display: 'flex', flexDirection: 'column', padding: '16px', overflow: 'auto' }}>
        <Tabs.Root value={activeTab} onValueChange={handleTabChange} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Tabs.List>
            <Tabs.Trigger value="presets">Presets</Tabs.Trigger>
            <Tabs.Trigger value="editor">Editor</Tabs.Trigger>
            <Tabs.Trigger value="graph">Graph</Tabs.Trigger>
            <Tabs.Trigger value="raw">Raw</Tabs.Trigger>
          </Tabs.List>
          {/* Global toolbar: Dialogue import below tab picker (lighter background) */}
          <div
            role="toolbar"
            style={{
              backgroundColor: 'var(--gray-a2)',
              border: '1px solid var(--gray-a6)',
              padding: '12px',
              borderRadius: '6px',
              marginTop: '12px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 8,
            }}
          >
            {/* Hidden input for browser fallback */}
            <input
              ref={dialogueFileInputRef}
              type="file"
              accept=".txt"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const graph = parseDialogue(text);
                  setDialogueSource(text);
                  handleImportDialogue(graph, { autoSwitch: true });
                } catch (err: any) {
                  alert('Failed to import dialogue: ' + (err?.message || String(err)));
                } finally {
                  if (dialogueFileInputRef.current) dialogueFileInputRef.current.value = '';
                }
              }}
            />
            <Button variant="surface" size="2" onClick={handleOpenDialogueFile}>Import Dialogue (.txt)</Button>
          </div>
          
          <Box pt="3" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'presets' && (
              <Tabs.Content value="presets" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <PresetsPanel
                  onUseCommand={(cmd) => importJson(cmd)}
                  graph={dialogueGraph}
                  onUpdateStyles={(styles) => {
                    setDialogueGraph(g => g ? { ...g, styles } : { styles, scenes: {} } as any);
                    // Do not write to disk; RAW tab remains the source of truth
                  }}
                  onRequestRawUpdate={(stylesFragment) => applyStylesFragmentToRaw(stylesFragment)}
                />
              </Tabs.Content>
            )}

            {activeTab === 'editor' && (
              <Tabs.Content value="editor" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Slate key={slateKey} editor={editor} initialValue={value} onChange={onChange} onSelectionChange={handleSelectionChange}>
                  <section style={{ flex: 1, display: 'flex' }}>
                    <Flex gap="4" style={{ flex: 1 }}>
                      <Sidebar segments={segments} segmentPaths={segmentPaths} activeSegmentIndex={activeSegmentIndex} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto' }}>
                        <Card size="2" variant="surface">
                          <Flex direction="column" gap="2">
                            <Text size="2">Node name:</Text>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
                              <Text style={{ lineHeight: 1, fontSize: '22px', fontWeight: 600 }}>@</Text>
                              <span style={{ position: 'relative', display: 'inline-block' }}>
                                <span
                                  aria-hidden
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    whiteSpace: 'pre',
                                    fontSize: '22px',
                                    fontWeight: 600,
                                    color: 'var(--gray-a12)',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  {nodeName.split('').map((ch, i) => (
                                    ch === '_' ? (
                                      <span key={i} style={{ color: 'var(--gray-a9)' }}>_</span>
                                    ) : (
                                      <span key={i}>{ch}</span>
                                    )
                                  ))}
                                </span>
                                <input
                                  ref={nodeNameInputRef}
                                  aria-label="Node name"
                                  value={nodeName}
                                  onChange={(e) => setNodeName(sanitizeNodeName(e.target.value))}
                                onKeyDown={(e) => {
                                  // Keep node title key handling isolated
                                  e.stopPropagation();
                                    if (e.key === ' ') {
                                      e.preventDefault();
                                      const element = nodeNameInputRef.current;
                                      const currentValue = nodeName;
                                      const selectionStart = element?.selectionStart ?? currentValue.length;
                                      const selectionEnd = element?.selectionEnd ?? currentValue.length;
                                      const nextRaw = currentValue.slice(0, selectionStart) + '_' + currentValue.slice(selectionEnd);
                                      const next = sanitizeNodeName(nextRaw);
                                      // Place caret after the inserted underscore
                                      desiredCaretPositionRef.current = selectionStart + 1;
                                      setNodeName(next);
                                    }
                                  }}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                  onBlur={() => {
                                    if (!nodeName || nodeName.trim() === '') setNodeName('unnamed');
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    borderBottom: '1px solid var(--gray-a5)',
                                    outline: 'none',
                                    color: 'transparent',
                                    caretColor: 'var(--gray-a12)',
                                    fontSize: '22px',
                                    fontWeight: 600,
                                    padding: '2px 0',
                                    marginLeft: 0,
                                    width: 'auto',
                                    minWidth: 0,
                                    fontFamily: 'inherit'
                                  }}
                                  size={Math.max((nodeName?.length ?? 0), 7)}
                                />
                              </span>
                            </div>
                          </Flex>
                        </Card>
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
                          onImportDialogue={handleImportDialogue}
                          onDialogueSourceChange={(src) => setDialogueSource(src)}
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
                <EnhancedConversationGraph graph={dialogueGraph} />
              </Tabs.Content>
            )}

            {activeTab === 'raw' && (
              <Tabs.Content value="raw" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Card size="2" variant="surface" style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                  <Text as="div" size="2">Edit dialogue.txt</Text>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <Editor
                      value={dialogueSource}
                      onValueChange={(code) => {
                        setDialogueSource(code);
                        // Simple lint: validate scene headers only; no auto-apply to graph
                        const lines = code.split(/\r?\n/);
                        const errs: Array<{ line: number; message: string }> = [];
                        const sceneStart = /^@([A-Za-z0-9_\-]+)\s*$/;
                        lines.forEach((line, idx) => {
                          if (/^\s*@/.test(line) && !sceneStart.test(line.trim())) {
                            errs.push({ line: idx + 1, message: 'Invalid node name. Use @name with letters, digits, _ or - only.' });
                          }
                        });
                        setRawLintErrors(errs);
                      }}
                      highlight={(code) => {
                        // Raw: minimal markup. Color scene headers, inline @refs, and brackets/braces
                        const escapeHtml = (s: string) => s
                          .replace(/&/g, '&amp;')
                          .replace(/</g, '&lt;')
                          .replace(/>/g, '&gt;');
                        // Gather named styles directly from current RAW text to avoid needing Apply-to-Graph
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
                          // Mark unknown style=NAME anywhere on the line (robust; not limited to {...})
                          out = out.replace(/(\bstyle\s*=\s*)([A-Za-z0-9_-]+)/g, (_m, p1, p2) => {
                            if (!knownStyleNames.has(p2)) {
                              return `${p1}<span class=\"raw-unknown-style\">${p2}</span>`;
                            }
                            return `${p1}${p2}`;
                          });
                          // Then: [] in yellow (bracket), {} in pink (brace)
                          out = out.replace(/\[|\]/g, (m) => `<span style="color:${syntaxColors.bracket}">${m}</span>`);
                          out = out.replace(/\{|\}/g, (m) => `<span style="color:${syntaxColors.brace}">${m}</span>`);
                          // inline @name references
                          out = out.replace(/@([A-Za-z0-9_\-]+)/g, (_m, p1) => `<span style="color:${syntaxColors.selector}">@${p1}</span>`);
                          // arrows '->' (escaped as -&gt;)
                          out = out.replace(/-&gt;/g, `<span style="color:${syntaxColors.punctuation}">-&gt;</span>`);
                          // any token like word.word as a keyword (e.g., character.1, button.primary, style.name)
                          out = out.replace(/\b([A-Za-z_][A-Za-z0-9_-]*)\.([A-Za-z_][A-Za-z0-9_-]*)\b/g, (_m, a, b) => `<span style="color:${syntaxColors.keyword}">${a}.${b}</span>`);
                          return out;
                        };
                        return code
                          .split(/\r?\n/)
                          .map((line) => {
                            const escaped = escapeHtml(line);
                            if (/^\s*@/.test(line)) {
                              return `<span class="token node_name_definition">${escaped}</span>`;
                            }
                            return colorize(escaped);
                          })
                          .join('\n');
                      }}
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
                      <Button size="2" onClick={() => {
                        try {
                          const graph = parseDialogue(dialogueSource);
                          setDialogueGraph(graph);
                        } catch (err: any) {
                          alert('Failed to parse dialogue: ' + (err?.message || String(err)));
                        }
                      }}>Apply to Graph</Button>
                    </div>
                  </div>
                </Card>
              </Tabs.Content>
            )}
          </Box>
        </Tabs.Root>
      </div>
    </div>
  );
};

export default App;
