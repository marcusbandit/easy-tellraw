import React, { useEffect, useCallback, useState } from 'react';
import { Box, Card, Heading, Flex, Button, Dialog, Text } from '@radix-ui/themes';
import { Editable, useSlate } from 'slate-react';
import { Transforms, Text as SlateText, Editor as SlateEditor, Range } from 'slate';
import JsonOutput from './JsonOutput';
import { Leaf } from './TextEditor';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';

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
}) => {
  const editor = useSlate();
  const [importInput, setImportInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

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

  // Debug: log active segment index
  useEffect(() => {
    console.log('Active segment index changed:', activeSegmentIndex);
  }, [activeSegmentIndex]);

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

  return (
    <section style={{ width: '100%', maxWidth: 'none' }}>
      <Card size="2" variant="surface" style={{ padding: '16px', width: '100%' }}>
        <Box style={{ color: 'var(--gray-a12)' }}>
          <Heading size="5" mb="4">Minecraft Tellraw Editor</Heading>
          <Box style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', padding: '12px', borderRadius: '4px', marginBottom: '16px', minHeight: '200px' }}>
            <Editable
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              decorate={decorate}
              renderLeaf={props => <Leaf {...props} />}
              placeholder="Enter text..."
              onDoubleClick={event => {
                console.log('🖱️ Double-click detected');
                // Prevent default double-click word selection
                event.preventDefault();
                event.stopPropagation();
                
                // Get the current selection point
                const sel = editor.selection;
                console.log('🖱️ Current selection before double-click:', sel);
                
                if (sel && Range.isCollapsed(sel)) {
                  const [node, path] = SlateEditor.node(editor, sel.anchor.path);
                  if (SlateText.isText(node)) {
                    const text = node.text;
                    const offset = sel.anchor.offset;
                    
                    console.log('🖱️ Finding word boundaries at offset:', offset, 'in text:', text);
                    
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
                    
                    console.log('🖱️ Word boundaries found:', { start, end, word: text.substring(start, end) });
                    
                    // Only select if we found a word
                    if (start < end) {
                      const newSelection = {
                        anchor: { path, offset: start },
                        focus: { path, offset: end }
                      };
                      console.log('🖱️ Creating new selection:', newSelection);
                      Transforms.select(editor, newSelection);
                    } else {
                      console.log('🖱️ No word found at cursor position');
                    }
                  } else {
                    console.log('🖱️ Current node is not text:', node);
                  }
                } else {
                  console.log('🖱️ No collapsed selection to work with');
                }
              }}
              onMouseDown={event => {
                console.log('🖱️ Mouse down - detail:', event.detail);
                // Prevent default selection behavior that might interfere with our system
                if (event.detail === 2) {
                  // Double click - let our custom onDoubleClick handler deal with it
                  console.log('🖱️ Double click detected in mouse down - letting onDoubleClick handle it');
                  return;
                } else if (event.detail === 3) {
                  // Triple click - prevent default and handle line selection
                  console.log('🖱️ Triple click detected - handling line selection');
                  event.preventDefault();
                  event.stopPropagation();
                  
                  // Get the current selection point
                  const sel = editor.selection;
                  console.log('🖱️ Current selection before triple-click:', sel);
                  
                  if (sel && Range.isCollapsed(sel)) {
                    const [node, path] = SlateEditor.node(editor, sel.anchor.path);
                    if (SlateText.isText(node)) {
                      const text = node.text;
                      
                      console.log('🖱️ Selecting entire line:', text);
                      
                      // Select the entire text node (line)
                      const newSelection = {
                        anchor: { path, offset: 0 },
                        focus: { path, offset: text.length }
                      };
                      console.log('🖱️ Creating line selection:', newSelection);
                      Transforms.select(editor, newSelection);
                    } else {
                      console.log('🖱️ Current node is not text for line selection:', node);
                    }
                  } else {
                    console.log('🖱️ No collapsed selection for line selection');
                  }
                  return;
                }
                console.log('🖱️ Single click - allowing default behavior');
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
          <Flex justify="end" gap="2" mt="4">
            <Dialog.Root>
              <Dialog.Trigger>
                <Button variant="surface" size="2">Import</Button>
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
            <Button variant="outline" color="red" size="2" onClick={onReset}>Reset</Button>
            <Button variant="solid" size="2" onClick={onCopy}>Copy</Button>
          </Flex>
        </Box>
      </Card>
    </section>
  );
};

export default EditorContainer;