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

const PresetsPanel: React.FC<PresetsPanelProps> = ({ onUseCommand, graph, onUpdateStyles, onRequestRawUpdate }) => {

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
  const persistStyles = (nextButtons: any, nextSpeakers: any) => {
    setButtonStyles(nextButtons);
    setSpeakerStyles(nextSpeakers);
    onUpdateStyles?.({ buttons: nextButtons, speakers: nextSpeakers, styles: namedStyles } as any);
    // Also update RAW tab by serializing ALL styles (named + characters + buttons)
    try { onRequestRawUpdate?.(serializeAllStylesToRaw(namedStyles, nextSpeakers, nextButtons)); } catch {}
  };
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
  // Removed unused colorInputRef
  // Local drafts for hex input per button to allow partial editing without snapping
  const [buttonColorDraft, setButtonColorDraft] = React.useState<Record<string, string>>({});
  const selectedLabelEmpty = React.useMemo(() => {
    if (!selectedButtonId) return false;
    const val = (buttonStyles[selectedButtonId]?.label ?? '').trim();
    return val === '';
  }, [selectedButtonId, buttonStyles]);
  // Helpers for preset swatch border color, reusing logic from text settings
  const hexToRgb = (hex: string): [number, number, number] => {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const int = parseInt(h, 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  };
  const rgbToHex = (r: number, g: number, b: number): string =>
    '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
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
  };
  const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
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
  };
  const adjustBorderColor = (hex: string): string => {
    const [r, g, b] = hexToRgb(hex.toLowerCase());
    const [h, s, l] = rgbToHsl(r, g, b);
    const newL = l < 0.5 ? Math.min(1, l + 0.2) : Math.max(0, l - 0.35);
    const newS = Math.max(0, s - 0.3);
    const [nr, ng, nb] = hslToRgb(h, newS, newL);
    return rgbToHex(nr, ng, nb);
  };
  // Shared UI constants for color swatch grids
  const CHAR_SWATCH_SIZE = 32;
  const BTN_SWATCH_SIZE = 24;
  const SWATCH_GAP = 8;
  const SWATCH_COLUMNS = 8;
  const makeGridStyle = (size: number): React.CSSProperties => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${SWATCH_COLUMNS}, ${size}px)`,
    gap: SWATCH_GAP,
  });
  const makeSwatchStyle = (hex: string, size: number): React.CSSProperties => ({
    width: size,
    height: size,
    backgroundColor: hex,
    borderRadius: '50%',
    border: `2px solid ${adjustBorderColor(hex)}`,
    cursor: 'pointer',
    padding: 0,
  });
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
  }, [selectedButtonId]);
  // Removed unused target state; PresetsPanel delegates command usage upward

  return (
    <Card size="2" variant="surface">
      <Flex direction="column" gap="3">
        <Heading size="5" style={{ fontSize: 'var(--mc-preview-font-size)' }}>Presets</Heading>
        {/* Named Styles (style.<name>) */}
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
                        <HexColorPicker style={{ width: '100%' }} color={color} onChange={(c) => {
                          const next = { ...namedStyles, [key]: { ...(namedStyles as any)[key], color: c } };
                          setNamedStyles(next);
                          onUpdateStyles?.({ buttons: buttonStyles, speakers: speakerStyles, styles: next } as any);
                          onRequestRawUpdate?.(serializeAllStylesToRaw(next, speakerStyles, buttonStyles));
                        }} />
                        <div style={makeGridStyle(CHAR_SWATCH_SIZE)}>
                          {[ '#000000','#AA0000','#00AA00','#00AAAA','#555555','#FF5555','#55FF55','#55FFFF','#AAAAAA','#0000AA','#AA00AA','#FFAA00','#FFFFFF','#5555FF','#FF55FF','#FFFF55', ].map(hex => (
                            <button key={hex} onClick={() => { const next = { ...namedStyles, [key]: { ...(namedStyles as any)[key], color: hex } }; setNamedStyles(next); onUpdateStyles?.({ buttons: buttonStyles, speakers: speakerStyles, styles: next } as any); onRequestRawUpdate?.(serializeAllStylesToRaw(next, speakerStyles, buttonStyles)); }} style={makeSwatchStyle(hex, CHAR_SWATCH_SIZE)} aria-label={hex} />
                          ))}
                        </div>
                      </div>
                    </Popover.Content>
                  </Popover.Root>
                  <Button variant={st?.bold ? 'solid' : 'surface'} onClick={() => { const next = { ...namedStyles, [key]: { ...(namedStyles as any)[key], bold: !st?.bold } }; setNamedStyles(next); onUpdateStyles?.({ buttons: buttonStyles, speakers: speakerStyles, styles: next } as any); onRequestRawUpdate?.(serializeAllStylesToRaw(next, speakerStyles, buttonStyles)); }}>B</Button>
                  <Button variant={st?.italic ? 'solid' : 'surface'} onClick={() => { const next = { ...namedStyles, [key]: { ...(namedStyles as any)[key], italic: !st?.italic } }; setNamedStyles(next); onUpdateStyles?.({ buttons: buttonStyles, speakers: speakerStyles, styles: next } as any); onRequestRawUpdate?.(serializeAllStylesToRaw(next, speakerStyles, buttonStyles)); }}><em>I</em></Button>
                  <Button variant={st?.underline ? 'solid' : 'surface'} onClick={() => { const next = { ...namedStyles, [key]: { ...(namedStyles as any)[key], underline: !st?.underline } }; setNamedStyles(next); onUpdateStyles?.({ buttons: buttonStyles, speakers: speakerStyles, styles: next } as any); onRequestRawUpdate?.(serializeAllStylesToRaw(next, speakerStyles, buttonStyles)); }}><u>U</u></Button>
                  <Button variant={st?.strikethrough ? 'solid' : 'surface'} onClick={() => { const next = { ...namedStyles, [key]: { ...(namedStyles as any)[key], strikethrough: !st?.strikethrough } }; setNamedStyles(next); onUpdateStyles?.({ buttons: buttonStyles, speakers: speakerStyles, styles: next } as any); onRequestRawUpdate?.(serializeAllStylesToRaw(next, speakerStyles, buttonStyles)); }}><s>S</s></Button>
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
                    if (!name) return;
                     if (namedStyles[name]) return;
                     const next = { ...namedStyles, [name]: { color: '#ffffff' } };
                     setNamedStyles(next);
                     onUpdateStyles?.({ buttons: buttonStyles, speakers: speakerStyles, styles: next } as any);
                     onRequestRawUpdate?.(serializeAllStylesToRaw(next, speakerStyles, buttonStyles));
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </Flex>
          </Flex>
        </Card>
        {/* Characters (two sections: Name style and Text style), mirrors button editor patterns */}
        <Card size="2" variant="classic">
          <Heading size="3" mb="2" style={{ fontSize: 'var(--mc-label-font-size)' }}>Characters</Heading>
          <Flex direction="column" gap="3">
            {Object.keys(speakerStyles).length === 0 && (
              <Text size="2" style={{ color: 'var(--gray-a10)' }}>No characters detected yet. Import a dialogue file to populate.</Text>
            )}
            {Object.entries(speakerStyles).map(([chName, style]: any) => {
              const nameStyle = style?.name || {};
              const textStyle = style?.text || { color: style?.color, bold: style?.bold, italic: style?.italic, underline: style?.underline, strikethrough: style?.strikethrough };
              // local drafts for color inputs
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
                          onChange={e => {
                            const newName = e.target.value;
                            const next = { ...speakerStyles } as any;
                            const existing = next[chName];
                            delete next[chName];
                            next[newName] = existing;
                            persistStyles(buttonStyles, next);
                          }}
                          style={{ width: '100%', height: '100%', position: 'relative', zIndex: 2, background: 'transparent', border: '1px solid var(--gray-a6)', borderRadius: 8, boxSizing: 'border-box', padding: '8px 8px', color: 'transparent', caretColor: nameColor, outline: 'none', fontSize: 'var(--mc-font-size-2)', fontFamily: 'inherit', fontWeight: nameStyle?.bold ? 700 : 500, fontStyle: nameStyle?.italic ? 'italic' : 'normal', textDecoration: nameStyle?.underline ? 'underline' : nameStyle?.strikethrough ? 'line-through' : 'none', lineHeight: '24px' }}
                        />
                      </div>
                      <Popover.Root>
                        <Popover.Trigger>
                          <div role="button" aria-label="Pick color" style={{ width: 32, height: 32, backgroundColor: nameColor, border: '1px solid var(--gray-a7)', borderRadius: 8, cursor: 'pointer' }} />
                        </Popover.Trigger>
                        <Popover.Content style={{ width: 260 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <HexColorPicker style={{ width: '100%' }} color={nameColor} onChange={(c) => {
                              const next = { ...speakerStyles, [chName]: { ...style, name: { ...nameStyle, color: c }, text: textStyle } };
                              persistStyles(buttonStyles, next);
                            }} />
                            <TextField.Root value={nameColor} onChange={(e) => {
                              const val = e.target.value; const next = { ...speakerStyles, [chName]: { ...style, name: { ...nameStyle, color: val }, text: textStyle } }; persistStyles(buttonStyles, next);
                            }} placeholder="#ffffff" size="2" style={{ width: '100%' }} />
                            <div style={makeGridStyle(CHAR_SWATCH_SIZE)}>
                              {[ '#000000','#AA0000','#00AA00','#00AAAA','#555555','#FF5555','#55FF55','#55FFFF','#AAAAAA','#0000AA','#AA00AA','#FFAA00','#FFFFFF','#5555FF','#FF55FF','#FFFF55', ].map(hex => (
                                <button key={hex} onClick={() => { const next = { ...speakerStyles, [chName]: { ...style, name: { ...nameStyle, color: hex }, text: textStyle } }; persistStyles(buttonStyles, next); }} style={makeSwatchStyle(hex, CHAR_SWATCH_SIZE)} aria-label={hex} />
                              ))}
                            </div>
                          </div>
                        </Popover.Content>
                      </Popover.Root>
                      <Button variant={nameStyle?.bold ? 'solid' : 'surface'} onClick={() => { const next = { ...speakerStyles, [chName]: { ...style, name: { ...nameStyle, bold: !nameStyle?.bold }, text: textStyle } }; persistStyles(buttonStyles, next); }}>B</Button>
                      <Button variant={nameStyle?.italic ? 'solid' : 'surface'} onClick={() => { const next = { ...speakerStyles, [chName]: { ...style, name: { ...nameStyle, italic: !nameStyle?.italic }, text: textStyle } }; persistStyles(buttonStyles, next); }}><em>I</em></Button>
                      <Button variant={nameStyle?.underline ? 'solid' : 'surface'} onClick={() => { const next = { ...speakerStyles, [chName]: { ...style, name: { ...nameStyle, underline: !nameStyle?.underline }, text: textStyle } }; persistStyles(buttonStyles, next); }}><u>U</u></Button>
                      <Button variant={nameStyle?.strikethrough ? 'solid' : 'surface'} onClick={() => { const next = { ...speakerStyles, [chName]: { ...style, name: { ...nameStyle, strikethrough: !nameStyle?.strikethrough }, text: textStyle } }; persistStyles(buttonStyles, next); }}><s>S</s></Button>
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
                            <HexColorPicker style={{ width: '100%' }} color={textColor} onChange={(c) => {
                              const next = { ...speakerStyles, [chName]: { ...style, name: nameStyle, text: { ...textStyle, color: c } } };
                              persistStyles(buttonStyles, next);
                            }} />
                            <TextField.Root value={textColor} onChange={(e) => { const val = e.target.value; const next = { ...speakerStyles, [chName]: { ...style, name: nameStyle, text: { ...textStyle, color: val } } }; persistStyles(buttonStyles, next); }} placeholder="#ffffff" size="2" style={{ width: '100%' }} />
                            <div style={makeGridStyle(CHAR_SWATCH_SIZE)}>
                              {[ '#000000','#AA0000','#00AA00','#00AAAA','#555555','#FF5555','#55FF55','#55FFFF','#AAAAAA','#0000AA','#AA00AA','#FFAA00','#FFFFFF','#5555FF','#FF55FF','#FFFF55', ].map(hex => (
                                <button key={hex} onClick={() => { const next = { ...speakerStyles, [chName]: { ...style, name: nameStyle, text: { ...textStyle, color: hex } } }; persistStyles(buttonStyles, next); }} style={makeSwatchStyle(hex, CHAR_SWATCH_SIZE)} aria-label={hex} />
                              ))}
                            </div>
                          </div>
                        </Popover.Content>
                      </Popover.Root>
                      <Button variant={textStyle?.bold ? 'solid' : 'surface'} onClick={() => { const next = { ...speakerStyles, [chName]: { ...style, name: nameStyle, text: { ...textStyle, bold: !textStyle?.bold } } }; persistStyles(buttonStyles, next); }}>B</Button>
                      <Button variant={textStyle?.italic ? 'solid' : 'surface'} onClick={() => { const next = { ...speakerStyles, [chName]: { ...style, name: nameStyle, text: { ...textStyle, italic: !textStyle?.italic } } }; persistStyles(buttonStyles, next); }}><em>I</em></Button>
                      <Button variant={textStyle?.underline ? 'solid' : 'surface'} onClick={() => { const next = { ...speakerStyles, [chName]: { ...style, name: nameStyle, text: { ...textStyle, underline: !textStyle?.underline } } }; persistStyles(buttonStyles, next); }}><u>U</u></Button>
                      <Button variant={textStyle?.strikethrough ? 'solid' : 'surface'} onClick={() => { const next = { ...speakerStyles, [chName]: { ...style, name: nameStyle, text: { ...textStyle, strikethrough: !textStyle?.strikethrough } } }; persistStyles(buttonStyles, next); }}><s>S</s></Button>
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
                    if (!name) return;
                    if (speakerStyles[name]) return;
                    const nextSpeakers = { ...speakerStyles, [name]: { name: { color: '#ffffff' }, text: { color: '#ffffff' } } };
                    persistStyles(buttonStyles, nextSpeakers);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </Flex>
          </Flex>
        </Card>

        {/* Button presets (single button visuals) */}
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
                        onChange={e => {
                          const next = { ...buttonStyles, [selectedButtonId]: { ...style, label: e.target.value } };
                          persistStyles(next, speakerStyles);
                        }}
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
                            onChange={(c) => {
                              setButtonColorDraft(prev => ({ ...prev, [selectedButtonId]: c }));
                              const next = { ...buttonStyles, [selectedButtonId]: { ...style, color: c } };
                              persistStyles(next, speakerStyles);
                            }}
                          />
                          <TextField.Root
                            value={draft}
                            onChange={(e) => {
                              const val = e.target.value;
                              setButtonColorDraft(prev => ({ ...prev, [selectedButtonId]: val }));
                              if (/^#([0-9a-fA-F]{6})$/.test(val)) {
                                const next = { ...buttonStyles, [selectedButtonId]: { ...style, color: val } };
                                persistStyles(next, speakerStyles);
                              }
                            }}
                            placeholder="#ffffff"
                            size="2"
                            style={{ width: '100%' }}
                          />
                          <div style={makeGridStyle(BTN_SWATCH_SIZE)}>
                            {[
                              '#000000','#AA0000','#00AA00','#00AAAA',
                              '#555555','#FF5555','#55FF55','#55FFFF',
                              '#AAAAAA','#0000AA','#AA00AA','#FFAA00',
                              '#FFFFFF','#5555FF','#FF55FF','#FFFF55',
                            ].map(hex => (
                              <button
                                key={hex}
                                onClick={() => {
                                  setButtonColorDraft(prev => ({ ...prev, [selectedButtonId]: hex }));
                                  const next = { ...buttonStyles, [selectedButtonId]: { ...style, color: hex } };
                                  persistStyles(next, speakerStyles);
                                }}
                                style={makeSwatchStyle(hex, BTN_SWATCH_SIZE)}
                                aria-label={hex}
                              />
                            ))}
                          </div>
                        </div>
                      </Popover.Content>
                    </Popover.Root>
                    <Button variant={style?.bold ? 'solid' : 'surface'} onClick={() => {
                      const next = { ...buttonStyles, [selectedButtonId]: { ...style, bold: !style?.bold } };
                      persistStyles(next, speakerStyles);
                    }}>B</Button>
                    <Button variant={style?.italic ? 'solid' : 'surface'} onClick={() => {
                      const next = { ...buttonStyles, [selectedButtonId]: { ...style, italic: !style?.italic } };
                      persistStyles(next, speakerStyles);
                    }}><em>I</em></Button>
                    <Button variant={style?.underline ? 'solid' : 'surface'} onClick={() => {
                      const next = { ...buttonStyles, [selectedButtonId]: { ...style, underline: !style?.underline } };
                      persistStyles(next, speakerStyles);
                    }}><u>U</u></Button>
                    <Button variant={style?.strikethrough ? 'solid' : 'surface'} onClick={() => {
                      const next = { ...buttonStyles, [selectedButtonId]: { ...style, strikethrough: !style?.strikethrough } };
                      persistStyles(next, speakerStyles);
                    }}><s>S</s></Button>
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
                    if (!label) return;
                    if (buttonStyles[label]) return;
                    const nextButtons = { ...buttonStyles, [label]: { label, color: '#55ff55' } };
                    persistStyles(nextButtons, speakerStyles);
                    setSelectedButtonId(label);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </Flex>
          </Flex>
        </Card>
      </Flex>
    </Card>
  );
};

export default PresetsPanel;


