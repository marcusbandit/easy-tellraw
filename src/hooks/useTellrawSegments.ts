import { useState, useEffect } from 'react';
import { Descendant, Range } from 'slate';
import { TELLRAW_PREFIX } from '../constants';

/**
 * Hook to derive flattened Minecraft tellraw segments, their Slate paths,
 * and the final tellraw JSON string from a Slate value.
 */
export function useTellrawSegments(value: Descendant[]) {
  const [segments, setSegments] = useState<any[]>([]);
  const [segmentPaths, setSegmentPaths] = useState<(number[] | null)[]>([]);
  const [tellrawJson, setTellrawJson] = useState<string>(`${TELLRAW_PREFIX}[]`);

  useEffect(() => {
    // Flatten Slate value to raw segments
    const newSegments: any[] = [];
    const newPaths: (number[] | null)[] = [];
    value.forEach((node: any, pIdx: number) => {
      if (node.children) {
        node.children.forEach((child: any, cIdx: number) => {
          if (!child.text) return;
          const segment: any = { text: child.text, color: child.color || '#ffffff' };
          if (child.bold) segment.bold = true;
          if (child.italic) segment.italic = true;
          if (child.underline) segment.underline = true;
          if (child.strikethrough) segment.strikethrough = true;
          if (child.obfuscated) segment.obfuscated = true;
          if (child.click_event) segment.click_event = child.click_event;
          if (child.hover_event) segment.hover_event = child.hover_event;
          newSegments.push(segment);
          newPaths.push([pIdx, cIdx]);
        });
        // Newline marker between paragraphs (including blank ones)
        if (pIdx < value.length - 1) {
          newSegments.push("\n");
          newPaths.push(null);
        }
      }
    });

    // Merge consecutive newline segments into single multi-line entries
    const mergedSegments: any[] = [];
    const mergedPaths: (number[] | null)[] = [];
    for (let i = 0; i < newSegments.length; i++) {
      const seg = newSegments[i];
      const path = newPaths[i];
      if (seg === "\n") {
        let count = 1;
        let j = i + 1;
        while (j < newSegments.length && newSegments[j] === "\n") {
          count++;
          j++;
        }
        mergedSegments.push("\n".repeat(count));
        mergedPaths.push(null);
        i = j - 1;
      } else {
        mergedSegments.push(seg);
        mergedPaths.push(path);
      }
    }

    setSegments(mergedSegments);
    setSegmentPaths(mergedPaths);
    setTellrawJson(`${TELLRAW_PREFIX}${JSON.stringify(mergedSegments, null, 2)}`);
  }, [value]);

  return { segments, segmentPaths, tellrawJson };
}

// Returns the segment index for the current selection (anchor), or null if not found
export function getSegmentIndexForSelection(value: Descendant[], selection: Range | null, segmentPaths: (number[] | null)[]): number | null {
  if (!selection) return null;
  const { anchor } = selection;
  // Find the segment whose path matches the anchor path
  for (let i = 0; i < segmentPaths.length; i++) {
    const path = segmentPaths[i];
    if (path && path[0] === anchor.path[0] && path[1] === anchor.path[1]) {
      return i;
    }
  }
  return null;
} 