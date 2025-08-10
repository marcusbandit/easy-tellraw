import { useState, useEffect } from 'react';
import { Descendant, Range } from 'slate';
import { TELLRAW_PREFIX } from '../constants';
import { flattenSlateValueToSegments } from '../lib/segments';

/**
 * Hook to derive flattened Minecraft tellraw segments, their Slate paths,
 * and the final tellraw JSON string from a Slate value.
 */
export function useTellrawSegments(value: Descendant[]) {
  const [segments, setSegments] = useState<any[]>([]);
  const [segmentPaths, setSegmentPaths] = useState<(number[] | null)[]>([]);
  const [tellrawJson, setTellrawJson] = useState<string>(`${TELLRAW_PREFIX}[]`);

  useEffect(() => {
    const { segments: segs, paths } = flattenSlateValueToSegments(value as any);
    setSegments(segs as any[]);
    setSegmentPaths(paths);
    setTellrawJson(`${TELLRAW_PREFIX}${JSON.stringify(segs, null, 2)}`);
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