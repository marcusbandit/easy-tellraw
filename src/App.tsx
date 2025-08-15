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
import { Flex, Tabs, Box, Button, Card, Text, AlertDialog, TextField } from "@radix-ui/themes";
import PresetsPanel from "./components/PresetsPanel";
import PresetButtonsPanel from "./components/PresetButtonsPanel";
import { Slate, withReact } from "slate-react";
import { withHistory } from "slate-history";
import { Transforms } from "slate";
import { flattenSlateFragmentToCharSegments, squashAdjacentSegments } from "./lib/segments";
import { DialogueGraph } from "./types/dialogue";
import { parseDialogue } from "./lib/dialogueParser";
import RawTab from "./components/tabs/RawTabCM";

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
  const [activeTab, setActiveTab] = useState<'presets' | 'editor' | 'graph' | 'raw' | 'import'>(() => {
    try {
      const stored = window.localStorage.getItem('lastActiveTab');
      if (stored === 'presets' || stored === 'editor' || stored === 'graph' || stored === 'raw' || stored === 'import') return stored as any;
    } catch {}
    return 'editor';
  });
  const [dialogueGraph, setDialogueGraph] = useState<DialogueGraph | null>(null);
  const [dialogueSource, setDialogueSource] = useState<string>("");
  const [rawLintErrors, setRawLintErrors] = useState<Array<{ line: number; message: string }>>([]);
  const dialogueFileInputRef = useRef<HTMLInputElement | null>(null);
  // Import (datapack folder) state
  const [datapackDirInput, setDatapackDirInput] = useState<string>(() => {
    try {
      const stored = window.localStorage.getItem('lastDatapackDir');
      return stored && stored.trim() !== '' ? stored : '';
    } catch {
      return '';
    }
  });
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [isLoadingFromDir, setIsLoadingFromDir] = useState<boolean>(false);
  // Easy-Tellraw files management
  const [tellrawFiles, setTellrawFiles] = useState<Array<{ name: string; fullName: string; path: string; isStyles: boolean }>>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  const [editingFileName, setEditingFileName] = useState<string | null>(null);
  // Combined content from all files
  const [combinedDialogueSource, setCombinedDialogueSource] = useState<string>("");
  // File monitoring state
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [lastFileChange, setLastFileChange] = useState<string>('');
  const [isRefreshingFiles, setIsRefreshingFiles] = useState<boolean>(false);
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

  // Cache the datapack directory path
  useEffect(() => {
    if (datapackDirInput && datapackDirInput.trim() !== '') {
      try { window.localStorage.setItem('lastDatapackDir', datapackDirInput); } catch {}
    }
  }, [datapackDirInput]);

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
          // Build click command from target
          let command: string | undefined;
          const tgt = choice.target || '';
          if (tgt.startsWith('@')) {
            const ref = tgt.slice(1);
            command = `function mcnodes:nodes/${ref}`;
          } else if (/^[a-z0-9_-]+:[A-Za-z0-9_./-]+$/.test(tgt)) {
            command = `function ${tgt}`;
          } else if (tgt.trim()) {
            // Fallback to raw target as command
            command = tgt;
          }
          const click_event = command ? { action: 'run_command', command } : undefined;
          children.push({ text: `[${label}]`, color: cColor, bold: cBold, italic: cItalic, underline: cUnderline, strikethrough: cStrike, ...(click_event ? { click_event } : {}) });
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
  const applyStylesFragmentToRaw = useCallback(async (stylesFragment: string) => {
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
    
    // Also save the styles fragment to Style.txt
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
      if (ipcRenderer && datapackDirInput) {
        // Find the Style.txt file
        const filesResult = await ipcRenderer.invoke('list-tellraw-files', datapackDirInput);
        if (filesResult?.ok) {
          const stylesFile = filesResult.files.find((f: { name: string; fullName: string; path: string; isStyles: boolean }) => f.isStyles);
          if (stylesFile) {
            // Save the styles fragment to Style.txt
            await ipcRenderer.invoke('write-file', stylesFile.path, stylesFragment);
            
            // Update the combined content to reflect the changes
            await updateCombinedContentAndCheckReferences();
          }
        }
      }
    } catch (err) {
      console.warn('Failed to save styles fragment to Style.txt:', err);
    }
  }, [datapackDirInput]);

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

  // Open directory picker (Electron only)
  const handleSelectDatapackDir = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
    if (!ipcRenderer) {
      alert('Folder selection is only available in the desktop app.');
      return;
    }
    const result = await ipcRenderer.invoke('open-directory-dialog', {});
    if (!result?.canceled && result.filePaths && result.filePaths[0]) {
      const selected = result.filePaths[0];
      setDatapackDirInput(selected);
      setImportWarning(null);
      setImportInfo(null);
      try { window.localStorage.clear(); } catch {}
      handleReset();
      await handleLoadFromDatapackDir(selected);
    }
  }, []);

  // Ensure/create Tellraw file under datapack and load it
  const handleLoadFromDatapackDir = useCallback(async (pathOverride?: string) => {
    const dir = (pathOverride ?? datapackDirInput)?.trim();
    if (!dir) return;
    setIsLoadingFromDir(true);
    setImportWarning(null);
    setImportInfo(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
    if (!ipcRenderer) {
      alert('Loading from a folder is only available in the desktop app.');
      setIsLoadingFromDir(false);
      return;
    }
    try {
      const ensure = await ipcRenderer.invoke('ensure-tellraw-file', dir);
      if (!ensure?.ok) {
        if (ensure?.code === 'NO_PACK_MCMETA') {
          setImportWarning('This folder does not contain a pack.mcmeta. Check if it\'s the correct datapack folder.');
        } else {
          setImportWarning(ensure?.message || 'Failed to validate datapack folder.');
        }
        return;
      }
      const filePath = ensure.filePath;
      const text = await ipcRenderer.invoke('read-file', filePath);
      const graph = parseDialogue(text);
      setDialogueSource(text);
      setDialogueGraph(graph);
      try { window.localStorage.setItem('lastDialogueFilePath', filePath); } catch {}
      try { ipcRenderer.send('watch-file', filePath); } catch {}
      setImportInfo(`${ensure.created ? 'Created' : 'Loaded'} ${filePath}`);
      
      // Update the last written content reference for autosave
      lastWrittenContentRef.current = text;
      
      // Load all files and merge their content
      await loadAllFilesFromDatapack(dir);
      
      // List all .txt files in the Easy-Tellraw folder
      const filesResult = await ipcRenderer.invoke('list-tellraw-files', dir);
      if (filesResult?.ok) {
        setTellrawFiles(filesResult.files);
        // Find the index of the main file we just loaded
        const mainIndex = filesResult.files.findIndex((f: { name: string; fullName: string; path: string; isStyles: boolean }) => f.path === filePath);
        setActiveFileIndex(mainIndex >= 0 ? mainIndex : 0);
      }
    } catch (err: any) {
      setImportWarning(String(err?.message || err));
    } finally {
      setIsLoadingFromDir(false);
    }
  }, [datapackDirInput]);

  // Load and merge all .txt files from the Easy-Tellraw folder
  const loadAllFilesFromDatapack = useCallback(async (datapackDir: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
    if (!ipcRenderer) return;
    
    try {
      const filesResult = await ipcRenderer.invoke('list-tellraw-files', datapackDir);
      if (!filesResult?.ok) return;
      
      setTellrawFiles(filesResult.files);
      
      // Load content from all files and merge them
      let combinedContent = '';
      let stylesContent = '';
      
      for (const file of filesResult.files) {
        try {
          const fileContent = await ipcRenderer.invoke('read-file', file.path);
          
          if (file.isStyles) {
            // Style.txt content goes at the top, but deduplicate it first
            const lines = fileContent.split('\n');
            const seenStyles = new Set<string>();
            const deduplicatedStyles: string[] = [];
            
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine) continue;
              
              // Extract the style identifier
              const styleMatch = trimmedLine.match(/^(style\.[^\s]+|character\.[^\s]+|button\.[^\s]+)/);
              if (styleMatch) {
                const styleId = styleMatch[1];
                if (!seenStyles.has(styleId)) {
                  seenStyles.add(styleId);
                  deduplicatedStyles.push(trimmedLine);
                }
                // Skip duplicate style definitions
              } else {
                // Non-style lines are always included
                deduplicatedStyles.push(trimmedLine);
              }
            }
            
            stylesContent = deduplicatedStyles.join('\n');
            // Add to combined content for processing
            if (combinedContent) combinedContent += '\n\n';
            combinedContent += `@styles\n${stylesContent}\n@endstyles`;
          } else {
            // Other files get appended to combined content for processing
            if (combinedContent) combinedContent += '\n\n';
            combinedContent += fileContent;
          }
        } catch (err) {
          console.warn(`Failed to load file ${file.name}:`, err);
        }
      }
      
      // Extract any @styles sections from other files and move to Style.txt
      const stylesMatch = combinedContent.match(/@styles\s*([\s\S]*?)\s*@endstyles/gi);
      let formattedStylesContent = '';
      
      if (stylesMatch) {
        // Track seen styles to avoid duplicates
        const seenStyles = new Set<string>();
        const styleCategories = {
          style: [] as string[],
          character: [] as string[],
          button: [] as string[]
        };
        
        for (const match of stylesMatch) {
          const content = match.replace(/@styles\s*/i, '').replace(/\s*@endstyles\s*/i, '');
          if (content.trim()) {
            // Process each line to remove duplicates
            const lines = content.split('\n');
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine) continue;
              
              // Extract the style identifier (e.g., "style.normal", "character.Jordan", "button.primary")
              const styleMatch = trimmedLine.match(/^(style\.[^\s]+|character\.[^\s]+|button\.[^\s]+)/);
              if (styleMatch) {
                const styleId = styleMatch[1];
                if (!seenStyles.has(styleId)) {
                  seenStyles.add(styleId);
                  
                  // Categorize the style
                  if (styleId.startsWith('style.')) {
                    styleCategories.style.push(trimmedLine);
                  } else if (styleId.startsWith('character.')) {
                    styleCategories.character.push(trimmedLine);
                  } else if (styleId.startsWith('button.')) {
                    styleCategories.button.push(trimmedLine);
                  }
                }
                // Skip duplicate style definitions
              } else {
                // Non-style lines (like comments or other content) are always included
                // We'll add these at the end
              }
            }
          }
        }
        
        // Remove @styles sections from combined content
        combinedContent = combinedContent.replace(/@styles\s*[\s\S]*?\s*@endstyles\s*/gi, '').trim();
        
        // Sort each category and create formatted styles content
        const sortedStyles: string[] = [];
        
        // Add style.* definitions first
        if (styleCategories.style.length > 0) {
          sortedStyles.push(...styleCategories.style.sort());
        }
        
        // Add spacing and character.* definitions
        if (styleCategories.character.length > 0) {
          if (sortedStyles.length > 0) sortedStyles.push('');
          sortedStyles.push(...styleCategories.character.sort());
        }
        
        // Add spacing and button.* definitions
        if (styleCategories.button.length > 0) {
          if (sortedStyles.length > 0) sortedStyles.push('');
          sortedStyles.push(...styleCategories.button.sort());
        }
        
        // Create the final formatted styles content
        formattedStylesContent = sortedStyles.join('\n');
      }
      
      // Update Style.txt with deduplicated content
      const stylesFile = filesResult.files.find((f: { name: string; fullName: string; path: string; isStyles: boolean }) => f.isStyles);
      if (stylesFile && formattedStylesContent.trim()) {
        try {
          // Combine existing Style.txt content with new deduplicated styles
          let finalStylesContent = stylesContent;
          
          // Create a set of existing style IDs to avoid duplicates
          const existingStyleIds = new Set<string>();
          const existingLines = stylesContent.split('\n');
          
          for (const line of existingLines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            const styleMatch = trimmedLine.match(/^(style\.[^\s]+|character\.[^\s]+|button\.[^\s]+)/);
            if (styleMatch) {
              existingStyleIds.add(styleMatch[1]);
            }
          }
          
          // Add new styles that don't already exist
          const newStylesLines = formattedStylesContent.split('\n');
          for (const line of newStylesLines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            const styleMatch = trimmedLine.match(/^(style\.[^\s]+|character\.[^\s]+|button\.[^\s]+)/);
            if (styleMatch) {
              const styleId = styleMatch[1];
              if (!existingStyleIds.has(styleId)) {
                existingStyleIds.add(styleId);
                if (finalStylesContent && !finalStylesContent.endsWith('\n')) {
                  finalStylesContent += '\n';
                }
                finalStylesContent += trimmedLine;
              }
              // Skip duplicate style definitions
            } else {
              // Non-style lines are always included
              if (finalStylesContent && !finalStylesContent.endsWith('\n')) {
                finalStylesContent += '\n';
              }
              finalStylesContent += trimmedLine;
            }
          }
          
          await ipcRenderer.invoke('write-file', stylesFile.path, finalStylesContent);
          stylesContent = finalStylesContent;
        } catch (err) {
          console.warn('Failed to update Style.txt:', err);
        }
      }
      
      // Create the final combined content for processing (graph editor, etc.)
      const finalContent = formattedStylesContent ? `@styles\n${formattedStylesContent}\n@endstyles\n\n${combinedContent}` : combinedContent;
      
      // Set the combined content for the program to use
      setCombinedDialogueSource(finalContent);
      
      // Set the active file content for the current tab
      const mainFile = filesResult.files.find((f: { name: string; fullName: string; path: string; isStyles: boolean }) => !f.isStyles);
      if (mainFile) {
        const mainContent = await ipcRenderer.invoke('read-file', mainFile.path);
        setDialogueSource(mainContent);
        setActiveFileIndex(filesResult.files.findIndex((f: { name: string; fullName: string; path: string; isStyles: boolean }) => f.fullName === mainFile.fullName));
      }
      
      // Parse the combined content for the graph editor and check references
      try {
        const parsedGraph = parseDialogue(finalContent);
        setDialogueGraph(parsedGraph);
        checkReferencesInCombinedContent(finalContent);
      } catch (err) {
        console.warn('Failed to parse combined dialogue:', err);
      }
      
      lastWrittenContentRef.current = finalContent;
      
    } catch (err: any) {
      console.error('Failed to load all files:', err);
    }
  }, []);

  // Comprehensive function to clean and format Style.txt
  const cleanupAndFormatStylesFile = async (stylesFilePath: string) => {
    try {
      const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
      if (!ipcRenderer) return;
      
      const currentContent = await ipcRenderer.invoke('read-file', stylesFilePath);
      
      // Find the @styles and @endstyles markers
      const stylesStart = currentContent.indexOf('@styles');
      const stylesEnd = currentContent.indexOf('@endstyles');
      
      if (stylesStart === -1 || stylesEnd === -1) {
        // No valid styles block, create one
        const newContent = '@styles\n@endstyles';
        await ipcRenderer.invoke('write-file', stylesFilePath, newContent);
        return;
      }
      
      // Extract only the content between @styles and @endstyles
      let stylesContent = currentContent.substring(stylesStart + '@styles'.length, stylesEnd).trim();
      
      // Also check for any styles that might be outside the block (like character.Johnny)
      const lines = currentContent.split('\n');
      const orphanedStyles: string[] = [];
      
      // Get existing styles to avoid duplicates
      const existingStyles = new Set(stylesContent.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0));
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length > 0 && 
            (line.startsWith('style.') || line.startsWith('character.') || line.startsWith('button.')) &&
            !line.includes('@styles') && !line.includes('@endstyles')) {
          // Only add if it's not already in the main styles content
          if (!existingStyles.has(line)) {
            orphanedStyles.push(line);
          }
        }
      }
      
      // Add orphaned styles to the main styles content
      if (orphanedStyles.length > 0) {
        stylesContent = stylesContent + '\n' + orphanedStyles.join('\n');
        console.log('Found and rescued orphaned styles:', orphanedStyles);
      }
      
      // Clean up the styles content - remove empty lines and normalize spacing
      const cleanedStyles = stylesContent
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0)
        .join('\n');
      
      // Create properly formatted content
      const formattedContent = `@styles\n${cleanedStyles}\n@endstyles`;
      
      // Write the cleaned and formatted content back
      await ipcRenderer.invoke('write-file', stylesFilePath, formattedContent);
      
      console.log('Styles.txt cleaned and formatted');
    } catch (err) {
      console.warn('Failed to cleanup Style.txt:', err);
    }
  };

  // Switch to a different .txt file in the Easy-Tellraw folder
  const handleSwitchFile = async (fileIndex: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
    if (!ipcRenderer) return;
    
    try {
      const file = tellrawFiles[fileIndex];
      const fileContent = await ipcRenderer.invoke('read-file', file.path);
      
      // ALWAYS clean and format Style.txt when switching tabs
      try {
        const stylesFile = tellrawFiles.find(f => f.isStyles);
        if (stylesFile) {
          await cleanupAndFormatStylesFile(stylesFile.path);
        }
      } catch (styleErr) {
        console.warn('Failed to cleanup Style.txt:', styleErr);
      }
      
      // Check if this file contains styles that need to be moved
      if (!file.isStyles) {
        const stylesMatch = fileContent.match(/@styles\s*([\s\S]*?)\s*@endstyles/gi);
        if (stylesMatch && stylesMatch.length > 0) {
          // Extract styles from this file
          const stylesToMove = stylesMatch.map((match: string) => 
            match.replace(/@styles\s*/i, '').replace(/\s*@endstyles\s*/i, '').trim()
          ).join('\n');
          
          // Remove @styles sections from the file content
          const cleanedContent = fileContent.replace(/@styles\s*[\s\S]*?\s*@endstyles\s*/gi, '').trim();
          
          // Move styles to Style.txt
          try {
            const stylesFile = tellrawFiles.find(f => f.isStyles);
            if (stylesFile) {
              const currentStylesContent = await ipcRenderer.invoke('read-file', stylesFile.path);
              
              // Clean up Style.txt - remove any content below @endstyles
              let cleanStylesContent = currentStylesContent;
              const endStylesIndex = currentStylesContent.indexOf('@endstyles');
              if (endStylesIndex !== -1) {
                cleanStylesContent = currentStylesContent.substring(0, endStylesIndex + '@endstyles'.length);
              }
              
              const updatedStylesContent = cleanStylesContent ? `${cleanStylesContent}\n${stylesToMove}` : stylesToMove;
              await ipcRenderer.invoke('write-file', stylesFile.path, updatedStylesContent);
              
              // Update the file content to remove styles
              await ipcRenderer.invoke('write-file', file.path, cleanedContent);
              
              // Update the combined content to reflect the changes
              await updateCombinedContentAndCheckReferences();
              
              console.log(`Moved styles from ${file.name} to Style.txt`);
            }
          } catch (styleErr) {
            console.warn(`Failed to move styles from ${file.name}:`, styleErr);
          }
          
          // Use the cleaned content for display
          setDialogueSource(cleanedContent);
        } else {
          // No styles to move, use original content
          setDialogueSource(fileContent);
        }
      } else {
        // This is Style.txt, use content as-is
        setDialogueSource(fileContent);
      }
      
      setActiveFileIndex(fileIndex);
      
      // Update the last written content ref for this specific file
      lastWrittenContentRef.current = fileContent;
      
      // Note: We don't update dialogueGraph here because it should use the combined content
      // The graph editor will work with the combined content from all files
    } catch (err) {
      console.warn(`Failed to switch to file ${tellrawFiles[fileIndex].name}:`, err);
    }
  };

  // Rename a file in the Easy-Tellraw folder
  const handleRenameFile = useCallback(async (oldPath: string, newName: string) => {
    if (!newName.trim() || !newName.endsWith('.txt')) return;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
    if (!ipcRenderer) return;
    
    try {
      const result = await ipcRenderer.invoke('rename-tellraw-file', oldPath, newName);
      if (result?.ok) {
        // Update the files list and reload
        const filesResult = await ipcRenderer.invoke('list-tellraw-files', datapackDirInput);
        if (filesResult?.ok) {
          setTellrawFiles(filesResult.files);
          // Find the renamed file and switch to it
          const newIndex = filesResult.files.findIndex((f: { name: string; fullName: string; path: string; isStyles: boolean }) => f.path === result.newPath);
          if (newIndex >= 0) {
            setActiveFileIndex(newIndex);
            await handleSwitchFile(newIndex);
          }
        }
      } else if (result?.message) {
        alert(result.message);
      }
    } catch (err: any) {
      alert('Failed to rename file: ' + String(err?.message || err));
    }
    setEditingFileName(null);
  }, [datapackDirInput, tellrawFiles, handleSwitchFile]);

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
    
    const next = value as 'presets' | 'editor' | 'graph' | 'raw' | 'import';
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
    
    // Get the current active file path from tellrawFiles
    const currentFile = tellrawFiles[activeFileIndex];
    if (!currentFile?.path) return;
    
    if (dialogueSource === lastWrittenContentRef.current) { isLocalRawEditRef.current = false; return; }
    if (rawSaveTimerRef.current) { window.clearTimeout(rawSaveTimerRef.current); rawSaveTimerRef.current = null; }
    rawSaveTimerRef.current = window.setTimeout(async () => {
      try {
        await ipcRenderer.invoke('write-file', currentFile.path, dialogueSource);
        lastWrittenContentRef.current = dialogueSource;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to write dialogue file:', e);
      } finally {
        isLocalRawEditRef.current = false;
      }
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogueSource, tellrawFiles, activeFileIndex]);

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

  // Background reference checking using combined content
  const [referenceErrors, setReferenceErrors] = useState<string[]>([]);
  
  // Function to check references in combined content
  const checkReferencesInCombinedContent = useCallback((content: string) => {
    const errors: string[] = [];
    
    // Extract all style definitions from the content
    const styleDefinitions = new Set<string>();
    const stylesMatch = content.match(/@styles\s*([\s\S]*?)\s*@endstyles/gi);
    if (stylesMatch) {
      for (const match of stylesMatch) {
        const stylesContent = match.replace(/@styles\s*/i, '').replace(/\s*@endstyles\s*/i, '');
        const lines = stylesContent.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine && !trimmedLine.startsWith('#')) {
            const styleMatch = trimmedLine.match(/^(style\.[^\s]+|character\.[^\s]+|button\.[^\s]+)/);
            if (styleMatch) {
              styleDefinitions.add(styleMatch[1]);
            }
          }
        }
      }
    }
    
    // Check for unknown references in the content
    const referenceMatches = content.match(/\{([^}]+)\}/g);
    if (referenceMatches) {
      for (const match of referenceMatches) {
        const reference = match.slice(1, -1); // Remove { and }
        if (!styleDefinitions.has(reference)) {
          errors.push(`Warning: unknown character reference '${reference}'.`);
        }
      }
    }
    
    setReferenceErrors(errors);
  }, []);

  // Update graph when combined content changes (for graph editor, presets, etc.)
  useEffect(() => {
    if (combinedDialogueSource) {
      try {
        const graph = parseDialogue(combinedDialogueSource);
        setDialogueGraph(graph);
        // Check references whenever combined content changes
        checkReferencesInCombinedContent(combinedDialogueSource);
      } catch (err) {
        console.warn('Failed to parse combined dialogue:', err);
      }
    }
  }, [combinedDialogueSource, checkReferencesInCombinedContent]);
  
  // Update combined content and check references whenever files change
  const updateCombinedContentAndCheckReferences = useCallback(async () => {
    if (!datapackDirInput) return;
    
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
      if (!ipcRenderer) return;
      
      const filesResult = await ipcRenderer.invoke('list-tellraw-files', datapackDirInput);
      if (!filesResult?.ok) return;
      
      let combinedContent = '';
      let allStylesContent = '';
      
      for (const file of filesResult.files) {
        try {
          const fileContent = await ipcRenderer.invoke('read-file', file.path);
          
          if (file.isStyles) {
            // Collect styles content separately, don't add to combinedContent yet
            if (allStylesContent) allStylesContent += '\n\n';
            allStylesContent += fileContent;
          } else {
            if (combinedContent) combinedContent += '\n\n';
            combinedContent += fileContent;
          }
        } catch (err) {
          console.warn(`Failed to load file ${file.name}:`, err);
        }
      }
      
      // Process styles content separately
      if (allStylesContent) {
        const stylesMatch = allStylesContent.match(/@styles\s*([\s\S]*?)\s*@endstyles/gi);
        if (stylesMatch) {
          const seenStyles = new Set<string>();
          const styleCategories = {
            style: [] as string[],
            character: [] as string[],
            button: [] as string[]
          };
          
          for (const match of stylesMatch) {
            const content = match.replace(/@styles\s*/i, '').replace(/\s*@endstyles\s*/i, '');
            if (content.trim()) {
              const lines = content.split('\n');
              for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;
                
                const styleMatch = trimmedLine.match(/^(style\.[^\s]+|character\.[^\s]+|button\.[^\s]+)/);
                if (styleMatch) {
                  const styleId = styleMatch[1];
                  if (!seenStyles.has(styleId)) {
                    seenStyles.add(styleId);
                    
                    // Categorize the style
                    if (styleId.startsWith('style.')) {
                      styleCategories.style.push(trimmedLine);
                    } else if (styleId.startsWith('character.')) {
                      styleCategories.character.push(trimmedLine);
                    } else if (styleId.startsWith('button.')) {
                      styleCategories.button.push(trimmedLine);
                    }
                  }
                }
              }
            }
          }
          
          // Sort each category and create formatted styles content
          const sortedStyles: string[] = [];
          
          // Add style.* definitions first
          if (styleCategories.style.length > 0) {
            sortedStyles.push(...styleCategories.style.sort());
          }
          
          // Add spacing and character.* definitions
          if (styleCategories.character.length > 0) {
            if (sortedStyles.length > 0) sortedStyles.push('');
            sortedStyles.push(...styleCategories.character.sort());
          }
          
          // Add spacing and button.* definitions
          if (styleCategories.button.length > 0) {
            if (sortedStyles.length > 0) sortedStyles.push('');
            sortedStyles.push(...styleCategories.button.sort());
          }
          
          // Create the final formatted styles content
          const formattedStylesContent = sortedStyles.join('\n');
          const finalContent = `@styles\n${formattedStylesContent}\n@endstyles\n\n${combinedContent}`;
          
          // Update the combined content
          setCombinedDialogueSource(finalContent);
          
          // Check references in the combined content
          checkReferencesInCombinedContent(finalContent);
          
          // Parse the combined content for the graph editor
          try {
            const graph = parseDialogue(finalContent);
            setDialogueGraph(graph);
          } catch (err) {
            console.warn('Failed to parse combined dialogue:', err);
          }
          
          return finalContent;
        } else {
          // No styles found, just use the combined content
          setCombinedDialogueSource(combinedContent);
          checkReferencesInCombinedContent(combinedContent);
          try {
            const graph = parseDialogue(combinedContent);
            setDialogueGraph(graph);
          } catch (err) {
            console.warn('Failed to parse combined dialogue:', err);
          }
          
          return combinedContent;
        }
      } else {
        // No styles files, just use the combined content
        setCombinedDialogueSource(combinedContent);
        checkReferencesInCombinedContent(combinedContent);
        try {
          const graph = parseDialogue(combinedContent);
          setDialogueGraph(graph);
        } catch (err) {
          console.warn('Failed to parse combined dialogue:', err);
        }
        
        return combinedContent;
      }
    } catch (err) {
      console.warn('Failed to update combined content:', err);
      return null;
    }
  }, [datapackDirInput, checkReferencesInCombinedContent]);

  // Function to serialize styles object to raw text format for Style.txt
  const serializeStylesToRaw = useCallback((styles: any): string => {
    const lines: string[] = [];
    
    // Named styles first (stable order)
    if (styles?.styles) {
      Object.entries(styles.styles).sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, st]: any) => {
        const parts: string[] = [`style.${k}`];
        if (st?.color) parts.push(`color=${st.color}`);
        if (st?.bold) parts.push(`bold=true`);
        if (st?.italic) parts.push(`italic=true`);
        if (st?.underline) parts.push(`underline=true`);
        if (st?.strikethrough) parts.push(`strikethrough=true`);
        lines.push(parts.join(' '));
      });
      if (Object.keys(styles.styles).length > 0) lines.push('');
    }
    
    // Character styles
    if (styles?.speakers) {
      Object.entries(styles.speakers).sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, style]: any) => {
        const nameStyle = style?.name || {};
        const textStyle = style?.text || {};
        const parts: string[] = [`character.${name}`];
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
      if (Object.keys(styles.speakers).length > 0) lines.push('');
    }
    
    // Button presets
    if (styles?.buttons) {
      Object.entries(styles.buttons).forEach(([id, st]: any) => {
        const label = st?.label || id;
        const parts: string[] = [`button.${label}`];
        if (st?.color) parts.push(`color=${st.color}`);
        if (st?.bold) parts.push(`bold=true`);
        if (st?.italic) parts.push(`italic=true`);
        if (st?.underline) parts.push(`underline=true`);
        if (st?.strikethrough) parts.push(`strikethrough=true`);
        lines.push(parts.join(' '));
      });
    }
    
    return lines.join('\n');
  }, []);

  // Automatically update combined content when datapack directory changes
  useEffect(() => {
    if (datapackDirInput) {
      updateCombinedContentAndCheckReferences();
      
      // Start watching the directory for file changes
      const startWatching = async () => {
        try {
          const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
          if (ipcRenderer) {
            const result = await ipcRenderer.invoke('watch-directory', datapackDirInput);
            if (result?.ok) {
              setIsMonitoring(true);
              console.log('Directory watching started successfully');
            } else {
              console.warn('Failed to start directory watching:', result?.message);
              setIsMonitoring(false);
            }
          }
        } catch (err) {
          console.warn('Failed to start directory watching:', err);
          setIsMonitoring(false);
        }
      };
      
      startWatching();
      
      // Cleanup: stop watching when component unmounts or directory changes
      return () => {
        const stopWatching = async () => {
          try {
            const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
            if (ipcRenderer) {
              await ipcRenderer.invoke('unwatch-directory', datapackDirInput);
              setIsMonitoring(false);
            }
          } catch (err) {
            console.warn('Failed to stop directory watching:', err);
            setIsMonitoring(false);
          }
        };
        stopWatching();
      };
    }
  }, [datapackDirInput, updateCombinedContentAndCheckReferences]);

  // Listen for file change events from the main process
  useEffect(() => {
    const handleFileChange = async (event: any, data: any) => {
      console.log('File change detected:', data);
      
      if (data.datapackDir === datapackDirInput) {
        // Update monitoring state
        const changeTime = new Date().toLocaleTimeString();
        setLastFileChange(changeTime);
        
        // Show notification about the change
        let changeMessage = '';
        if (data.eventType === 'rename') {
          changeMessage = `File ${data.filename} was ${tellrawFiles.some(f => f.fullName === data.filename) ? 'added' : 'removed'} at ${changeTime}`;
        } else if (data.eventType === 'change') {
          changeMessage = `File ${data.filename} was modified at ${changeTime}`;
        }
        
        if (changeMessage) {
          setImportInfo(changeMessage);
          // Clear the message after 5 seconds
          setTimeout(() => setImportInfo(null), 5000);
        }
        
        // Show refreshing state
        setIsRefreshingFiles(true);
        
        // Refresh the file list and combined content
        await updateCombinedContentAndCheckReferences();
        
        // Hide refreshing state
        setIsRefreshingFiles(false);
        
        // If a file was deleted and it was the active file, switch to the first available file
        if (data.eventType === 'rename' && tellrawFiles.length > 0) {
          const deletedFile = tellrawFiles.find(f => f.fullName === data.filename);
          if (deletedFile && tellrawFiles.indexOf(deletedFile) === activeFileIndex) {
            if (tellrawFiles.length > 1) {
              // Switch to the first available file
              setActiveFileIndex(0);
            } else {
              // No files left, clear the editor
              setDialogueSource('');
              setActiveFileIndex(-1);
            }
          }
        }
      }
    };

    // Add event listener for file changes
    const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
    if (ipcRenderer) {
      ipcRenderer.on('file-changed', handleFileChange);
      
      // Cleanup event listener
      return () => {
        ipcRenderer.removeAllListeners('file-changed');
      };
    }
  }, [datapackDirInput, tellrawFiles, activeFileIndex, updateCombinedContentAndCheckReferences]);

  // RAW autosave
  useEffect(() => {
    if (activeTab !== 'raw') return;
    
    const timeoutId = setTimeout(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
        if (!ipcRenderer) return;
        
        const currentFile = tellrawFiles[activeFileIndex];
        if (!currentFile) return;
        
        const path = currentFile.path;
        if (!path) return;
        
        // Save the individual file content
        await ipcRenderer.invoke('write-file', path, dialogueSource);
        
        // Update the last written content reference
        lastWrittenContentRef.current = dialogueSource;
        
        // Update the combined content to reflect the changes
        // This ensures the graph editor stays in sync
        await updateCombinedContentAndCheckReferences();
      } catch (err) {
        console.warn('Failed to save file:', err);
      }
    }, 1000);
    
    return () => clearTimeout(timeoutId);
  }, [dialogueSource, tellrawFiles, activeFileIndex]);

    // For now, we'll use a simplified approach where all lint errors are shown as general errors
  // In the future, we can implement more sophisticated file mapping
  useEffect(() => {
    if (combinedDialogueSource) {
      // Set empty errors for now - we'll implement proper mapping later
      setRawLintErrors([]);
    }
  }, [combinedDialogueSource]);

  // Handle file input change (browser fallback)
  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      pendingImportRef.current = { kind: 'browser', file };
      setIsImportConfirmOpen(true);
    }
  }, []);

  // Handle import confirmation
  const handleImportConfirm = useCallback(async () => {
    if (!pendingImportRef.current) return;
    
    try {
      if (pendingImportRef.current.kind === 'electron') {
        // Electron: read file from path
        const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
        if (ipcRenderer) {
          const content = await ipcRenderer.invoke('read-file', pendingImportRef.current.path);
          const fileName = pendingImportRef.current.path.split(/[/\\]/).pop() || 'unknown.txt';
          await handleImportFile(content, fileName);
        }
      } else {
        // Browser: read file content
        const file = pendingImportRef.current.file;
        const content = await file.text();
        await handleImportFile(content, file.name);
      }
    } catch (err) {
      console.error('Failed to import file:', err);
      alert('Failed to import file: ' + String(err));
    } finally {
      setIsImportConfirmOpen(false);
      pendingImportRef.current = null;
    }
  }, []);

  // Extract styles content from combined source
  const getStylesContent = useCallback(() => {
    if (combinedDialogueSource) {
      const stylesMatch = combinedDialogueSource.match(/@styles\s*([\s\S]*?)\s*@endstyles/i);
      if (stylesMatch) return stylesMatch[1].trim();
    }
    return '';
  }, [combinedDialogueSource]);

  // Handle importing a file (adds it to tellrawFiles and updates combined content)
  const handleImportFile = useCallback(async (content: string, fileName: string) => {
    // Add the file to tellrawFiles
    const newFile = {
      name: fileName.replace('.txt', ''),
      fullName: fileName,
      path: `/imported/${fileName}`, // Virtual path for imported files
      isStyles: fileName === 'Style.txt'
    };
    
    setTellrawFiles(prev => {
      const newFiles = [...prev, newFile];
      
      // Update combined content
      let cleanedContent = content; // Declare outside the if/else blocks
      
      if (newFile.isStyles) {
        // For styles, let updateCombinedContentAndCheckReferences handle the merging
        // Don't manually build combined content here
        // Update combined content after styles are added
        if (datapackDirInput) {
          updateCombinedContentAndCheckReferences();
        }
      } else {
        // For dialogue files, extract and move styles to Style.txt, then append cleaned content
        let stylesToMove = '';
        
        // Extract @styles sections from the imported file
        const stylesMatch = content.match(/@styles\s*([\s\S]*?)\s*@endstyles/gi);
        if (stylesMatch) {
          // Collect all styles content
          stylesToMove = stylesMatch.map(match => 
            match.replace(/@styles\s*/i, '').replace(/\s*@endstyles\s*/i, '').trim()
          ).join('\n');
          
          // Remove @styles sections from the imported content
          cleanedContent = content.replace(/@styles\s*[\s\S]*?\s*@endstyles\s*/gi, '').trim();
        }
        
        // If we found styles, move them to Style.txt
        if (stylesToMove) {
          // Move styles to Style.txt file
          try {
            const stylesFile = tellrawFiles.find(f => f.isStyles);
            if (stylesFile) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
              if (ipcRenderer) {
                // Use Promise to handle async operations
                ipcRenderer.invoke('read-file', stylesFile.path).then((currentStylesContent: string) => {
                  // Clean up Style.txt - remove any content below @endstyles
                  let cleanStylesContent = currentStylesContent;
                  const endStylesIndex = currentStylesContent.indexOf('@endstyles');
                  if (endStylesIndex !== -1) {
                    cleanStylesContent = currentStylesContent.substring(0, endStylesIndex + '@endstyles'.length);
                  }
                  
                  const updatedStylesContent = cleanStylesContent ? `${cleanStylesContent}\n${stylesToMove}` : stylesToMove;
                  return ipcRenderer.invoke('write-file', stylesFile.path, updatedStylesContent);
                }).then(() => {
                  setImportInfo(`Imported ${fileName} and moved styles to Style.txt`);
                  
                  // Update combined content after styles are moved
                  if (datapackDirInput) {
                    updateCombinedContentAndCheckReferences();
                  }
                }).catch((styleErr: any) => {
                  console.warn(`Failed to move styles to Style.txt:`, styleErr);
                });
              }
            }
          } catch (styleErr) {
            console.warn(`Failed to move styles to Style.txt:`, styleErr);
          }
        }
      }
      
      // Set as active file
      setActiveFileIndex(newFiles.length - 1);
      setDialogueSource(cleanedContent);
      
      return newFiles;
    });
  }, [combinedDialogueSource]);

  const contentOverflow = activeTab === 'raw' ? 'hidden' : 'auto';

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Main content area */}
      <div style={{ flex: '1 1 auto', minWidth: 0, minHeight: 0, background: 'var(--gray-a2)', display: 'flex', flexDirection: 'column', padding: '16px', overflow: contentOverflow }}>
        <Tabs.Root value={activeTab} onValueChange={handleTabChange} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Fixed header: tabs + toolbar, full-bleed to window edges */}
          <div ref={stickyHeaderRef} style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: '#18191B', paddingTop: 16, paddingBottom: 8, paddingLeft: 16, paddingRight: 16 }}>
            <Tabs.List style={{ background: '#18191B' }}>
              <Tabs.Trigger value="presets" style={{ fontSize: 'var(--mc-tab-font-size)' }}>Presets</Tabs.Trigger>
              <Tabs.Trigger value="editor" style={{ fontSize: 'var(--mc-tab-font-size)' }}>Editor</Tabs.Trigger>
              <Tabs.Trigger value="graph" style={{ fontSize: 'var(--mc-tab-font-size)' }}>Graph</Tabs.Trigger>
              <Tabs.Trigger value="raw" style={{ fontSize: 'var(--mc-tab-font-size)' }}>Raw</Tabs.Trigger>
              <Tabs.Trigger value="import" style={{ fontSize: 'var(--mc-tab-font-size)', marginLeft: 'auto' }}>Import</Tabs.Trigger>
            </Tabs.List>
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
          
          <Box pt="3" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'presets' && (
              <Tabs.Content value="presets" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <PresetsPanel
                  onUseCommand={(cmd) => importJson(cmd)}
                  graph={dialogueGraph}
                  onUpdateStyles={async (styles) => {
                    setDialogueGraph(g => g ? { ...g, styles } : { styles, scenes: {} } as any);
                    
                    // Automatically save style changes to Style.txt
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const ipcRenderer: any = (window as any)?.require?.('electron')?.ipcRenderer;
                      if (ipcRenderer && datapackDirInput) {
                        // Find the Style.txt file
                        const filesResult = await ipcRenderer.invoke('list-tellraw-files', datapackDirInput);
                        if (filesResult?.ok) {
                          const stylesFile = filesResult.files.find((f: { name: string; fullName: string; path: string; isStyles: boolean }) => f.isStyles);
                          if (stylesFile) {
                            // Serialize the new styles to the format expected by Style.txt
                            const serializedStyles = serializeStylesToRaw(styles);
                            await ipcRenderer.invoke('write-file', stylesFile.path, serializedStyles);
                            
                            // Update the combined content to reflect the changes
                            await updateCombinedContentAndCheckReferences();
                          }
                        }
                      }
                    } catch (err) {
                      console.warn('Failed to save styles to Style.txt:', err);
                    }
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
                                    padding: '0 0',
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
                      <div style={{ width: 320, minWidth: 300, maxWidth: 380, display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto' }}>
                        <PresetButtonsPanel
                          onUseCommand={(cmd) => importJson(cmd)}
                          target={target}
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
              <Tabs.Content value="raw" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0, maxHeight: '100%', overflow: 'hidden' }}>

                <RawTab
                  dialogueSource={dialogueSource}
                  combinedDialogueSource={combinedDialogueSource}
                  tellrawFiles={tellrawFiles}
                  activeFileIndex={activeFileIndex}
                  onChange={(code) => {
                    isLocalRawEditRef.current = true;
                    setDialogueSource(code);
                  }}
                  onSwitchFile={handleSwitchFile}
                  rawLintErrors={rawLintErrors}
                  setRawLintErrors={setRawLintErrors}
                  stylesContent={getStylesContent()}
                />
              </Tabs.Content>
            )}

            {activeTab === 'import' && (
              <Tabs.Content value="import" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Card size="2" variant="surface">
                  <Flex direction="column" gap="3">
                    <Text size="3">Select datapack folder</Text>
                    <Flex align="center" gap="2">
                      <TextField.Root
                        style={{ flex: 1 }}
                        placeholder="/path/to/datapacks/yourpack"
                        value={datapackDirInput}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDatapackDirInput(e.target.value)}
                      />
                      <Button variant="surface" size="2" onClick={handleSelectDatapackDir}>Select Folder</Button>
                    </Flex>
                    <Flex gap="2" justify="end">
                      <Button
                        size="2"
                        variant="solid"
                        disabled={!datapackDirInput || isLoadingFromDir}
                        onClick={async () => {
                          // Clear state and confirm destructive load
                          try { window.localStorage.clear(); } catch {}
                          handleReset();
                          await handleLoadFromDatapackDir();
                        }}
                      >
                        {isLoadingFromDir ? 'Loading…' : 'Load'}
                      </Button>
                    </Flex>
                    
                    {/* File monitoring status */}
                    {datapackDirInput && (
                      <Card size="1" variant="surface" style={{ marginTop: '8px' }}>
                        <Flex direction="column" gap="2">
                          <Flex align="center" gap="2">
                            <div style={{ 
                              width: '8px', 
                              height: '8px', 
                              borderRadius: '50%', 
                              backgroundColor: isMonitoring ? '#22c55e' : '#ef4444' 
                            }} />
                            <Text size="2" color="gray">
                              {isMonitoring ? 'Monitoring files for changes' : 'Not monitoring'}
                            </Text>
                            {isRefreshingFiles && (
                              <Text size="1" color="blue">
                                Refreshing...
                              </Text>
                            )}
                            <Button
                              size="1"
                              variant="surface"
                              onClick={updateCombinedContentAndCheckReferences}
                              disabled={isRefreshingFiles}
                              style={{ marginLeft: 'auto' }}
                            >
                              <svg 
                                width="16" 
                                height="16" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="currentColor" 
                                strokeWidth="2" 
                                strokeLinecap="round" 
                                strokeLinejoin="round"
                                style={{
                                  transform: isRefreshingFiles ? 'rotate(360deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.5s ease-in-out',
                                  transformOrigin: 'center'
                                }}
                              >
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                                <path d="M21 3v5h-5"/>
                                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                                <path d="M3 21v-5h5"/>
                              </svg>
                            </Button>
                          </Flex>
                          {lastFileChange && (
                            <Text size="1" color="gray">
                              Last change: {lastFileChange}
                            </Text>
                          )}
                        </Flex>
                      </Card>
                    )}
                    {importWarning && (
                      <Text as="p" size="2" style={{ color: 'var(--yellow10)' }}>{importWarning}</Text>
                    )}
                    {importInfo && (
                      <Text as="p" size="2" style={{ color: 'var(--green10)' }}>{importInfo}</Text>
                    )}
                    {referenceErrors.length > 0 && (
                      <Card size="1" variant="surface" style={{ borderColor: 'var(--red8)' }}>
                        <Flex direction="column" gap="2">
                          <Text size="2" style={{ color: 'var(--red10)', fontWeight: 'bold' }}>
                            Reference Warnings ({referenceErrors.length})
                          </Text>
                          {referenceErrors.map((error, index) => (
                            <Text key={index} size="1" style={{ color: 'var(--red9)' }}>
                              {error}
                            </Text>
                          ))}
                        </Flex>
                      </Card>
                    )}
                    <Text as="p" size="2" color="gray">
                      Files are always created in the Easy-Tellraw folder, starting with Main.txt.
                    </Text>
                    <Text as="p" size="2" color="gray">
                      A Style.txt file is automatically created and managed. All @styles sections from other files are automatically moved there.
                    </Text>
                    
                    <Flex direction="column" gap="3" style={{ marginTop: '16px' }}>
                      <Text size="3">Import Individual Files</Text>
                      <Text size="2" color="gray">
                        Import individual .txt files to add them to your project. They will be combined into the main view.
                      </Text>
                      <Button variant="surface" size="2" onClick={handleOpenDialogueFile}>
                        Import Dialogue File
                      </Button>
                    </Flex>
                  </Flex>
                </Card>
              </Tabs.Content>
            )}
          </Box>
        </Tabs.Root>
      </div>
      
      {/* Hidden file input for browser fallback */}
      <input
        ref={dialogueFileInputRef}
        type="file"
        accept=".txt"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
      
      {/* Import confirmation dialog */}
      <AlertDialog.Root open={isImportConfirmOpen} onOpenChange={setIsImportConfirmOpen}>
        <AlertDialog.Content>
          <AlertDialog.Title>Import Dialogue File</AlertDialog.Title>
          <AlertDialog.Description>
            This will import the selected dialogue file and add it to your project. The file will be copied to the Easy-Tellraw folder.
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button onClick={handleImportConfirm}>Import</Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  );
};

export default App;
