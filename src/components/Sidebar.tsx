import React from 'react';
import { useSlate } from 'slate-react';
import { Card, Heading } from '@radix-ui/themes';
import { ToggleButton, ColorButton } from './TextSettings';

const clickPlaceholders: Record<string, string> = {
  run_command: 'Command to run... (e.g. say Hello)',
  suggest_command: 'Command to suggest... (e.g. say Hello)',
  copy_to_clipboard: 'Text to copy... (e.g. Hello)',
  open_url: 'URL to open... (e.g. https://example.com)',
};

export interface SidebarProps {
  segments?: any[];
  segmentPaths?: (number[] | null)[];
  activeSegmentIndex?: number | null;
}

const Sidebar: React.FC<SidebarProps> = ({ segments, segmentPaths, activeSegmentIndex }) => {
  const editor = useSlate();
  // Determine active segment formatting
  const activeSeg = (segments && activeSegmentIndex != null && segments[activeSegmentIndex] != null)
    ? segments[activeSegmentIndex]
    : {};
  const activePath = (segmentPaths && activeSegmentIndex != null) ? segmentPaths[activeSegmentIndex] || undefined : undefined;

  return (
    <div style={{ width: '240px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Card size="2" variant="surface">
        <Heading size="4" mb="2">Text Settings</Heading>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <ToggleButton format="bold" active={activeSeg.bold} path={activePath}><strong>Bold</strong></ToggleButton>
          <ToggleButton format="italic" active={activeSeg.italic} path={activePath}><em>Italic</em></ToggleButton>
          <ToggleButton format="strikethrough" active={activeSeg.strikethrough} path={activePath}><s>Strikethrough</s></ToggleButton>
          <ToggleButton format="underline" active={activeSeg.underline} path={activePath}><u>Underline</u></ToggleButton>
          <ToggleButton format="obfuscated" active={activeSeg.obfuscated} path={activePath}>Obfuscated</ToggleButton>
          <ColorButton editor={editor} color={activeSeg.color} path={activePath} />
        </div>
      </Card>
    </div>
  );
};

export default Sidebar; 