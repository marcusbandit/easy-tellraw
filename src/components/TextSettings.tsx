import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSlate } from 'slate-react';
import { Transforms, Text, Editor as SlateEditor, Range } from 'slate';
import { HexColorPicker } from 'react-colorful';
import { Button, TextField } from '@radix-ui/themes';
import * as Tooltip from '@radix-ui/react-tooltip';

// Toolbar button for toggling text marks
export const ToggleButton = ({ format, children, active, path }: { format: string; children: any; active?: boolean; path?: number[] }) => {
  const editor = useSlate();
  return (
    <Button
      size="2"
      variant={active ? 'solid' : 'surface'}
      onMouseDown={e => {
        e.preventDefault();
        // @ts-ignore: dynamic mark access
        const marks: any = SlateEditor.marks(editor) || {};
        const isActive = marks[format];
        // If path provided and selection collapsed, apply to full segment
        const sel = editor.selection;
        if (path && sel && Range.isCollapsed(sel)) {
          Transforms.setNodes(
            editor,
            { [format]: !isActive },
            { at: path, match: (n: any) => Text.isText(n), split: true }
          );
        } else {
          Transforms.setNodes(
            editor,
            { [format]: !isActive },
            { match: (n: any) => Text.isText(n), split: true }
          );
        }
      }}
      style={{ width: '100%', textAlign: 'center' }}
    >
      {children}
    </Button>
  );
};

// Color picker integrated into toolbar
export const ColorButton = ({ editor, color: initialColor, path }: { editor: any; color?: string; path?: number[] }) => {
  // pickerColor controls the HexColorPicker thumb; displayColor updates the hex code text
  const [pickerColor, setPickerColor] = useState(initialColor || '#ffffff');
  const [displayColor, setDisplayColor] = useState(initialColor || '#ffffff');
  // Track whether user is actively dragging the picker
  const [isDragging, setIsDragging] = useState(false);
  // Store the selection when the color picker is focused/dragged
  const savedSelection = useRef<any>(null);
  // Function to apply color to the editor model
  const applyColor = useCallback((c: string) => {
    const sel = editor.selection || savedSelection.current;
    if (!sel) return;
    if (path && Range.isCollapsed(sel)) {
      Transforms.setNodes(editor, { color: c } as any, { at: path, match: (n: any) => Text.isText(n), split: true });
    } else {
      Transforms.setNodes(editor, { color: c } as any, { at: sel, match: (n: any) => Text.isText(n), split: true });
    }
  }, [editor, path]);
  // Sync picker and display to active segment color when segment changes
  useEffect(() => {
    setPickerColor(initialColor || '#ffffff');
    setDisplayColor(initialColor || '#ffffff');
  }, [initialColor]);
  // Listen for mouseup globally to end drag and flush color only if dragging
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging) {
        // flush final color update
        applyColor(displayColor);
        // update picker thumb to final dragged color
        setPickerColor(displayColor);
      }
      setIsDragging(false);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [applyColor, displayColor, isDragging]);

  // Utility: convert hex string to RGB
  const hexToRgb = (hex: string): [number, number, number] => {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const int = parseInt(h, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return [r, g, b];
  };
  // Utility: convert RGB to hex
  const rgbToHex = (r: number, g: number, b: number): string =>
    '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  // Utility: convert RGB to HSL
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
  // Utility: convert HSL to RGB
  const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
    let r: number, g: number, b: number;
    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
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
  // Compute border color by adjusting lightness and desaturation by 30%
  const adjustBorderColor = (hex: string): string => {
    const cleanHex = hex.toLowerCase();
    const [r, g, b] = hexToRgb(cleanHex);
    const [h, s, l] = rgbToHsl(r, g, b);
    // Lighten by 20% for darker base colors; darken by 35% for lighter base colors to account for perception
    const newL = l < 0.5 ? Math.min(1, l + 0.2) : Math.max(0, l - 0.35);
    const newS = Math.max(0, s - 0.3);
    const [nr, ng, nb] = hslToRgb(h, newS, newL);
    return rgbToHex(nr, ng, nb);
  };

  return (
    <div
      style={{ width: '100%', paddingTop: '16px' }}
      onMouseDown={() => {
        setIsDragging(true);
        savedSelection.current = editor.selection;
      }}
    >
      <HexColorPicker
        style={{ width: '100%' }}
        color={pickerColor}
        onChange={c => {
          // update hex code display continuously; editor update deferred to mouseup
          setDisplayColor(c);
        }}
      />
      {/* Editable Hex code display under the picker, syncing color as you type when not dragging */}
      <TextField.Root
        value={displayColor}
        onChange={e => {
          const newColor = e.target.value;
          setDisplayColor(newColor);
          setPickerColor(newColor);
          if (!isDragging) {
            applyColor(newColor);
          }
        }}
        placeholder="#ffffff"
        size="2"
        variant="surface"
        style={{ width: '100%', marginTop: '8px' }}
      />
      {/* Minecraft color presets as a 4x4 square grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '8px', width: '100%' }}>
        {[
          { name: 'Black', hex: '#000000' },
          { name: 'Dark Red', hex: '#AA0000' },
          { name: 'Dark Green', hex: '#00AA00' },
          { name: 'Dark Aqua', hex: '#00AAAA' },
          { name: 'Dark Gray', hex: '#555555' },
          { name: 'Red', hex: '#FF5555' },
          { name: 'Green', hex: '#55FF55' },
          { name: 'Aqua', hex: '#55FFFF' },
          { name: 'Gray', hex: '#AAAAAA' },
          { name: 'Dark Blue', hex: '#0000AA' },
          { name: 'Dark Purple', hex: '#AA00AA' },
          { name: 'Gold', hex: '#FFAA00' },
          { name: 'White', hex: '#FFFFFF' },
          { name: 'Blue', hex: '#5555FF' },
          { name: 'Light Purple', hex: '#FF55FF' },
          { name: 'Yellow', hex: '#FFFF55' },
        ].map(preset => (
          <Tooltip.Root key={preset.hex} delayDuration={200}>
            <Tooltip.Trigger asChild>
              <button
                onClick={() => {
                  setDisplayColor(preset.hex);
                  setPickerColor(preset.hex);
                  applyColor(preset.hex);
                }}
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  backgroundColor: preset.hex,
                  borderRadius: '50%',
                  border: `3px solid ${adjustBorderColor(preset.hex)}`,
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="top" align="center" sideOffset={4} style={{ zIndex: 999, pointerEvents: 'none' }}>
                <div style={{ padding: '8px 8px', backgroundColor: '#333', borderRadius: '8px', fontSize: '12px', color: preset.hex }}>
                  {preset.name}
                </div>
                <Tooltip.Arrow style={{ fill: '#333' }} />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ))}
      </div>
    </div>
  );
}; 