import React from 'react';
import { Card, Flex, Heading, Text, TextField, Button, Separator, Popover } from '@radix-ui/themes';
import { HexColorPicker } from 'react-colorful';
import { quotes } from '../lib/quotes';
import { DialogueGraph } from '../types/dialogue';

export interface PresetsPanelProps {
  onUseCommand: (command: string) => void;
  graph?: DialogueGraph | null;
  onUpdateStyles?: (styles: DialogueGraph['styles']) => void;
  onRequestRawUpdate?: (nextRaw: string) => void;
}

// Memoized color constants to prevent recreation
const COLOR_SWATCHES = [
  '#000000','#AA0000','#00AA00','#00AAAA',
  '#555555','#FF5555','#55FF55','#55FFFF',
  '#AAAAAA','#0000AA','#AA00AA','#FFAA00',
  '#FFFFFF','#5555FF','#FF55FF','#FFFF55',
] as const;

// Memoized style constants
const CHAR_SWATCH_SIZE = 32;
const BTN_SWATCH_SIZE = 24;
const SWATCH_GAP = 8;
const SWATCH_COLUMNS = 8;

const PresetsPanel: React.FC<PresetsPanelProps> = ({ onUseCommand, graph, onUpdateStyles, onRequestRawUpdate }) => {

  // Memoized utility functions - must be inside component
  const hexToRgb = React.useMemo(() => (hex: string): [number, number, number] => {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const int = parseInt(h, 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }, []);

  const rgbToHex = React.useMemo(() => (r: number, g: number, b: number): string =>
    '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join(''), []);

  const rgbToHsl = React.useMemo(() => (r: number, g: number, b: number): [number, number, number] => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h, s, l];
  }, []);

  const hslToRgb = React.useMemo(() => (h: number, s: number, l: number): [number, number, number] => {
    let r: number, g: number, b: number;
    if (s === 0) { r = g = b = l; } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }, []);

  const adjustBorderColor = React.useMemo(() => (hex: string): string => {
    const [r, g, b] = hexToRgb(hex.toLowerCase());
    const [h, s, l] = rgbToHsl(r, g, b);
    const newL = l < 0.5 ? Math.min(1, l + 0.2) : Math.max(0, l - 0.35);
    const newS = Math.max(0, s - 0.3);
    const [nr, ng, nb] = hslToRgb(h, newS, newL);
    return rgbToHex(nr, ng, nb);
  }, [hexToRgb, rgbToHsl, hslToRgb, rgbToHex]);

  const makeGridStyle = React.useMemo(() => (size: number): React.CSSProperties => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${SWATCH_COLUMNS}, ${size}px)`,
    gap: SWATCH_GAP,
  }), []);

  const makeSwatchStyle = React.useMemo(() => (hex: string, size: number): React.CSSProperties => ({
    width: size,
    height: size,
    backgroundColor: hex,
    borderRadius: '50%',
    border: `2px solid ${adjustBorderColor(hex)}`,
    cursor: 'pointer',
    padding: 0,
  }), [adjustBorderColor]);

  // Editable button style state (saved into graph.styles.buttons)
  const [buttonStyles, setButtonStyles] = React.useState(() => graph?.styles?.buttons ?? {});
  const [speakerStyles, setSpeakerStyles] = React.useState(() => graph?.styles?.speakers ?? {});
  const [namedStyles, setNamedStyles] = React.useState<Record<string, any>>(() => (graph?.styles as any)?.styles ?? {});
  
  React.useEffect(() => {
    setButtonStyles(graph?.styles?.buttons ?? {});
    setSpeakerStyles(graph?.styles?.speakers ?? {});
    setNamedStyles(((graph?.styles as any)?.styles) ?? {});
  }, [graph]);

  const serializeAllStylesToRaw = React.useCallback((named: Record<string, any>, speakers: Record<string, any>, buttons: Record<string, any>): string => {
    const lines: string[] = [];
    // Named styles first (stable order)
    Object.entries(named || {}).sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, st]: any) => {
      const parts: string[] = [`style.${k}`];
      if (st?.color) parts.push(`color=${st.color}`);
      if (st?.bold) parts.push(`bold=true`);
      if (st?.italic) parts.push(`italic=true`);
      if (st?.underline) parts.push(`underline=true`);
      if (st?.strikethrough) parts.push(`strikethrough=true`);
      lines.push(parts.join(' '));
    });
    if (Object.keys(named || {}).length > 0) lines.push('');
    // Character styles
    Object.entries(speakers || {}).sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, style]: any) => {
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
    if (Object.keys(speakers || {}).length > 0) lines.push('');
    // Button presets
    Object.entries(buttons || {}).forEach(([id, st]: any) => {
      const label = st?.label || id;
      const parts: string[] = [`button.${label}`];
      if (st?.color) parts.push(`color=${st.color}`);
      if (st?.bold) parts.push(`bold=true`);
      if (st?.italic) parts.push(`italic=true`);
      if (st?.underline) parts.push(`underline=true`);
      if (st?.strikethrough) parts.push(`strikethrough=true`);
      lines.push(parts.join(' '));
    });
    return lines.join('\n');
  }, []);

  const persistStyles = React.useCallback((nextButtons: any, nextSpeakers: any) => {
    setButtonStyles(nextButtons);
    setSpeakerStyles(nextSpeakers);
    onUpdateStyles?.({ buttons: nextButtons, speakers: nextSpeakers, styles: namedStyles } as any);
    // Also update RAW tab by serializing ALL styles (named + characters + buttons)
    try { onRequestRawUpdate?.(serializeAllStylesToRaw(namedStyles, nextSpeakers, nextButtons)); } catch {}
  }, [namedStyles, onUpdateStyles, onRequestRawUpdate, serializeAllStylesToRaw]);

  // Stable random preview per character for the lifetime of this tab mount
  const characterPreviewRef = React.useRef<Record<string, string>>({});
  
  React.useEffect(() => {
    const names = Object.keys(speakerStyles || {});
    // Add missing names with a random quote; keep existing assignments stable
    names.forEach(name => {
      if (!characterPreviewRef.current[name]) {
        characterPreviewRef.current[name] = quotes[Math.floor(Math.random() * quotes.length)];
      }
    });
  }, [speakerStyles]);

  const [selectedButtonId, setSelectedButtonId] = React.useState<string | null>(null);
  const [buttonColorDraft, setButtonColorDraft] = React.useState<Record<string, string>>({});

  const selectedLabelEmpty = React.useMemo(() => {
    if (!selectedButtonId) return false;
    const val = (buttonStyles[selectedButtonId]?.label ?? '').trim();
    return val === '';
  }, [selectedButtonId, buttonStyles]);

  // Memoized event handlers
  const handleNamedStyleChange = React.useCallback((key: string, updates: any) => {
    const next = { ...namedStyles, [key]: { ...(namedStyles as any)[key], ...updates } };
    setNamedStyles(next);
    onUpdateStyles?.({ buttons: buttonStyles, speakers: speakerStyles, styles: next } as any);
    onRequestRawUpdate?.(serializeAllStylesToRaw(next, speakerStyles, buttonStyles));
  }, [namedStyles, buttonStyles, speakerStyles, onUpdateStyles, onRequestRawUpdate, serializeAllStylesToRaw]);

  const handleSpeakerStyleChange = React.useCallback((chName: string, updates: any) => {
    const next = { ...speakerStyles, [chName]: { ...speakerStyles[chName], ...updates } };
    persistStyles(buttonStyles, next);
  }, [speakerStyles, buttonStyles, persistStyles]);

  const handleButtonStyleChange = React.useCallback((id: string, updates: any) => {
    const next = { ...buttonStyles, [id]: { ...buttonStyles[id], ...updates } };
    persistStyles(next, speakerStyles);
  }, [buttonStyles, speakerStyles, persistStyles]);

  const handleAddNamedStyle = React.useCallback((name: string) => {
    if (!name || namedStyles[name]) return;
    const next = { ...namedStyles, [name]: { color: '#ffffff' } };
    setNamedStyles(next);
    onUpdateStyles?.({ buttons: buttonStyles, speakers: speakerStyles, styles: next } as any);
    onRequestRawUpdate?.(serializeAllStylesToRaw(next, speakerStyles, buttonStyles));
  }, [namedStyles, buttonStyles, speakerStyles, onUpdateStyles, onRequestRawUpdate, serializeAllStylesToRaw]);

  const handleAddSpeaker = React.useCallback((name: string) => {
    if (!name || speakerStyles[name]) return;
    const nextSpeakers = { ...speakerStyles, [name]: { name: { color: '#ffffff' }, text: { color: '#ffffff' } } };
    persistStyles(buttonStyles, nextSpeakers);
  }, [speakerStyles, buttonStyles, persistStyles]);

  const handleAddButton = React.useCallback((label: string) => {
    if (!label || buttonStyles[label]) return;
    const nextButtons = { ...buttonStyles, [label]: { label, color: '#55ff55' } };
    persistStyles(nextButtons, speakerStyles);
    setSelectedButtonId(label);
  }, [buttonStyles, speakerStyles, persistStyles]);

  const handleSpeakerNameChange = React.useCallback((oldName: string, newName: string) => {
    if (!newName || speakerStyles[newName]) return;
    const next = { ...speakerStyles } as any;
    const existing = next[oldName];
    delete next[oldName];
    next[newName] = existing;
    persistStyles(buttonStyles, next);
  }, [speakerStyles, buttonStyles, persistStyles]);

  const handleColorDraftChange = React.useCallback((id: string, color: string) => {
    setButtonColorDraft(prev => ({ ...prev, [id]: color }));
    if (/^#([0-9a-fA-F]{6})$/.test(color)) {
      handleButtonStyleChange(id, { color });
    }
  }, [handleButtonStyleChange]);

  React.useEffect(() => {
    if (selectedButtonId && buttonStyles[selectedButtonId] === undefined) {
      // Selected was removed; pick first available
      const first = Object.keys(buttonStyles)[0] ?? null;
      setSelectedButtonId(first ?? null);
    }
    if (!selectedButtonId) {
      const first = Object.keys(buttonStyles)[0] ?? null;
      setSelectedButtonId(first ?? null);
    }
  }, [buttonStyles, selectedButtonId]);

  // Initialize color draft for selected button if missing
  React.useEffect(() => {
    if (!selectedButtonId) return;
    const style: any = buttonStyles[selectedButtonId] || {};
    const hex = /^#([0-9a-fA-F]{6})$/.test(style?.color || '') ? style.color : '#55ff55';
    setButtonColorDraft(prev => (prev[selectedButtonId] == null ? { ...prev, [selectedButtonId]: hex } : prev));
  }, [selectedButtonId, buttonStyles]);

  // Ensure editor loads current label; if missing, initialize to id
  React.useEffect(() => {
    if (!selectedButtonId) return;
    const style: any = buttonStyles[selectedButtonId] || {};
    if (!('label' in style) || style.label === '') {
      const next = { ...buttonStyles, [selectedButtonId]: { ...style, label: style.label ?? selectedButtonId } };
      persistStyles(next, speakerStyles);
    }
  }, [selectedButtonId, buttonStyles, persistStyles, speakerStyles]);

  // Memoized components to prevent unnecessary re-renders
  const NamedStylesSection = React.useMemo(() => (
    <Card size="2" variant="classic">
      <Heading size="3" mb="2" style={{ fontSize: 'var(--mc-label-font-size)' }}>Styles</Heading>
      <Flex direction="column" gap="2">
        {Object.entries(namedStyles).map(([key, st]) => {
          const color = (st as any)?.color || '#ffffff';
          return (
            <Flex key={key} align="center" gap="3" wrap="wrap">
              <Text size="2" style={{ minWidth: 90 }}>{`style.${key}`}</Text>
              {/* Preview chip */}
              <div style={{ background: '#1C1F20', border: '1px solid var(--gray-a7)', borderRadius: 8, padding: '8px 8px', color, fontWeight: st?.bold ? 700 : 500, fontStyle: st?.italic ? 'italic' : 'normal', textDecoration: st?.underline ? 'underline' : st?.strikethrough ? 'line-through' : 'none' }}>Sample</div>
              <Popover.Root>
                <Popover.Trigger>
                  <div role="button" aria-label="Pick color" style={{ width: 32, height: 32, backgroundColor: color, border: '1px solid var(--gray-a7)', borderRadius: 8, cursor: 'pointer' }} />
                </Popover.Trigger>
                <Popover.Content style={{ width: 260 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <HexColorPicker style={{ width: '100%' }} color={color} onChange={(c) => handleNamedStyleChange(key, { color: c })} />
                    <div style={makeGridStyle(CHAR_SWATCH_SIZE)}>
                      {COLOR_SWATCHES.map(hex => (
                        <button key={hex} onClick={() => handleNamedStyleChange(key, { color: hex })} style={makeSwatchStyle(hex, CHAR_SWATCH_SIZE)} aria-label={hex} />
                      ))}
                    </div>
                  </div>
                </Popover.Content>
              </Popover.Root>
              <Button variant={st?.bold ? 'solid' : 'surface'} onClick={() => handleNamedStyleChange(key, { bold: !st?.bold })}>B</Button>
              <Button variant={st?.italic ? 'solid' : 'surface'} onClick={() => handleNamedStyleChange(key, { italic: !st?.italic })}><em>I</em></Button>
              <Button variant={st?.underline ? 'solid' : 'surface'} onClick={() => handleNamedStyleChange(key, { underline: !st?.underline })}><u>U</u></Button>
              <Button variant={st?.strikethrough ? 'solid' : 'surface'} onClick={() => handleNamedStyleChange(key, { strikethrough: !st?.strikethrough })}><s>S</s></Button>
            </Flex>
          );
        })}
        {/* Add new style */}
        <Flex align="center" gap="2">
          <Text size="2">New style:</Text>
          <TextField.Root placeholder="name" size="2" style={{ width: 160 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const name = (e.target as HTMLInputElement).value.trim();
                handleAddNamedStyle(name);
                (e.target as HTMLInputElement).value = '';
              }
            }}
          />
        </Flex>
      </Flex>
    </Card>
  ), [namedStyles, handleNamedStyleChange, handleAddNamedStyle, makeGridStyle, makeSwatchStyle]);

  const CharactersSection = React.useMemo(() => (
    <Card size="2" variant="classic">
      <Heading size="3" mb="2" style={{ fontSize: 'var(--mc-label-font-size)' }}>Characters</Heading>
      <Flex direction="column" gap="3">
        {Object.keys(speakerStyles).length === 0 && (
          <Text size="2" style={{ color: 'var(--gray-a10)' }}>No characters detected yet. Import a dialogue file to populate.</Text>
        )}
        {Object.entries(speakerStyles).map(([chName, style]: any) => {
          const nameStyle = style?.name || {};
          const textStyle = style?.text || { color: style?.color, bold: style?.bold, italic: style?.italic, underline: style?.underline, strikethrough: style?.strikethrough };
          const nameColor = /^#([0-9a-fA-F]{6})$/.test(nameStyle?.color || '') ? nameStyle.color : '#ffffff';
          const textColor = /^#([0-9a-fA-F]{6})$/.test(textStyle?.color || '') ? textStyle.color : '#ffffff';
          const preview = characterPreviewRef.current[chName] || quotes[0];
          return (
            <Card key={chName} size="2" variant="surface">
              <Flex direction="column" gap="2">
                {/* Render full preview line */}
                <div style={{
                  background: '#1C1F20',
                  border: '1px solid var(--gray-a7)',
                  borderRadius: 8,
                  padding: '8px 8px',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap'
                }}>
                  <span style={{
                    color: nameColor,
                    fontWeight: nameStyle?.bold ? 700 : 500,
                    fontStyle: nameStyle?.italic ? 'italic' : 'normal',
                    textDecoration: nameStyle?.underline ? 'underline' : nameStyle?.strikethrough ? 'line-through' : 'none',
                  }}>{chName}:</span>
                  <span style={{
                    color: textColor,
                    fontWeight: textStyle?.bold ? 700 : 500,
                    fontStyle: textStyle?.italic ? 'italic' : 'normal',
                    textDecoration: textStyle?.underline ? 'underline' : textStyle?.strikethrough ? 'line-through' : 'none',
                  }}>{preview}</span>
                </div>
                {/* Name display editor */}
                <Flex align="center" gap="3" wrap="wrap">
                  <Text size="2" style={{ minWidth: 90 }}>Name</Text>
                  <div style={{ position: 'relative', width: 288, height: 32, display: 'inline-block' }}>
                    <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', padding: '8px 8px', color: nameColor, fontWeight: nameStyle?.bold ? 700 : 500, fontStyle: nameStyle?.italic ? 'italic' : 'normal', textDecoration: nameStyle?.underline ? 'underline' : nameStyle?.strikethrough ? 'line-through' : 'none', pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 'var(--mc-font-size-2)', fontFamily: 'inherit', lineHeight: '24px', zIndex: 1 }}>{chName}</span>
                    <input
                      value={chName}
                      onChange={e => handleSpeakerNameChange(chName, e.target.value)}
                      style={{ width: '100%', height: '100%', position: 'relative', zIndex: 2, background: 'transparent', border: '1px solid var(--gray-a6)', borderRadius: 8, boxSizing: 'border-box', padding: '8px 8px', color: 'transparent', caretColor: nameColor, outline: 'none', fontSize: 'var(--mc-font-size-2)', fontFamily: 'inherit', fontWeight: nameStyle?.bold ? 700 : 500, fontStyle: nameStyle?.italic ? 'italic' : 'normal', textDecoration: nameStyle?.underline ? 'underline' : nameStyle?.strikethrough ? 'line-through' : 'none', lineHeight: '24px' }}
                    />
                  </div>
                  <Popover.Root>
                    <Popover.Trigger>
                      <div role="button" aria-label="Pick color" style={{ width: 32, height: 32, backgroundColor: nameColor, border: '1px solid var(--gray-a7)', borderRadius: 8, cursor: 'pointer' }} />
                    </Popover.Trigger>
                    <Popover.Content style={{ width: 260 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <HexColorPicker style={{ width: '100%' }} color={nameColor} onChange={(c) => handleSpeakerStyleChange(chName, { name: { ...nameStyle, color: c }, text: textStyle })} />
                        <TextField.Root value={nameColor} onChange={(e) => handleSpeakerStyleChange(chName, { name: { ...nameStyle, color: e.target.value }, text: textStyle })} placeholder="#ffffff" size="2" style={{ width: '100%' }} />
                        <div style={makeGridStyle(CHAR_SWATCH_SIZE)}>
                          {COLOR_SWATCHES.map(hex => (
                            <button key={hex} onClick={() => handleSpeakerStyleChange(chName, { name: { ...nameStyle, color: hex }, text: textStyle })} style={makeSwatchStyle(hex, CHAR_SWATCH_SIZE)} aria-label={hex} />
                          ))}
                        </div>
                      </div>
                    </Popover.Content>
                  </Popover.Root>
                  <Button variant={nameStyle?.bold ? 'solid' : 'surface'} onClick={() => handleSpeakerStyleChange(chName, { name: { ...nameStyle, bold: !nameStyle?.bold }, text: textStyle })}>B</Button>
                  <Button variant={nameStyle?.italic ? 'solid' : 'surface'} onClick={() => handleSpeakerStyleChange(chName, { name: { ...nameStyle, italic: !nameStyle?.italic }, text: textStyle })}><em>I</em></Button>
                  <Button variant={nameStyle?.underline ? 'solid' : 'surface'} onClick={() => handleSpeakerStyleChange(chName, { name: { ...nameStyle, underline: !nameStyle?.underline }, text: textStyle })}><u>U</u></Button>
                  <Button variant={nameStyle?.strikethrough ? 'solid' : 'surface'} onClick={() => handleSpeakerStyleChange(chName, { name: { ...nameStyle, strikethrough: !nameStyle?.strikethrough }, text: textStyle })}><s>S</s></Button>
                </Flex>

                {/* Text display style controls */}
                <Flex align="center" gap="3" wrap="wrap">
                  <Text size="2" style={{ minWidth: 90 }}>Text</Text>
                  <Popover.Root>
                    <Popover.Trigger>
                      <div role="button" aria-label="Pick color" style={{ width: 32, height: 32, backgroundColor: textColor, border: '1px solid var(--gray-a7)', borderRadius: 8, cursor: 'pointer' }} />
                    </Popover.Trigger>
                    <Popover.Content style={{ width: 260 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <HexColorPicker style={{ width: '100%' }} color={textColor} onChange={(c) => handleSpeakerStyleChange(chName, { name: nameStyle, text: { ...textStyle, color: c } })} />
                        <TextField.Root value={textColor} onChange={(e) => handleSpeakerStyleChange(chName, { name: nameStyle, text: { ...textStyle, color: e.target.value } })} placeholder="#ffffff" size="2" style={{ width: '100%' }} />
                        <div style={makeGridStyle(CHAR_SWATCH_SIZE)}>
                          {COLOR_SWATCHES.map(hex => (
                            <button key={hex} onClick={() => handleSpeakerStyleChange(chName, { name: nameStyle, text: { ...textStyle, color: hex } })} style={makeSwatchStyle(hex, CHAR_SWATCH_SIZE)} aria-label={hex} />
                          ))}
                        </div>
                      </div>
                    </Popover.Content>
                  </Popover.Root>
                  <Button variant={textStyle?.bold ? 'solid' : 'surface'} onClick={() => handleSpeakerStyleChange(chName, { name: nameStyle, text: { ...textStyle, bold: !textStyle?.bold } })}>B</Button>
                  <Button variant={textStyle?.italic ? 'solid' : 'surface'} onClick={() => handleSpeakerStyleChange(chName, { name: nameStyle, text: { ...textStyle, italic: !textStyle?.italic } })}><em>I</em></Button>
                  <Button variant={textStyle?.underline ? 'solid' : 'surface'} onClick={() => handleSpeakerStyleChange(chName, { name: nameStyle, text: { ...textStyle, underline: !textStyle?.underline } })}><u>U</u></Button>
                  <Button variant={textStyle?.strikethrough ? 'solid' : 'surface'} onClick={() => handleSpeakerStyleChange(chName, { name: nameStyle, text: { ...textStyle, strikethrough: !textStyle?.strikethrough } })}><s>S</s></Button>
                </Flex>
              </Flex>
            </Card>
          );
        })}
        {/* Add new character */}
        <Flex align="center" gap="2">
          <Text size="2">New character:</Text>
          <TextField.Root placeholder="name" size="2" style={{ width: 160 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const name = (e.target as HTMLInputElement).value.trim();
                handleAddSpeaker(name);
                (e.target as HTMLInputElement).value = '';
              }
            }}
          />
        </Flex>
      </Flex>
    </Card>
  ), [speakerStyles, handleSpeakerStyleChange, handleSpeakerNameChange, handleAddSpeaker, makeGridStyle, makeSwatchStyle]);

  const ButtonsSection = React.useMemo(() => (
    <Card size="2" variant="classic">
      <Heading size="3" mb="2" style={{ fontSize: 'var(--mc-label-font-size)' }}>Button presets</Heading>
      <Flex direction="column" gap="3">
        {/* List of buttons */}
        <Flex gap="2" wrap="wrap">
          {Object.entries(buttonStyles).map(([id, style]: any) => (
            <div
              key={id}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (selectedLabelEmpty && id !== selectedButtonId) return; // prevent switching when current is invalid
                setSelectedButtonId(id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (selectedLabelEmpty && id !== selectedButtonId) return;
                  setSelectedButtonId(id);
                }
              }}
              style={{
                backgroundColor: id === selectedButtonId ? '#26292B' : '#1C1F20',
                border: id === selectedButtonId
                  ? '1px solid var(--accent-9)'
                  : (selectedLabelEmpty && id !== selectedButtonId
                    ? '1px solid #141718'
                    : '1px solid var(--gray-a7)'),
                color: style?.color || 'var(--gray-a12)',
                fontWeight: style?.bold ? 700 : 500,
                fontStyle: style?.italic ? 'italic' : 'normal',
                textDecoration: style?.underline ? 'underline' : style?.strikethrough ? 'line-through' : 'none',
                cursor: selectedLabelEmpty && id !== selectedButtonId ? 'not-allowed' : 'pointer',
                borderRadius: 8,
                padding: '8px 8px',
                lineHeight: '24px',
                display: 'inline-block',
                outline: 'none',
                userSelect: 'none'
              }}
            >
              [{style?.label ?? id}]
            </div>
          ))}
          {Object.keys(buttonStyles).length === 0 && (
            <Text size="2" style={{ color: 'var(--gray-a10)' }}>No button presets yet. They will appear here when loaded from a dialogue file.</Text>
          )}
        </Flex>

        {/* Single editor row for selected button */}
        <Separator size="4" my="1" />
        {selectedButtonId ? (
          (() => {
            const style: any = buttonStyles[selectedButtonId] || {};
            const styleColorValid = /^#([0-9a-fA-F]{6})$/.test(style?.color || '');
            const currentColor = styleColorValid ? style.color : '#55ff55';
            const draft = buttonColorDraft[selectedButtonId] ?? currentColor;
            const draftValid = /^#([0-9a-fA-F]{6})$/.test(draft || '');
            const labelValue = (style?.label ?? '');
            const labelEmpty = labelValue.trim() === '';
            return (
              <Flex align="center" gap="3" wrap="wrap">
                <div style={{ position: 'relative', width: 288, height: 32, display: 'inline-block' }}>
                  <span
                    aria-hidden
                      style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                        padding: '8px 8px',
                      color: labelEmpty ? '#FF4D4F' : (draftValid ? draft : currentColor),
                      fontWeight: labelEmpty ? 500 : (style?.bold ? 700 : 500),
                      fontStyle: labelEmpty ? 'normal' : (style?.italic ? 'italic' : 'normal'),
                      textDecoration: labelEmpty ? 'none' : (style?.underline ? 'underline' : style?.strikethrough ? 'line-through' : 'none'),
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontSize: 'var(--mc-font-size-2)',
                      fontFamily: 'inherit',
                      lineHeight: '24px',
                      zIndex: 1
                    }}
                  >
                    {labelEmpty ? 'Label cannot be empty' : labelValue}
                  </span>
                  <input
                    value={labelValue}
                    onChange={e => handleButtonStyleChange(selectedButtonId, { label: e.target.value })}
                    placeholder=""
                      style={{
                      width: '100%',
                      height: '100%',
                      position: 'relative',
                      zIndex: 2,
                      background: 'transparent',
                      border: labelEmpty ? '1px solid #FF4D4F' : '1px solid var(--gray-a6)',
                        borderRadius: 8,
                      boxSizing: 'border-box',
                        padding: '8px 8px',
                      color: 'transparent',
                      caretColor: draftValid ? draft : currentColor,
                      outline: 'none',
                      fontSize: 'var(--mc-font-size-2)',
                      fontFamily: 'inherit',
                      fontWeight: labelEmpty ? 500 : (style?.bold ? 700 : 500),
                      fontStyle: labelEmpty ? 'normal' : (style?.italic ? 'italic' : 'normal'),
                      textDecoration: labelEmpty ? 'none' : (style?.underline ? 'underline' : style?.strikethrough ? 'line-through' : 'none'),
                      lineHeight: '24px'
                    }}
                  />
                </div>
                <Popover.Root>
                  <Popover.Trigger>
                    <div
                      role="button"
                      aria-label="Pick color"
                      style={{
                        width: 28,
                        height: 28,
                        backgroundColor: draftValid ? draft : currentColor,
                        border: '1px solid var(--gray-a7)',
                        borderRadius: 8,
                        cursor: 'pointer'
                      }}
                    />
                  </Popover.Trigger>
                  <Popover.Content style={{ width: 260 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <HexColorPicker
                        style={{ width: '100%' }}
                        color={draftValid ? draft : currentColor}
                        onChange={(c) => handleColorDraftChange(selectedButtonId, c)}
                      />
                      <TextField.Root
                        value={draft}
                        onChange={(e) => handleColorDraftChange(selectedButtonId, e.target.value)}
                        placeholder="#ffffff"
                        size="2"
                        style={{ width: '100%' }}
                      />
                      <div style={makeGridStyle(BTN_SWATCH_SIZE)}>
                        {COLOR_SWATCHES.map(hex => (
                          <button
                            key={hex}
                            onClick={() => handleColorDraftChange(selectedButtonId, hex)}
                            style={makeSwatchStyle(hex, BTN_SWATCH_SIZE)}
                            aria-label={hex}
                          />
                        ))}
                      </div>
                    </div>
                  </Popover.Content>
                </Popover.Root>
                <Button variant={style?.bold ? 'solid' : 'surface'} onClick={() => handleButtonStyleChange(selectedButtonId, { bold: !style?.bold })}>B</Button>
                <Button variant={style?.italic ? 'solid' : 'surface'} onClick={() => handleButtonStyleChange(selectedButtonId, { italic: !style?.italic })}><em>I</em></Button>
                <Button variant={style?.underline ? 'solid' : 'surface'} onClick={() => handleButtonStyleChange(selectedButtonId, { underline: !style?.underline })}><u>U</u></Button>
                <Button variant={style?.strikethrough ? 'solid' : 'surface'} onClick={() => handleButtonStyleChange(selectedButtonId, { strikethrough: !style?.strikethrough })}><s>S</s></Button>
              </Flex>
            );
          })()
        ) : (
          <Text size="2" style={{ color: 'var(--gray-a10)' }}>Select a button above to edit its appearance.</Text>
        )}
        {/* Add new button */}
        <Flex align="center" gap="2">
          <Text size="2">New button:</Text>
          <TextField.Root placeholder="label" size="2" style={{ width: 160 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const label = (e.target as HTMLInputElement).value.trim();
                handleAddButton(label);
                (e.target as HTMLInputElement).value = '';
              }
            }}
          />
        </Flex>
      </Flex>
    </Card>
  ), [buttonStyles, selectedButtonId, buttonColorDraft, selectedLabelEmpty, handleButtonStyleChange, handleColorDraftChange, handleAddButton, makeGridStyle, makeSwatchStyle]);

  return (
    <Card size="2" variant="surface">
      <Flex direction="column" gap="3">
        <Heading size="5" style={{ fontSize: 'var(--mc-preview-font-size)' }}>Presets</Heading>
        {NamedStylesSection}
        {CharactersSection}
        {ButtonsSection}
      </Flex>
    </Card>
  );
};

export default PresetsPanel;


