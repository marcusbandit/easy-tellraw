import { TellrawSegment } from '../types/tellraw';

export function flattenSlateFragmentToCharSegments(nodes: any[]): TellrawSegment[] {
  const result: TellrawSegment[] = [];
  for (const node of nodes) {
    if (!node || !node.children) continue;
    for (const child of node.children) {
      if (!child || typeof child.text !== 'string') continue;
      for (const char of child.text) {
        const seg: TellrawSegment = { text: char, color: child.color || '#ffffff' };
        if (child.bold) seg.bold = true;
        if (child.italic) seg.italic = true;
        if (child.underline) seg.underline = true;
        if (child.strikethrough) seg.strikethrough = true;
        if (child.obfuscated) seg.obfuscated = true;
        if (child.click_event) seg.click_event = child.click_event;
        if (child.hover_event) seg.hover_event = child.hover_event;
        result.push(seg);
      }
    }
  }
  return result;
}

export function squashAdjacentSegments(segments: TellrawSegment[]): TellrawSegment[] {
  const result: TellrawSegment[] = [];
  for (const seg of segments) {
    const last = result[result.length - 1];
    if (last) {
      const lastKeys = Object.keys(last).filter(k => k !== 'text');
      const curKeys = Object.keys(seg).filter(k => k !== 'text');
      const sameShape = lastKeys.length === curKeys.length && lastKeys.every(k => JSON.stringify((last as any)[k]) === JSON.stringify((seg as any)[k]));
      if (sameShape) {
        last.text += seg.text;
        continue;
      }
    }
    result.push({ ...seg });
  }
  return result;
}

export function flattenSlateValueToSegments(value: any[]): { segments: (TellrawSegment | string)[]; paths: (number[] | null)[] } {
  const segments: (TellrawSegment | string)[] = [];
  const paths: (number[] | null)[] = [];
  value.forEach((node: any, pIdx: number) => {
    if (!node || !node.children) return;
    node.children.forEach((child: any, cIdx: number) => {
      if (!child || typeof child.text !== 'string') return;
      const seg: TellrawSegment = { text: child.text, color: child.color || '#ffffff' };
      if (child.bold) seg.bold = true;
      if (child.italic) seg.italic = true;
      if (child.underline) seg.underline = true;
      if (child.strikethrough) seg.strikethrough = true;
      if (child.obfuscated) seg.obfuscated = true;
      if (child.click_event) seg.click_event = child.click_event;
      if (child.hover_event) seg.hover_event = child.hover_event;
      segments.push(seg);
      paths.push([pIdx, cIdx]);
    });
    if (pIdx < value.length - 1) {
      segments.push('\n');
      paths.push(null);
    }
  });

  // Merge consecutive newlines
  const mergedSegments: (TellrawSegment | string)[] = [];
  const mergedPaths: (number[] | null)[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const path = paths[i];
    if (seg === '\n') {
      let count = 1;
      let j = i + 1;
      while (j < segments.length && segments[j] === '\n') {
        count++;
        j++;
      }
      mergedSegments.push('\n'.repeat(count));
      mergedPaths.push(null);
      i = j - 1;
    } else {
      mergedSegments.push(seg);
      mergedPaths.push(path);
    }
  }

  return { segments: mergedSegments, paths: mergedPaths };
}


