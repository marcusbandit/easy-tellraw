import React from 'react';
import { useSlate } from 'slate-react';
import { Transforms, Text, Range } from 'slate';
import { Card, SegmentedControl, TextField, Heading } from '@radix-ui/themes';
import { RocketIcon, Link2Icon, CopyIcon } from '@radix-ui/react-icons';
import { Editor as SlateEditor } from 'slate';

export interface ActionsPanelProps {
  clickAction: string;
  setClickAction: (value: string) => void;
  clickValue: string;
  setClickValue: (value: string) => void;
  hoverText: string;
  setHoverText: (value: string) => void;
  clickFieldFocused: boolean;
  setClickFieldFocused: (value: boolean) => void;
  activeSegmentIndex: number | null;
  segmentPaths: (number[] | null)[];
}

const clickPlaceholders: Record<string, string> = {
  run_command: 'Command to run... (e.g. tp @s 100 100 100)',
  suggest_command: 'Command to suggest... (e.g. tp @s 100 100 100)',
  copy_to_clipboard: 'Text to copy... (e.g. Hello)',
  open_url: 'URL to open... (e.g. https://example.com)',
};

const ActionsPanel: React.FC<ActionsPanelProps> = ({
  clickAction,
  setClickAction,
  clickValue,
  setClickValue,
  hoverText,
  setHoverText,
  clickFieldFocused,
  setClickFieldFocused,
  activeSegmentIndex,
  segmentPaths,
}) => {
  const editor = useSlate();
  const isUpdatingRef = React.useRef(false);
  
  const ActionIcon = (clickAction === 'run_command' || clickAction === 'suggest_command')
    ? RocketIcon
    : clickAction === 'open_url'
      ? Link2Icon
      : CopyIcon;

  // Apply clickAction changes immediately to the editor model
  React.useEffect(() => {
    // Skip if we're already updating to prevent infinite loops
    if (isUpdatingRef.current) {
      console.log('🎯 Skipping ActionsPanel update - already updating');
      return;
    }
    
    console.log('🎯 ActionsPanel useEffect triggered:', {
      clickAction,
      clickValue,
      activeSegmentIndex,
      hasSelection: !!editor.selection,
      selectionCollapsed: editor.selection ? Range.isCollapsed(editor.selection) : null
    });
    
    try {
      isUpdatingRef.current = true;
      
      const v = clickValue;
      const sel = editor.selection;
      // Build the click_event object
      const eventObj = v === ''
        ? null
        : clickAction === 'copy_to_clipboard'
          ? { action: clickAction, value: v }
          : clickAction === 'open_url'
            ? { action: clickAction, url: v }
            : { action: clickAction, command: v };
      
      console.log('🎯 Built event object:', eventObj);
      
      if (sel && !Range.isCollapsed(sel)) {
        console.log('🎯 Applying to selection range');
        Transforms.setNodes(
          editor,
          { click_event: eventObj } as any,
          { at: sel, match: (n: any) => Text.isText(n), split: true }
        );
      } else if (segmentPaths && activeSegmentIndex != null) {
        const path = segmentPaths[activeSegmentIndex] || undefined;
        console.log('🎯 Applying to segment path:', path, 'index:', activeSegmentIndex);
        if (path) {
          // Check if the path exists before trying to set nodes
          try {
            const node = SlateEditor.node(editor, path);
            if (node) {
              console.log('🎯 Path exists, applying click_event');
              Transforms.setNodes(
                editor,
                { click_event: eventObj } as any,
                { at: path }
              );
            } else {
              console.log('🎯 Path exists but node is null');
            }
          } catch (error) {
            // Path doesn't exist, ignore the error
            console.warn('🎯 Path not found for segment:', path, error);
          }
        } else {
          console.log('🎯 No path found for active segment');
        }
      } else {
        console.log('🎯 No selection or active segment to apply to');
      }
    } catch (error) {
      console.warn('🎯 Error updating click event:', error);
    } finally {
      // Reset the flag after a short delay to allow onChange to complete
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 10);
    }
  }, [clickAction, clickValue, editor, activeSegmentIndex, segmentPaths]);

  return (
    <Card size="2" variant="surface">
      <Heading size="5" mb="2">Actions</Heading>
      <Heading size="2" mb="1" mt="2">Click</Heading>
      <SegmentedControl.Root value={clickAction} onValueChange={setClickAction} style={{ width: '100%', marginTop: '8px' }}>
        <SegmentedControl.Item value="run_command">Run command</SegmentedControl.Item>
        <SegmentedControl.Item value="suggest_command">Suggest command</SegmentedControl.Item>
        <SegmentedControl.Item value="copy_to_clipboard">Copy to clipboard</SegmentedControl.Item>
        <SegmentedControl.Item value="open_url">Open URL</SegmentedControl.Item>
      </SegmentedControl.Root>
      <TextField.Root
        value={clickValue}
        onChange={e => {
          try {
            const v = e.target.value;
            setClickValue(v);
            const sel = editor.selection;
            if (sel && !Range.isCollapsed(sel)) {
              // If there is a selection, update only the marked text
              if (v === '') {
                Transforms.setNodes(
                  editor,
                  { click_event: null } as any,
                  { at: sel, match: (n: any) => Text.isText(n), split: true }
                );
              } else {
                const eventObj = clickAction === 'copy_to_clipboard'
                  ? { action: clickAction, value: v }
                  : clickAction === 'open_url'
                  ? { action: clickAction, url: v }
                  : { action: clickAction, command: v };
                Transforms.setNodes(
                  editor,
                  { click_event: eventObj } as any,
                  { at: sel, match: (n: any) => Text.isText(n), split: true }
                );
              }
            } else if (segmentPaths && activeSegmentIndex != null) {
              // Fallback: update by active segment index
              const path = segmentPaths[activeSegmentIndex] || undefined;
              if (path) {
                try {
                  const node = SlateEditor.node(editor, path);
                  if (node) {
                    if (v === '') {
                      Transforms.setNodes(
                        editor,
                        { click_event: null } as any,
                        { at: path }
                      );
                    } else {
                      const eventObj = clickAction === 'copy_to_clipboard'
                        ? { action: clickAction, value: v }
                        : clickAction === 'open_url'
                        ? { action: clickAction, url: v }
                        : { action: clickAction, command: v };
                      Transforms.setNodes(
                        editor,
                        { click_event: eventObj } as any,
                        { at: path }
                      );
                    }
                  }
                } catch (error) {
                  console.warn('Path not found for segment:', path);
                }
              }
            }
          } catch (error) {
            console.warn('Error updating click value:', error);
          }
        }}
        onFocus={() => setClickFieldFocused(true)}
        onBlur={() => setClickFieldFocused(false)}
        onMouseDown={e => e.stopPropagation()}
        placeholder={clickPlaceholders[clickAction]}
        size="2"
        variant="surface"
        style={{ width: '100%', marginTop: '8px' }}
      >
        <TextField.Slot side="left" px="2">
          <ActionIcon height={16} width={16} />
        </TextField.Slot>
      </TextField.Root>
      <Heading size="2" mb="1" mt="2">Hover</Heading>
      <TextField.Root
        value={hoverText}
        onChange={e => {
          const v = e.target.value;
          setHoverText(v);
          try {
            const sel = editor.selection;
            const hoverObj = v === '' ? null : { value: v };
            if (sel && !Range.isCollapsed(sel)) {
              Transforms.setNodes(
                editor,
                { hover_event: hoverObj } as any,
                { at: sel, match: (n: any) => Text.isText(n), split: true }
              );
            } else if (segmentPaths && activeSegmentIndex != null) {
              const path = segmentPaths[activeSegmentIndex] || undefined;
              if (path) {
                try {
                  const node = SlateEditor.node(editor, path);
                  if (node) {
                    Transforms.setNodes(
                      editor,
                      { hover_event: hoverObj } as any,
                      { at: path }
                    );
                  }
                } catch {}
              }
            }
          } catch (err) {
            console.warn('Error updating hover value:', err);
          }
        }}
        placeholder="hover text"
        size="2"
        variant="surface"
        style={{ width: '100%', marginTop: '8px' }}
      />
    </Card>
  );
};

export default ActionsPanel; 