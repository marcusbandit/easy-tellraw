import React, { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import { SegmentedControl, Button } from '@radix-ui/themes';
import { TELLRAW_PREFIX } from '../constants';
import { syntaxColors } from '../syntaxColors';

type JsonOutputProps = {
  jsonString: string;
  // optional segment data and active index for highlighting
  segments?: any[];
  activeSegmentIndex?: number | null;
  // Optional split JSON when selection is active
  beforeSegments?: any[] | null;
  markedSegments?: any[] | null;
  afterSegments?: any[] | null;
  // Controlled target selector
  target?: string;
  onTargetChange?: (value: string) => void;
};

// Map of hex codes to Minecraft color names
const HEX_NAME_MAP: Record<string,string> = {
  '#000000': 'black',
  '#0000aa': 'dark_blue',
  '#00aa00': 'dark_green',
  '#00aaaa': 'dark_aqua',
  '#aa0000': 'dark_red',
  '#aa00aa': 'dark_purple',
  '#ffaa00': 'gold',
  '#aaaaaa': 'gray',
  '#555555': 'dark_gray',
  '#5555ff': 'blue',
  '#55ff55': 'green',
  '#55ffff': 'aqua',
  '#ff5555': 'red',
  '#ff55ff': 'light_purple',
  '#ffff55': 'yellow',
  '#ffffff': 'white',
};

const JsonOutput: React.FC<JsonOutputProps> = ({ jsonString, segments, activeSegmentIndex, beforeSegments, markedSegments, afterSegments, target, onTargetChange }) => {
  const [collapsed, setCollapsed] = useState(true);
  // Controlled tellraw target selector (@s, @p, @a)
  const selectedTarget = target ?? '@p';
  const handleTargetChange = (value: string) => onTargetChange?.(value);
  const prefix = TELLRAW_PREFIX;
  // Override prefix with selected target
  const dynamicPrefix = `tellraw ${selectedTarget} `;
  const jsonPart = jsonString.startsWith(prefix) ? jsonString.substring(prefix.length) : jsonString;
  // Determine raw output data: full or inline split segments
  const rawFull = JSON.parse(jsonPart) as any[];
  // If there's a marked selection, show marked segments inline
  const rawData: any[] = markedSegments != null && beforeSegments != null && afterSegments != null
    ? [...beforeSegments, ...markedSegments, ...afterSegments]
    : rawFull;
  // Replace hex colors with Minecraft names when possible
  const mapColorNames = (arr: any[]) =>
    arr.map(seg => {
      if (seg && typeof seg === 'object' && typeof seg.color === 'string') {
        const name = HEX_NAME_MAP[seg.color.toLowerCase()];
        return { ...seg, color: name || seg.color };
      }
      return seg;
    });
  const outputData = mapColorNames(rawData);
  const prettyJson = prefix + JSON.stringify(outputData, null, 2);
  const prettyWithTarget = dynamicPrefix + JSON.stringify(outputData, null, 2);
  const collapsedRaw = mapColorNames(rawFull);
  const collapsedJson = dynamicPrefix + JSON.stringify(collapsedRaw);
  const displayValue = collapsed ? collapsedJson : prettyWithTarget;

  const handleToggle = () => setCollapsed(c => !c);

  // Build syntax-highlighted tokens for JSON output, with full-segment highlighting
  const highlighted = (() => {
    const display = displayValue;
    // Remove the dynamic prefix from the section for tokenization
    const section = display.startsWith(dynamicPrefix) ? display.slice(dynamicPrefix.length) : display;
    const pattern = /"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?|\{|\}|\[|\]|:|,|\s+|./g;
    const tokens = Array.from(section.matchAll(pattern)).map(m => m[0]);
    // Compute highlight ranges for all segments
    const highlightRanges: Array<{ start: number; end: number }> = [];
    const isSplit = beforeSegments != null && markedSegments != null && afterSegments != null;
    if (isSplit) {
      // Highlight each marked segment in the inline array
      try {
        markedSegments.forEach(seg => {
          let segString: string;
          if (collapsed) {
            segString = JSON.stringify(seg);
          } else {
            const raw = JSON.stringify(seg, null, 2);
            segString = raw.split('\n').map(line => '  ' + line).join('\n');
          }
          // Highlight all occurrences of this segment's JSON text
          let fromIndex = 0;
          while (true) {
            const pos = section.indexOf(segString, fromIndex);
            if (pos === -1) break;
            highlightRanges.push({ start: pos, end: pos + segString.length });
            fromIndex = pos + segString.length;
          }
        });
      } catch {
        // ignore
      }
    } else if (segments && activeSegmentIndex != null && segments[activeSegmentIndex] != null) {
      // Highlight the active segment object
      try {
        let segString: string;
        if (collapsed) {
          segString = JSON.stringify(segments[activeSegmentIndex]);
        } else {
          const raw = JSON.stringify(segments[activeSegmentIndex], null, 2);
          segString = raw.split('\n').map(line => '  ' + line).join('\n');
        }
        const pos = section.indexOf(segString);
        if (pos !== -1) {
          highlightRanges.push({ start: pos, end: pos + segString.length });
        }
      } catch {
        // ignore
      }
    }
    let charIndex = 0;
    return [
      // Highlight 'tellraw ' in keyword color
      <span key="prefix-cmd" style={{ color: syntaxColors.keyword }}>{`tellraw `}</span>,
      // Highlight selector '@p ' or similar in selector color
      <span key="prefix-selector" style={{ color: syntaxColors.selector }}>{`${selectedTarget} `}</span>,
      ...tokens.map((token, idx) => {
        const tokenStart = charIndex;
        const tokenEnd = charIndex + token.length;
        charIndex = tokenEnd;
        // default syntax color
        let color = '#e0e0e0'; // default base color
        if (token === '{' || token === '}') color = syntaxColors.brace;
        else if (token === '[' || token === ']') color = syntaxColors.bracket;
        else if (token === ',' || token === ':') color = syntaxColors.punctuation;
        else if (/^(?:true|false|null|-?\d+(?:\.\d+)?)$/.test(token)) {
          // numbers, booleans, null
          color = syntaxColors.number;
        } else if (token.startsWith('"') && token.endsWith('"')) {
          const next = tokens[idx + 1];
          // property key if next is ':'
          color = next === ':' ? syntaxColors.property : syntaxColors.string;
        }
        const style: React.CSSProperties = { color };
        // apply background if token lies within any highlighted range
        if (highlightRanges.some(r => tokenEnd > r.start && tokenStart < r.end)) {
          style.backgroundColor = 'rgba(70, 218, 193, 0.11)';
        }
        return <span key={idx} style={style}>{token}</span>;
      })
    ];
  })();

  return (
    <div style={{ marginTop: 12, maxWidth: '100%' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
        {/* Target selector */}
        <SegmentedControl.Root value={selectedTarget} onValueChange={handleTargetChange} style={{ width: '120px' }}>
          <SegmentedControl.Item value="@p">@p</SegmentedControl.Item>
          <SegmentedControl.Item value="@s">@s</SegmentedControl.Item>
          <SegmentedControl.Item value="@a">@a</SegmentedControl.Item>
        </SegmentedControl.Root>
        {/* Copy and Collapse/Expand buttons */}
        <Button size="2" variant="surface" onClick={handleToggle} style={{ display: 'flex', alignItems: 'center' }}>
          {collapsed ? (
            <><ChevronRightIcon height={16} width={16} style={{ marginRight: '4px' }} />Expand</>
          ) : (
            <><ChevronDownIcon height={16} width={16} style={{ marginRight: '4px' }} />Collapse</>
          )}
        </Button>
      </div>
      <pre key={displayValue}
        style={{
          width: '100%', boxSizing: 'border-box', height: 200, overflow: 'auto',
          backgroundColor: '#1e1e1e', border: '1px solid #333',
          padding: '8px', borderRadius: '4px', fontFamily: 'minecraftiaregular, sans-serif',
          margin: 0, whiteSpace: 'pre-wrap', wordWrap: 'break-word', textAlign: 'left'
        }}
      >
        {highlighted}
      </pre>
    </div>
  );
};

export default JsonOutput; 