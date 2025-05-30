import React, { useEffect, useCallback } from 'react';
import { Container, Box, Card, Heading } from '@radix-ui/themes';
import { Editable, useSlate } from 'slate-react';
import { Transforms, Text, Editor as SlateEditor, Range } from 'slate';
import JsonOutput from './JsonOutput';
import { Leaf } from './TextEditor';

interface EditorContainerProps {
  tellrawJson: string;
  segments: any[];
  activeSegmentIndex: number | null;
  selection: Range | null;
  beforeSegments?: any[] | null;
  markedSegments?: any[] | null;
  afterSegments?: any[] | null;
}

const EditorContainer: React.FC<EditorContainerProps> = ({ tellrawJson, segments, activeSegmentIndex, selection, beforeSegments, markedSegments, afterSegments }) => {
  const editor = useSlate();

  // Decorate text nodes overlapping the selection range
  const decorate = useCallback(([node, path]: any) => {
    const ranges: any[] = [];
    if (selection && Range.isRange(selection) && Text.isText(node)) {
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
    Transforms.setNodes(editor, { [format]: !isActive }, { match: (n: any) => Text.isText(n), split: true });
  };

  return (
    <Container size="3">
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
                if (event.key === 'Backspace') {
                  event.preventDefault();
                  Transforms.delete(editor, { unit: 'character', reverse: true });
                }
                if (event.key === 'Delete') {
                  event.preventDefault();
                  Transforms.delete(editor, { unit: 'character' });
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
          />
        </Box>
      </Card>
    </Container>
  );
};

export default EditorContainer;