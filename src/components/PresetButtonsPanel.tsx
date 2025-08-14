import React from 'react';
import { Card, Flex, Heading, Button, Text, Separator } from '@radix-ui/themes';
import { presets, Preset } from '../lib/presets';

export interface PresetButtonsPanelProps {
  onUseCommand: (command: string) => void;
  target: string;
}

const buildCommandFromPreset = (preset: Preset, target: string): string => {
  // Replace parameter placeholders $(name) with empty strings
  let template = preset.template;
  template = template.replace(/\$\(([^)]+)\)/g, () => '');
  // Replace $tellraw @x with selected target
  template = template.replace(/\$tellraw\s+@[^\s]+/g, `tellraw ${target}`);
  // Remove comment lines and collapse whitespace
  const lines = template.split(/\r?\n/).filter(l => !/^\s*#/.test(l));
  const joined = lines.join(' ').replace(/\s+/g, ' ').trim();
  return joined;
};

const PresetButtonsPanel: React.FC<PresetButtonsPanelProps> = ({ onUseCommand, target }) => {
  const byCategory = React.useMemo(() => {
    const map = new Map<string, Preset[]>();
    presets.forEach(p => {
      const cat = p.category || 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    });
    return Array.from(map.entries());
  }, []);

  return (
    <Card size="2" variant="surface">
      <Flex direction="column" gap="3">
        <Heading size="5" style={{ fontSize: 'var(--mc-preview-font-size)' }}>Presets</Heading>
        {byCategory.map(([cat, items], idx) => (
          <React.Fragment key={cat}>
            {idx > 0 && <Separator size="4" my="1" />}
            <Heading size="3" style={{ fontSize: 'var(--mc-label-font-size)' }}>{cat}</Heading>
            <Flex direction="column" gap="2">
              {items.map(p => (
                <Button
                  key={p.id}
                  variant="surface"
                  onClick={() => onUseCommand(buildCommandFromPreset(p, target))}
                  style={{ justifyContent: 'flex-start', fontSize: 'var(--mc-button-font-size)' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <Text weight="bold" style={{ fontSize: 'var(--mc-label-font-size)' }}>{p.name}</Text>
                    <Text size="1" color="gray" style={{ fontSize: 'calc(var(--mc-label-font-size) - 2px)' }}>{p.description}</Text>
                  </div>
                </Button>
              ))}
            </Flex>
          </React.Fragment>
        ))}
      </Flex>
    </Card>
  );
};

export default PresetButtonsPanel;



