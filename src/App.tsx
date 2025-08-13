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
import { Flex, Tabs, Box, Button, Card, Text, AlertDialog } from "@radix-ui/themes";
import PresetsPanel from "./components/PresetsPanel";
import { Slate, withReact } from "slate-react";
import { withHistory } from "slate-history";
import { Transforms } from "slate";
import { flattenSlateFragmentToCharSegments, squashAdjacentSegments } from "./lib/segments";
import { DialogueGraph } from "./types/dialogue";
import { parseDialogue } from "./lib/dialogueParser";
import RawTab from "./components/tabs/RawTab";

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
  const [activeTab, setActiveTab] = useState<'presets' | 'editor' | 'graph' | 'raw'>(() => {
    try {
      const stored = window.localStorage.getItem('lastActiveTab');
      if (stored === 'presets' || stored === 'editor' || stored === 'graph' || stored === 'raw') return stored;
    } catch {}
    return 'editor';
  });
  const [dialogueGraph, setDialogueGraph] = useState<DialogueGraph | null>(null);
  const [dialogueSource, setDialogueSource] = useState<string>("");
  const [rawLintErrors, setRawLintErrors] = useState<Array<{ line: number; message: string }>>([]);
  const dialogueFileInputRef = useRef<HTMLInputElement | null>(null);
  // Fixed header height tracking to offset content correctly
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  useEffect(() => {
    const measure = () => {
      try { setHeaderHeight(stickyHeaderRef.current?.offsetHeight || 0); } catch {}
    };
    measure();
    window.addEventListener('resize', measure);
    const id = window.setInterval(measure, 200);
    return () => { window.removeEventListener('resize', measure); window.clearInterval(id); };
  }, []);
  // Track last opened tellraw JSON file path for caching and hot reload (optional future use)
  // Removed unused lastTellrawFilePath state
  // Import confirmation dialog state
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
  const pendingImportRef = useRef<null | (
    { kind: 'electron'; path: string } | { kind: 'browser'; file: File }
  )>(null);
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

  // Removed unused safeUpdateEditor helper

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
      return;
    }
    
    setValue(val);
    window.localStorage.setItem('editorValue', JSON.stringify(val));
    
    // Throttle split JSON recompute to max once per 100ms
    const now = Date.now();
    const sel = editor.selection ?? lastSelection;
    if (sel && !Range.isCollapsed(sel) && now - lastRecalcTimeRef.current > 100) {
      lastRecalcTimeRef.current = now;
      const frag = SlateEditor.fragment(editor, sel as any);
      setMarkedSegs(squashAdjacentSegments(flattenSlateFragmentToCharSegments(frag)) as any[]);
      const start = SlateEditor.start(editor, []);
      const end = SlateEditor.end(editor, []);
      const beforeFrag = SlateEditor.fragment(editor, { anchor: start, focus: Range.start(sel) } as any);
      const afterFrag = SlateEditor.fragment(editor, { anchor: Range.end(sel), focus: end } as any);
      setBeforeSegs(squashAdjacentSegments(flattenSlateFragmentToCharSegments(beforeFrag)) as any[]);
      setAfterSegs(squashAdjacentSegments(flattenSlateFragmentToCharSegments(afterFrag)) as any[]);
    } else {
      // Clear split JSON when selection is collapsed or no marking
      if (beforeSegs || markedSegs || afterSegs) {
        setBeforeSegs(null);
        setMarkedSegs(null);
        setAfterSegs(null);
      }
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
    } else {
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

  const loadSceneIntoEditor = useCallback((sceneId: string) => {
    if (!dialogueGraph) return;
    const scene = dialogueGraph.scenes?.[sceneId];
    if (!scene) return;
    const newValue: Descendant[] = scene.lines.map((line) => {
      const speakerStyle = line.speaker ? dialogueGraph.styles.speakers[line.speaker] : undefined;
      const textColorFallback = speakerStyle?.text?.color || speakerStyle?.color || '#ffffff';
      const textBoldFallback = !!(speakerStyle?.text?.bold ?? speakerStyle?.bold);
      const textItalicFallback = !!(speakerStyle?.text?.italic ?? speakerStyle?.italic);
      const textUnderlineFallback = !!(speakerStyle?.text?.underline ?? speakerStyle?.underline);
      const textStrikeFallback = !!(speakerStyle?.text?.strikethrough ?? speakerStyle?.strikethrough);
      const baseColor = line.style?.color || textColorFallback;
      const baseBold = (line.style?.bold !== undefined ? !!line.style?.bold : textBoldFallback);
      const baseItalic = (line.style?.italic !== undefined ? !!line.style?.italic : textItalicFallback);
      const baseUnderline = (line.style?.underline !== undefined ? !!line.style?.underline : textUnderlineFallback);
      const baseStrike = (line.style?.strikethrough !== undefined ? !!line.style?.strikethrough : textStrikeFallback);

      const children: any[] = [];
      if (line.showSpeakerLabel && line.speaker) {
        const nameColor = speakerStyle?.name?.color;
        const nameBold = !!(speakerStyle?.name?.bold);
        const nameItalic = !!(speakerStyle?.name?.italic);
        const nameUnderline = !!(speakerStyle?.name?.underline);
        const nameStrike = !!(speakerStyle?.name?.strikethrough);
        children.push({ text: `${line.speaker}: `, color: nameColor || baseColor, bold: nameBold, italic: nameItalic, underline: nameUnderline, strikethrough: nameStrike });
      }

      if (Array.isArray(line.runs) && line.runs.length > 0) {
        line.runs.forEach((r) => {
          children.push({
            text: r.text,
            color: r.color || baseColor,
            bold: r.bold !== undefined ? !!r.bold : baseBold,
            italic: r.italic !== undefined ? !!r.italic : baseItalic,
            underline: r.underline !== undefined ? !!r.underline : baseUnderline,
            strikethrough: r.strikethrough !== undefined ? !!r.strikethrough : baseStrike,
          });
        });
      } else if (line.text && line.text.length > 0) {
        children.push({ text: line.text, color: baseColor, bold: baseBold, italic: baseItalic, underline: baseUnderline, strikethrough: baseStrike });
      }

      if (Array.isArray(line.choices) && line.choices.length > 0) {
        // Append a space when there is preceding text
        if (children.length > 0) children.push({ text: ' ', color: baseColor, bold: baseBold, italic: baseItalic, underline: baseUnderline, strikethrough: baseStrike });
        line.choices.forEach((choice, idx) => {
          const btn = dialogueGraph.styles.buttons?.[choice.className || ''];
          const cColor = choice.color || btn?.color || baseColor;
          const cBold = choice.bold !== undefined ? !!choice.bold : !!btn?.bold;
          const cItalic = choice.italic !== undefined ? !!choice.italic : !!btn?.italic;
          const cUnderline = choice.underline !== undefined ? !!choice.underline : !!btn?.underline;
          const cStrike = choice.strikethrough !== undefined ? !!choice.strikethrough : !!btn?.strikethrough;
          const label = (choice.text && choice.text.length > 0) ? choice.text : (btn?.label || choice.className || 'button');
          children.push({ text: `[${label}]`, color: cColor, bold: cBold, italic: cItalic, underline: cUnderline, strikethrough: cStrike });
          if (idx < line.choices.length - 1) children.push({ text: ' ', color: baseColor, bold: baseBold, italic: baseItalic, underline: baseUnderline, strikethrough: baseStrike });
        });
      }

      return { type: 'paragraph', children } as unknown as Descendant;
    });

    try { window.localStorage.setItem('editorValue', JSON.stringify(newValue)); } catch {}
    setValue(newValue);
    setSlateKey(k => k + 1);
    setNodeName(sanitizeNodeName(sceneId));
    setActiveTab('editor');
    try { window.localStorage.setItem('lastActiveTab', 'editor'); } catch {}
  }, [dialogueGraph, sanitizeNodeName]);

  const handleImportDialogue = (graph: DialogueGraph) => {
    setDialogueGraph(graph);
  };

  // Removed unused serializeStylesToRaw helper

  // Persist styles back into the raw dialogue file by replacing all character.X / button.X lines
  const applyStylesFragmentToRaw = useCallback((stylesFragment: string) => {
    // Mark as a local RAW-edit so the electron writer persists to disk
    isLocalRawEditRef.current = true;
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
        pendingImportRef.current = { kind: 'electron', path: filePath };
        setIsImportConfirmOpen(true);
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

  // Removed unused importJsonFromPath helper

  // Clear selection when switching to graph mode to prevent freezes
  const handleTabChange = (value: string) => {
    
    if (value === 'graph') {
      
      // Clear Slate selection to prevent freezes
      if (editor.selection) {
        Transforms.deselect(editor);
      }
      
      setActiveSegmentIndex(null);
      setLastSelection(null);
      setBeforeSegs(null);
      setMarkedSegs(null);
      setAfterSegs(null);
      
    } else {
    }
    
    const next = value as 'presets' | 'editor' | 'graph' | 'raw';
    setActiveTab(next);
    try { window.localStorage.setItem('lastActiveTab', next); } catch {}
  };

  // Persist RAW edits to disk when editing a loaded file (Electron only)
  // Track whether the latest dialogueSource change originated from RAW editor input
  const isLocalRawEditRef = useRef<boolean>(false);
  const lastWrittenContentRef = useRef<string>("");
  const rawSaveTimerRef = useRef<number | null>(null);
  // Debounced live parse of RAW source so other tabs stay in sync
  const rawParseTimerRef = useRef<number | null>(null);
  useEffect(() => {
    // electron ipcRenderer available when running under Electron
    const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
    if (!ipcRenderer) return;
    if (!isLocalRawEditRef.current) return;
    const path = window.localStorage.getItem('lastDialogueFilePath');
    if (!path) return;
    if (dialogueSource === lastWrittenContentRef.current) { isLocalRawEditRef.current = false; return; }
    if (rawSaveTimerRef.current) { window.clearTimeout(rawSaveTimerRef.current); rawSaveTimerRef.current = null; }
    rawSaveTimerRef.current = window.setTimeout(async () => {
      try {
        await ipcRenderer.invoke('write-file', path, dialogueSource);
        lastWrittenContentRef.current = dialogueSource;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to write dialogue file:', e);
      } finally {
        isLocalRawEditRef.current = false;
      }
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogueSource]);

  // Live-update dialogueGraph when RAW source changes (debounced)
  useEffect(() => {
    if (rawParseTimerRef.current) {
      window.clearTimeout(rawParseTimerRef.current);
      rawParseTimerRef.current = null;
    }
    rawParseTimerRef.current = window.setTimeout(() => {
      try {
        const graph = parseDialogue(dialogueSource);
        setDialogueGraph(graph);
      } catch {
        // Ignore parse errors while typing; keep last valid graph
      }
    }, 200);
    return () => {
      if (rawParseTimerRef.current) {
        window.clearTimeout(rawParseTimerRef.current);
        rawParseTimerRef.current = null;
      }
    };
  }, [dialogueSource]);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Main content area */}
      <div style={{ flex: '1 1 auto', minWidth: 0, background: 'var(--gray-a2)', display: 'flex', flexDirection: 'column', padding: '16px', overflow: 'auto' }}>
        <Tabs.Root value={activeTab} onValueChange={handleTabChange} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Fixed header: tabs + toolbar, full-bleed to window edges */}
          <div ref={stickyHeaderRef} style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: '#18191B', paddingTop: 16, paddingBottom: 8, paddingLeft: 16, paddingRight: 16 }}>
            <Tabs.List style={{ background: '#18191B' }}>
              <Tabs.Trigger value="presets">Presets</Tabs.Trigger>
              <Tabs.Trigger value="editor">Editor</Tabs.Trigger>
              <Tabs.Trigger value="graph">Graph</Tabs.Trigger>
              <Tabs.Trigger value="raw">Raw</Tabs.Trigger>
            </Tabs.List>
            {/* Global toolbar: Dialogue import below tab picker (lighter background) */}
            <div
              role="toolbar"
              style={{
                backgroundColor: '#18191B',
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
                  pendingImportRef.current = { kind: 'browser', file };
                  setIsImportConfirmOpen(true);
                  if (dialogueFileInputRef.current) dialogueFileInputRef.current.value = '';
                }}
              />
              <Button variant="surface" size="2" onClick={handleOpenDialogueFile}>Import Dialogue (.txt)</Button>
              {/* Import confirmation dialog */}
              <AlertDialog.Root open={isImportConfirmOpen} onOpenChange={setIsImportConfirmOpen}>
                <AlertDialog.Content maxWidth="450px">
                  <AlertDialog.Title>Overwrite current edits?</AlertDialog.Title>
                  <AlertDialog.Description>
                    Importing will overwrite current edits and clear cached data. This cannot be undone.
                  </AlertDialog.Description>
                  <Flex gap="3" justify="end" mt="3">
                    <AlertDialog.Cancel>
                      <Button variant="outline">Cancel</Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action>
                      <Button
                        color="red"
                        onClick={async () => {
                          try {
                            try { window.localStorage.clear(); } catch {}
                            handleReset();
                            const pending = pendingImportRef.current;
                            if (!pending) return;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
                            if (pending.kind === 'electron' && ipcRenderer) {
                              const text: string = await ipcRenderer.invoke('read-file', pending.path);
                              const graph = parseDialogue(text);
                              setDialogueSource(text);
                              try { window.localStorage.setItem('lastDialogueFilePath', pending.path); } catch {}
                              handleImportDialogue(graph);
                              try { ipcRenderer.send('watch-file', pending.path); } catch {}
                            } else if (pending.kind === 'browser') {
                              const text = await pending.file.text();
                              const graph = parseDialogue(text);
                              setDialogueSource(text);
                              handleImportDialogue(graph);
                            }
                          } catch (err: any) {
                            alert('Failed to import dialogue: ' + (err?.message || String(err)));
                          } finally {
                            pendingImportRef.current = null;
                            setIsImportConfirmOpen(false);
                          }
                        }}
                      >
                        Import
                      </Button>
                    </AlertDialog.Action>
                  </Flex>
                </AlertDialog.Content>
              </AlertDialog.Root>
            </div>
          </div>
          {/* Separate gradient overlay below the fixed header, spanning full width */}
          <div
            aria-hidden
            style={{
              position: 'fixed',
              top: headerHeight,
              left: 0,
              right: 0,
              height: 16,
              background: 'linear-gradient(to bottom, rgba(24,25,27,1) 0%, rgba(24,25,27,0) 100%)',
              pointerEvents: 'none',
              zIndex: 99,
            }}
          />
          {/* Spacer to offset the fixed header height so content doesn't hide behind it */}
          <div aria-hidden style={{ height: headerHeight }} />
          
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
                <EnhancedConversationGraph graph={dialogueGraph} onSelectScene={loadSceneIntoEditor} />
              </Tabs.Content>
            )}

            {activeTab === 'raw' && (
              <Tabs.Content value="raw" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <RawTab
                  dialogueSource={dialogueSource}
                  onChange={(code) => {
                    isLocalRawEditRef.current = true;
                    setDialogueSource(code);
                  }}
                  rawLintErrors={rawLintErrors}
                  setRawLintErrors={setRawLintErrors}
                  onApplyToGraph={() => {
                    try {
                      const graph = parseDialogue(dialogueSource);
                      setDialogueGraph(graph);
                    } catch (err: any) {
                      alert('Failed to parse dialogue: ' + (err?.message || String(err)));
                    }
                  }}
                />
              </Tabs.Content>
            )}
          </Box>
        </Tabs.Root>
      </div>
    </div>
  );
};

export default App;
