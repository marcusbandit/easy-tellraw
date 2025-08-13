import React, { useEffect, useCallback, useState, useRef } from 'react';
import { Box, Card, Heading, Flex, Button, Dialog, Text } from '@radix-ui/themes';
import { Editable, useSlate } from 'slate-react';
import { Transforms, Text as SlateText, Editor as SlateEditor, Range } from 'slate';
import JsonOutput from './JsonOutput';
import { Leaf } from './TextEditor';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import { parseDialogue } from '../lib/dialogueParser';
import { DialogueGraph } from '../types/dialogue';

interface EditorContainerProps {
  tellrawJson: string;
  segments: any[];
  activeSegmentIndex: number | null;
  selection: Range | null;
  beforeSegments?: any[] | null;
  markedSegments?: any[] | null;
  afterSegments?: any[] | null;
  onImport: (input: string) => void;
  onReset: () => void;
  onCopy: () => void;
  target: string;
  setTarget: (value: string) => void;
  onImportDialogue: (graph: DialogueGraph, opts?: { autoSwitch?: boolean }) => void;
  onDialogueSourceChange?: (source: string) => void;
}

const EditorContainer: React.FC<EditorContainerProps> = ({
  tellrawJson,
  segments,
  activeSegmentIndex,
  selection,
  beforeSegments,
  markedSegments,
  afterSegments,
  onImport,
  onReset,
  onCopy,
  target,
  setTarget,
  onImportDialogue,
  onDialogueSourceChange,
}) => {
  const editor = useSlate();
  const [importInput, setImportInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const dialogueFileInputRef = useRef<HTMLInputElement | null>(null);
  const [watchedFilePath, setWatchedFilePath] = useState<string | null>(null);

  // Electron ipcRenderer (available in Electron with nodeIntegration)
  const ipcRenderer: any = (typeof window !== 'undefined' && (window as any).require)
    ? (window as any).require('electron').ipcRenderer
    : null;

  // Decorate text nodes overlapping the selection range
  const decorate = useCallback(([node, path]: any) => {
    const ranges: any[] = [];
    if (selection && Range.isRange(selection) && SlateText.isText(node)) {
      // Entire node range
      const nodeRange = SlateEditor.range(editor, path);
      const intersection = Range.intersection(nodeRange, selection);
      if (intersection) {
        ranges.push({ ...intersection, highlight: true });
      }
    }
    return ranges;
  }, [editor, selection]);

  // Removed noisy active segment index logging effect

  const toggleMark = (format: string) => {
    // @ts-ignore: dynamic mark access
    const marks: any = SlateEditor.marks(editor) || {};
    const isActive = marks[format];
    Transforms.setNodes(editor, { [format]: !isActive }, { match: (n: any) => SlateText.isText(n), split: true });
  };

  // Validate importInput for JSON syntax
  useEffect(() => {
    let jsonPart = importInput.trim();
    if (/^\/?tellraw/i.test(jsonPart)) {
      // Strip '/tellraw' and selector
      const tokens = jsonPart.split(/\s+/);
      if (tokens.length >= 3) jsonPart = tokens.slice(2).join(' ');
      else {
        const idx = jsonPart.indexOf('[');
        jsonPart = idx >= 0 ? jsonPart.slice(idx) : jsonPart;
      }
    }
    try {
      const parsed = JSON.parse(jsonPart);
      if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
      setImportError(null);
    } catch (e: any) {
      setImportError(e.message);
    }
  }, [importInput]);

  // Helper: Load dialogue from a filesystem path, cache path, and start watching
  const loadDialogueFromPath = useCallback(async (filePath: string, persist: boolean, autoSwitch: boolean) => {
    if (!ipcRenderer) return;
    try {
      const text: string = await ipcRenderer.invoke('read-file', filePath);
      const graph = parseDialogue(text);
      onImportDialogue(graph, { autoSwitch });
      try { onDialogueSourceChange?.(text); } catch {}
      if (persist) {
        try { window.localStorage.setItem('lastDialogueFilePath', filePath); } catch {}
      }
      // Start watching (this also clears any previous watcher in main)
      ipcRenderer.send('watch-file', filePath);
      setWatchedFilePath(filePath);
    } catch (err: any) {
      alert('Failed to open dialogue file: ' + (err?.message || String(err)));
    }
  }, [ipcRenderer, onImportDialogue]);

  // On mount: if we have a cached dialogue path, load it and start watching
  useEffect(() => {
    if (!ipcRenderer) return;
    const lastPath = window.localStorage.getItem('lastDialogueFilePath');
    if (lastPath) {
      loadDialogueFromPath(lastPath, false, false);
    }
    // Listen for change events from main to hot-reload
    const onChanged = (_event: any, payload: { path: string; eventType: string }) => {
      if (payload?.path && payload.path === watchedFilePath) {
        loadDialogueFromPath(payload.path, false, false);
      }
    };
    const onError = (_event: any, payload: { path: string; message: string }) => {
      console.warn('File watch error:', payload);
    };
    ipcRenderer.on('file-changed', onChanged);
    ipcRenderer.on('file-watch-error', onError);
    return () => {
      ipcRenderer.removeListener('file-changed', onChanged);
      ipcRenderer.removeListener('file-watch-error', onError);
      // Stop watching when component unmounts
      ipcRenderer.send('unwatch-file');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipcRenderer, watchedFilePath]);

  // Open native file dialog for dialogue import
  const handleOpenDialogueFile = async () => {
    if (!ipcRenderer) {
      // Fallback to hidden input if not in Electron
      dialogueFileInputRef.current?.click();
      return;
    }
    const result = await ipcRenderer.invoke('open-file-dialog', {
      filters: [{ name: 'Dialogue Text', extensions: ['txt'] }]
    });
    if (!result?.canceled && result.filePaths && result.filePaths[0]) {
      await loadDialogueFromPath(result.filePaths[0], true, true);
    }
  };

  return (
    <section style={{ width: '100%', maxWidth: 'none' }}>
      <Card size="2" variant="surface" style={{ padding: '16px', width: '100%' }}>
        <Box style={{ color: 'var(--gray-a12)' }}>
          <Heading size="5" mb="4">Minecraft Tellraw Editor</Heading>
          {/* Global import toolbar moved to App.tsx */}
          <Box style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', padding: '12px', borderRadius: '4px', marginBottom: '16px', minHeight: '200px' }}>
            <Editable
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              decorate={decorate}
              renderLeaf={props => <Leaf {...props} />}
              placeholder="Enter text..."
              onDoubleClick={event => {
                // Prevent default double-click word selection
                event.preventDefault();
                event.stopPropagation();
                
                // Get the current selection point
                const sel = editor.selection;
                
                if (sel && Range.isCollapsed(sel)) {
                  const [node, path] = SlateEditor.node(editor, sel.anchor.path);
                  if (SlateText.isText(node)) {
                    const text = node.text;
                    const offset = sel.anchor.offset;
                    
                    // Find word boundaries
                    let start = offset;
                    let end = offset;
                    
                    // Find start of word
                    while (start > 0 && /\S/.test(text[start - 1])) {
                      start--;
                    }
                    
                    // Find end of word
                    while (end < text.length && /\S/.test(text[end])) {
                      end++;
                    }
                    
                    // Only select if we found a word
                    if (start < end) {
                      const newSelection = {
                        anchor: { path, offset: start },
                        focus: { path, offset: end }
                      };
                      Transforms.select(editor, newSelection);
                    } else {
                    }
                  } else {
                  }
                } else {
                }
              }}
              onMouseDown={event => {
                // Prevent default selection behavior that might interfere with our system
                if (event.detail === 2) {
                  // Double click - let our custom onDoubleClick handler deal with it
                  return;
                } else if (event.detail === 3) {
                  // Triple click - prevent default and handle line selection
                  event.preventDefault();
                  event.stopPropagation();
                  
                  // Get the current selection point
                  const sel = editor.selection;
                  
                  if (sel && Range.isCollapsed(sel)) {
                    const [node, path] = SlateEditor.node(editor, sel.anchor.path);
                    if (SlateText.isText(node)) {
                      const text = node.text;
                      
                      // Select the entire text node (line)
                      const newSelection = {
                        anchor: { path, offset: 0 },
                        focus: { path, offset: text.length }
                      };
                      Transforms.select(editor, newSelection);
                    } else {
                    }
                  } else {
                  }
                  return;
                }
              }}
              onKeyDown={event => {
                if (event.ctrlKey) {
                  const key = event.key.toLowerCase();
                  if (event.shiftKey) {
                    switch (key) {
                      case 's': event.preventDefault(); toggleMark('strikethrough'); break;
                      case 'o': event.preventDefault(); toggleMark('obfuscated'); break;
                      default: break;
                    }
                  } else {
                    switch (key) {
                      case 'b': event.preventDefault(); toggleMark('bold'); break;
                      case 'i': event.preventDefault(); toggleMark('italic'); break;
                      case 'u': event.preventDefault(); toggleMark('underline'); break;
                      default: break;
                    }
                  }
                }
                // Handle deletion: delete full selection if present, else character delete
                if (event.key === 'Backspace' || event.key === 'Delete') {
                  event.preventDefault();
                  const sel = editor.selection;
                  if (sel && !Range.isCollapsed(sel)) {
                    Transforms.delete(editor, { at: sel });
                  } else {
                    if (event.key === 'Backspace') {
                      Transforms.delete(editor, { unit: 'character', reverse: true });
                    } else {
                      Transforms.delete(editor, { unit: 'character' });
                    }
                  }
                }
              }}
              onPaste={event => {
                event.preventDefault();
                const paste = event.clipboardData.getData('text/plain');
                Transforms.insertText(editor, paste);
              }}
              style={{ outline: 'none' }}
            />
          </Box>
          <JsonOutput
            jsonString={tellrawJson}
            segments={segments}
            activeSegmentIndex={activeSegmentIndex}
            beforeSegments={beforeSegments}
            markedSegments={markedSegments}
            afterSegments={afterSegments}
            target={target}
            onTargetChange={setTarget}
          />
          <Flex justify="between" align="center" gap="2" mt="4">
            <div>
              <Button variant="outline" color="red" size="2" onClick={onReset}>Reset Tellraw</Button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Dialog.Root>
              <Dialog.Trigger>
                <Button variant="surface" size="2">Import Tellraw Command</Button>
              </Dialog.Trigger>
              <Dialog.Content width="80vw" maxWidth="none">
                <Dialog.Title>Import Tellraw Command</Dialog.Title>
                <Editor
                  value={importInput}
                  onValueChange={code => setImportInput(code)}
                  highlight={code => {
                    // Highlight the 'tellraw' command and selector in cyan if present
                    const prefixRegex = /^(\/?tellraw)(\s+)(@[^\s]+)/i;
                    const match = code.match(prefixRegex);
                    let remainder = code;
                    let html = '';
                    if (match) {
                      // match[1] = '/tellraw' or 'tellraw', match[2] = spaces, match[3] = selector
                      const [full, cmd, space, sel] = match;
                      html += `<span class="token keyword">${cmd}</span>${space}<span class="token selector">${sel}</span>`;
                      remainder = code.slice(full.length);
                    }
                    try {
                      // Highlight JSON part
                      let restHtml = Prism.highlight(remainder, Prism.languages.json, 'json');
                      // Wrap braces/brackets with custom classes
                      restHtml = restHtml
                        .replace(/<span class="token punctuation">(\{)<\/span>/g, '<span class="token punctuation punctuation-brace">$1</span>')
                        .replace(/<span class="token punctuation">(\})<\/span>/g, '<span class="token punctuation punctuation-brace">$1</span>')
                        .replace(/<span class="token punctuation">(\[)<\/span>/g, '<span class="token punctuation punctuation-bracket">$1</span>')
                        .replace(/<span class="token punctuation">(\])<\/span>/g, '<span class="token punctuation punctuation-bracket">$1</span>');
                      return html + restHtml;
                    } catch {
                      return code;
                    }
                  }}
                  padding={8}
                  style={{
                    fontFamily: 'minecraftiaregular, sans-serif',
                    backgroundColor: 'var(--gray-a2)',
                    color: 'white',
                    border: '1px solid var(--gray-a6)',
                    borderRadius: '4px',
                    minHeight: '300px',
                    overflow: 'auto'
                  }}
                />
                {importError && (
                  <Text as="p" size="2" style={{ color: 'var(--red9)', marginTop: '4px' }}>
                    Invalid JSON: {importError}
                  </Text>
                )}
                <Flex justify="end" gap="2" mt="3">
                  <Dialog.Close>
                    <Button variant="outline" size="2">Cancel</Button>
                  </Dialog.Close>
                  <Dialog.Close>
                    <Button size="2" onClick={() => onImport(importInput)} disabled={!!importError}>
                      Load
                    </Button>
                  </Dialog.Close>
                </Flex>
              </Dialog.Content>
            </Dialog.Root>
              <Button variant="solid" size="2" onClick={onCopy}>Copy Tellraw Command</Button>
            </div>
          </Flex>
        </Box>
      </Card>
    </section>
  );
};

export default EditorContainer;