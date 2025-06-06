import React from 'react';
import { useSlate } from 'slate-react';
import { Transforms, Text, Editor as SlateEditor, Range } from 'slate';
import { Card, SegmentedControl, TextField, Heading } from '@radix-ui/themes';
import { RocketIcon, Link2Icon, CopyIcon } from '@radix-ui/react-icons';

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
  const ActionIcon = (clickAction === 'run_command' || clickAction === 'suggest_command')
    ? RocketIcon
    : clickAction === 'open_url'
      ? Link2Icon
      : CopyIcon;

  // Apply clickAction changes immediately to the editor model
  React.useEffect(() => {
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
    if (sel && !Range.isCollapsed(sel)) {
      Transforms.setNodes(
        editor,
        { click_event: eventObj } as any,
        { at: sel, match: (n: any) => Text.isText(n), split: true }
      );
    } else if (segmentPaths && activeSegmentIndex != null) {
      const path = segmentPaths[activeSegmentIndex] || undefined;
      if (path) {
        Transforms.setNodes(
          editor,
          { click_event: eventObj } as any,
          { at: path }
        );
      }
    }
  }, [clickAction]);

  return (
    <Card size="2" variant="surface">
      <Heading size="5" mb="2">Actions</Heading>
      <Heading size="2" mb="1" mt="2">Click</Heading>
      <SegmentedControl.Root defaultValue={clickAction} onValueChange={setClickAction} style={{ width: '100%', marginTop: '8px' }}>
        <SegmentedControl.Item value="run_command">Run command</SegmentedControl.Item>
        <SegmentedControl.Item value="suggest_command">Suggest command</SegmentedControl.Item>
        <SegmentedControl.Item value="copy_to_clipboard">Copy to clipboard</SegmentedControl.Item>
        <SegmentedControl.Item value="open_url">Open URL</SegmentedControl.Item>
      </SegmentedControl.Root>
      <TextField.Root
        value={clickValue}
        onChange={e => {
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
        onChange={e => setHoverText(e.target.value)}
        placeholder="hover text"
        size="2"
        variant="surface"
        style={{ width: '100%', marginTop: '8px' }}
      />
    </Card>
  );
};

export default ActionsPanel; 