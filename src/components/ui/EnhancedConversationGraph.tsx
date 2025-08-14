import React, { CSSProperties, useEffect, useMemo, useRef, useCallback, useState } from 'react';
import ReactFlow, { Background, Controls, Edge, MiniMap, Node, NodeTypes, Position, ReactFlowProvider, Handle, useEdgesState, useNodesState, ReactFlowInstance } from 'reactflow';
import 'reactflow/dist/style.css';
import { DialogueGraph } from '../../types/dialogue';
import { Card, Heading, Text } from '@radix-ui/themes';

interface ConversationGraphProps {
  graph: DialogueGraph | null;
  onSelectScene?: (sceneId: string) => void;
}

type SceneLineData = { namePrefix?: string; nameColor?: string; nameBold?: boolean; nameItalic?: boolean; nameUnderline?: boolean; nameStrikethrough?: boolean; text: string; runs?: Array<{ text: string; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean }>; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; choices?: OptionData[] };
type OptionData = { id: string; label: string; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean };

// Debug overlay toggle for node measurements. Disabled by default.
// Kept intentionally (do not delete) for future debugging needs.
const SHOW_NODE_DEBUG = false;

const SceneNode: React.FC<{ data: { id: string; label: string; lines: SceneLineData[]; options: OptionData[]; isHovered?: boolean; isSelected?: boolean; debugHeight?: number; debugOwnHeight?: number; debugTotalHeight?: number; debugOwnWidth?: number; debugTotalWidth?: number } }> = ({ data }) => {
  return (
    <div style={{
      padding: '16px',
      borderRadius: 8,
      backgroundColor: data.isSelected ? '#303029' : (data.isHovered ? '#333333' : '#2a2a2a'),
      border: data.isSelected ? '1px solid var(--accent-9)' : `1px solid ${data.isHovered ? '#aaaaaa' : '#444'}`,
      minWidth: 220,
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      columnGap: 16,
      boxShadow: data.isSelected
        ? '0 0 0 2px rgba(18,165,148,0.25)'
        : (data.isHovered ? '0 0 0 2px rgba(255,255,255,0.15)' : 'none'),
      transition: 'border-color 120ms ease, box-shadow 120ms ease, background-color 120ms ease',
      textAlign: 'left',
      position: 'relative',
    }}>
      {SHOW_NODE_DEBUG && (typeof data.debugOwnHeight === 'number' || typeof data.debugTotalHeight === 'number') && (
        <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: '#aaa', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {`Own: ${Math.round((data.debugOwnHeight ?? 0) as number)}, Total: ${Math.round((data.debugTotalHeight ?? data.debugHeight ?? 0) as number)}`}
        </div>
      )}
      {/* Width debug on the left side */}
      {SHOW_NODE_DEBUG && (typeof data.debugOwnWidth === 'number' || typeof data.debugTotalWidth === 'number') && (
        <div style={{ position: 'absolute', left: -80, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#aaa', pointerEvents: 'none', textAlign: 'right', lineHeight: 1.3 }}>
          <div>{`Own: ${Math.round((data.debugOwnWidth ?? 0) as number)}`}</div>
          <div>{`Total: ${Math.round((data.debugTotalWidth ?? data.debugOwnWidth ?? 0) as number)}`}</div>
        </div>
      )}
      {/* Center-left target handle ("in" anchor) */}
      {/* Target handle aligned as originally (relative to node edge) */}
      <Handle type="target" position={Position.Left} id="in" style={{ left: -8, background: '#666', width: 8, height: 8, top: '50%', transform: 'translateY(-50%)' }} />
      <div style={{ maxWidth: 480, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{data.label}</div>
        <div>
          {data.lines.map((l, i) => {
            const containerStyle: CSSProperties = {
              fontSize: 12,
              textAlign: 'left',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              whiteSpace: 'normal',
              lineHeight: 1.15,
            };
            const nameStyle: CSSProperties | undefined = l.namePrefix ? {
              color: l.nameColor || '#c8c8c8',
              fontWeight: l.nameBold ? 700 : 400,
              fontStyle: l.nameItalic ? 'italic' : 'normal',
              textDecoration: [l.nameUnderline ? 'underline' : '', l.nameStrikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
            } : undefined;
            const textStyle: CSSProperties = {
              color: l.color || '#c8c8c8',
              fontWeight: l.bold ? 700 : 400,
              fontStyle: l.italic ? 'italic' : 'normal',
              textDecoration: [l.underline ? 'underline' : '', l.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
            };
            return (
              <div key={i} style={containerStyle}>
                {l.namePrefix && (
                  <span style={nameStyle}>{l.namePrefix}</span>
                )}
                {Array.isArray((l as any).runs) && (l as any).runs.length > 0 ? (
                  <>
                    {(l as any).runs.map((r: any, ri: number) => {
                      const rStyle: CSSProperties = {
                        color: r.color ?? textStyle.color,
                        fontWeight: r.bold ? 700 : (textStyle.fontWeight as any),
                        fontStyle: r.italic ? 'italic' : (textStyle.fontStyle as any),
                        textDecoration: [r.underline ? 'underline' : '', r.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || (textStyle.textDecoration as any),
                      };
                       return <span key={ri} style={rStyle}>{r.text}</span>;
                    })}
                    {' '}
                  </>
                ) : (
                   <>
                     <span style={{ ...textStyle, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{l.text}</span>{' '}
                   </>
                )}
                {l.choices && l.choices.length > 0 && (
                  <>
                    {l.choices.map((opt, idx) => {
                      const optStyle: CSSProperties = {
                        color: opt.color || '#cccccc',
                        fontWeight: opt.bold ? 700 : 400,
                        fontStyle: opt.italic ? 'italic' : 'normal',
                        textDecoration: [opt.underline ? 'underline' : '', opt.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
                      };
                      return (
                        <span key={opt.id} style={optStyle}>[{opt.label}]{idx < l.choices!.length - 1 ? ' ' : ''}</span>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', marginRight: -32 }}>
        {data.options.map((opt) => {
          const style: CSSProperties = {
            color: opt.color || '#cccccc',
            fontSize: 14,
            fontWeight: opt.bold ? 700 : 400,
            fontStyle: opt.italic ? 'italic' : 'normal',
            textDecoration: [opt.underline ? 'underline' : '', opt.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
            background: '#3C3C3C',
            border: '1px solid #555',
            borderRadius: 8,
            padding: '8px 8px',
            whiteSpace: 'normal',
            overflow: 'visible',
            textOverflow: 'clip',
            textAlign: 'left',
          };
          return (
            <div key={opt.id} style={{ position: 'relative' }}>
              {/* Keep handle positioned just outside its pill */}
              <Handle type="source" position={Position.Right} id={opt.id} style={{ right: -8, background: opt.color || '#888', width: 8, height: 8 }} />
              <div style={style}>[{opt.label}]</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const GhostNode: React.FC<{ data: { label: string; isHovered?: boolean; debugHeight?: number; debugOwnHeight?: number; debugTotalHeight?: number; debugOwnWidth?: number; debugTotalWidth?: number } }> = ({ data }) => {
  return (
    <div style={{
      padding: '8px 8px',
      borderRadius: 8,
      backgroundColor: data.isHovered ? 'rgba(60,60,60,0.7)' : 'rgba(45,45,45,0.6)',
      border: data.isHovered ? '1px dashed #aaa' : '1px dashed #555',
      color: '#e0e0e0',
      fontSize: 12,
      boxShadow: data.isHovered ? '0 0 0 2px rgba(255,255,255,0.1)' : 'none',
      transition: 'border-color 120ms ease, box-shadow 120ms ease, background-color 120ms ease',
      position: 'relative',
    }}>
      {SHOW_NODE_DEBUG && (typeof data.debugOwnHeight === 'number' || typeof data.debugTotalHeight === 'number') && (
        <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: '#aaa', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {`Own: ${Math.round((data.debugOwnHeight ?? 0) as number)}, Total: ${Math.round((data.debugTotalHeight ?? data.debugHeight ?? 0) as number)}`}
        </div>
      )}
      {/* Width debug on the left side */}
      {SHOW_NODE_DEBUG && (typeof data.debugOwnWidth === 'number' || typeof data.debugTotalWidth === 'number') && (
        <div style={{ position: 'absolute', left: -80, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#aaa', pointerEvents: 'none', textAlign: 'right', lineHeight: 1.3 }}>
          <div>{`Own: ${Math.round((data.debugOwnWidth ?? 0) as number)}`}</div>
          <div>{`Total: ${Math.round((data.debugTotalWidth ?? data.debugOwnWidth ?? 0) as number)}`}</div>
        </div>
      )}
      <Handle type="target" position={Position.Left} id="in" style={{ left: -8, background: '#666', width: 8, height: 8, top: '50%', transform: 'translateY(-50%)' }} />
      {data.label}
    </div>
  );
};

const nodeTypes: NodeTypes = { scene: SceneNode, ghost: GhostNode };

const EnhancedConversationGraph: React.FC<ConversationGraphProps> = ({ graph, onSelectScene }) => {
  // Local state so nodes are draggable and connections editable
  // Toggle debug overlay markers for target centers
  // Debug target markers toggle. Disabled by default.
  // Kept intentionally (do not delete) for future debugging needs.
  const DEBUG_SHOW_TARGETS = false && SHOW_NODE_DEBUG;
  const [graphNodes, setGraphNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const didSimulateRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const draggedIdsRef = useRef<Set<string>>(new Set());
  // Snapshot of positions at drag start to freeze layout targets during drag
  const frozenPosDuringDragRef = useRef<Record<string, { x: number; y: number }>>({});
  // Tracks which currently dragged ids are roots (no parents)
  const draggingRootIdsRef = useRef<Set<string>>(new Set());
  // Roots that the user repositioned and should not drift back to center
  const pinnedRootIdsRef = useRef<Set<string>>(new Set());
  const posRef = useRef<Record<string, { x: number; y: number }>>({});
  const velRef = useRef<Record<string, { vx: number; vy: number }>>({});
  const idleFramesRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [worldCenter, setWorldCenter] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const targetCentersRef = useRef<Record<string, { x: number; y: number }>>({});
  // Persistable map of latest desired target centers per node (pane coordinates)
  const desiredTargetsRef = useRef<Record<string, { x: number; y: number }>>({});
  const transformRef = useRef<[number, number, number]>([0, 0, 1]);
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null);
  // Transform is tracked via onMove into transformRef to avoid requiring useStore
  // When hovering one instance of a scene, highlight all instances by tracking the logical scene id
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);
  const lastHoveredSceneIdRef = useRef<string | null>(null);
  const prevHoveredSceneIdRef = useRef<string | null>(null);
  // Selection state (by logical scene id)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  // Drag guard to avoid click-select after dragging
  const isDraggingAnyRef = useRef<boolean>(false);
  const lastDragTsRef = useRef<number>(0);
  const dragStartPosRef = useRef<Record<string, { x: number; y: number }>>({});
  const CLICK_DRAG_THRESHOLD = 6; // px pane-space
  useEffect(() => {
    // Track previous hovered to update both previous and current IDs minimally
    prevHoveredSceneIdRef.current = lastHoveredSceneIdRef.current;
    lastHoveredSceneIdRef.current = hoveredSceneId;
  }, [hoveredSceneId]);
  // Persisted layout cache (positions + viewport)
  const CACHE_KEY = 'EnhancedConversationGraph.layout.v1';
  const [hasCachedLayout, setHasCachedLayout] = useState<boolean>(false);
  const [initialViewport, setInitialViewport] = useState<{ x: number; y: number; zoom: number } | null>(null);
  // Ensure simulation doesn't start until cache (if any) is applied
  const [isLayoutHydrated, setIsLayoutHydrated] = useState<boolean>(false);
  // Small delay before starting simulation after entering graph view
  const [isSimDelayElapsed, setIsSimDelayElapsed] = useState<boolean>(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsSimDelayElapsed(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const loadLayoutCache = useCallback((): { positions?: Record<string, { x: number; y: number }>; viewport?: { x: number; y: number; zoom: number }; targets?: Record<string, { x: number; y: number }> } | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
      return null;
    } catch (_e) {
      return null;
    }
  }, []);

  const saveLayoutCache = useCallback(() => {
    try {
      const [tx, ty, tz] = transformRef.current || [0, 0, 1];
      const payload = { positions: posRef.current, viewport: { x: tx, y: ty, zoom: tz }, targets: desiredTargetsRef.current };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch (_e) {
      // ignore
    }
  }, []);
  // Save once on page unload instead of during continuous interactions
  useEffect(() => {
    const handleBeforeUnload = () => {
      try { saveLayoutCache(); } catch (_e) { /* ignore */ }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveLayoutCache]);
  // Cached maps for performance
  const parentToChildrenRef = useRef<Record<string, string[]>>({});
  const ownHeightMapRef = useRef<Record<string, number>>({});
  const totalHeightMapRef = useRef<Record<string, number>>({});
  const ownWidthMapRef = useRef<Record<string, number>>({});
  const totalWidthMapRef = useRef<Record<string, number>>({});
  const totalsDirtyRef = useRef<boolean>(true);
  const lastDebugUpdateRef = useRef<number>(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [debugVersion, setDebugVersion] = useState(0);
  // Physics parameters (tunable)
  // Link distance is now computed dynamically per parent; keep only smoothing
  const [smoothingAlpha] = useState(0.1);
  const [simTick, setSimTick] = useState(0);

  // Idle-compute totals when dirty (hoisted so effects can depend on it)
  const scheduleTotalsCompute = useCallback(() => {
    if (!totalsDirtyRef.current) return;
    const run = () => {
      if (!totalsDirtyRef.current) return;
      const mapping = parentToChildrenRef.current;
      const own = ownHeightMapRef.current;
      const ownW = ownWidthMapRef.current;
      const GAP = 12;
      const totals: Record<string, number> = {};
      const totalsW: Record<string, number> = {};
      const visiting = new Set<string>();
      const visitingW = new Set<string>();
      const compute = (id: string): number => {
        if (totals[id] !== undefined) return totals[id];
        if (visiting.has(id)) return own[id] ?? 0;
        visiting.add(id);
        const kids = mapping[id] || [];
        let total: number;
        if (kids.length === 0) {
          total = own[id] ?? 0;
        } else {
          let sum = 0;
          for (const k of kids) sum += compute(k);
          total = sum + GAP * Math.max(0, kids.length - 1);
        }
        visiting.delete(id);
        totals[id] = total;
        return total;
      };
      const computeW = (id: string): number => {
        if (totalsW[id] !== undefined) return totalsW[id];
        if (visitingW.has(id)) return ownW[id] ?? 0;
        visitingW.add(id);
        const kids = mapping[id] || [];
        let total: number;
        if (kids.length === 0) {
          total = ownW[id] ?? 0;
        } else if (kids.length === 1) {
          const child = kids[0];
          const link = Math.max(120, (own[id] ?? 0) * 0.25);
          total = (ownW[id] ?? 0) + link + computeW(child);
        } else {
          // For branching, take the max width among children chains side-by-side
          let maxChild = 0;
          for (const k of kids) {
            const w = computeW(k);
            if (w > maxChild) maxChild = w;
          }
          const link = Math.max(120, (own[id] ?? 0) * 0.25);
          total = (ownW[id] ?? 0) + link + maxChild;
        }
        visitingW.delete(id);
        totalsW[id] = total;
        return total;
      };
      (graphNodes as any[]).forEach((n: any) => compute(n.id));
      (graphNodes as any[]).forEach((n: any) => computeW(n.id));
      totalHeightMapRef.current = totals;
      totalWidthMapRef.current = totalsW;
      totalsDirtyRef.current = false;
      const now = Date.now();
      if (now - lastDebugUpdateRef.current > 180) {
        lastDebugUpdateRef.current = now;
        setDebugVersion(v => v + 1);
      }
    };
    const ric: any = (window as any)?.requestIdleCallback;
    if (typeof ric === 'function') ric(run, { timeout: 300 });
    else setTimeout(run, 0);
  }, [graphNodes]);

  const layout = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const sceneIds = Object.keys(graph.scenes);
    const scenePositions: Record<string, { x: number; y: number; level: number }> = {};

    // Build scene graph for layout (only @node targets)
    const outgoing: Record<string, Set<string>> = {};
    const indegree: Record<string, number> = {};
    const parentsOf: Record<string, string[]> = {};
    sceneIds.forEach(id => { outgoing[id] = new Set(); indegree[id] = 0; });
    sceneIds.forEach(id => {
      const scene = graph.scenes[id];
      scene.lines.forEach(line => {
        line.choices.forEach(choice => {
          const tgt = choice.target.startsWith('@') ? choice.target.slice(1) : '';
          if (tgt && graph.scenes[tgt]) {
            if (!outgoing[id].has(tgt)) {
              outgoing[id].add(tgt);
              indegree[tgt] += 1;
              // record parent order for child
              if (!parentsOf[tgt]) parentsOf[tgt] = [];
              if (!parentsOf[tgt].includes(id)) parentsOf[tgt].push(id);
            }
          }
        });
      });
    });

    // Roots preference: @start if present, else all indegree 0
    const roots: string[] = [];
    if (sceneIds.includes('start')) roots.push('start');
    sceneIds.forEach(id => { if (indegree[id] === 0 && (roots.length === 0 || id !== 'start')) roots.push(id); });

    // BFS layering
    const levelMap: Record<string, number> = {};
    const queue: string[] = [];
    roots.forEach(r => { levelMap[r] = 0; queue.push(r); });
    while (queue.length) {
      const cur = queue.shift() as string;
      const lvl = levelMap[cur];
      outgoing[cur].forEach(nxt => {
        if (!(nxt in levelMap)) {
          levelMap[nxt] = lvl + 1;
          queue.push(nxt);
        }
      });
    }
    // Any unvisited nodes get level 0 bucket (disconnected)
    sceneIds.forEach(id => { if (!(id in levelMap)) levelMap[id] = 0; });

    // Group by level and assign positions
    const levelToIds: Record<number, string[]> = {};
    Object.entries(levelMap).forEach(([id, lvl]) => {
      if (!levelToIds[lvl]) levelToIds[lvl] = [];
      levelToIds[lvl].push(id);
    });

    const X_SPACING = 560;
    const Y_SPACING = 220;
    Object.keys(levelToIds).map(n => parseInt(n, 10)).sort((a, b) => a - b).forEach(level => {
      const idsAtLevel = levelToIds[level];
      idsAtLevel.forEach((id, idx) => {
        const x = level * X_SPACING;
        const y = idx * Y_SPACING;
        scenePositions[id] = { x, y, level };
      });
    });

    // Helper: resolve button style by name, case-insensitive
    const getButtonStyle = (name?: string) => {
      if (!name) return undefined as (typeof graph.styles.buttons)[string] | undefined;
      const direct = (graph.styles.buttons as any)[name];
      if (direct) return direct;
      const lower = String(name).toLowerCase();
      const entry = Object.entries(graph.styles.buttons).find(([k]) => k.toLowerCase() === lower);
      return entry ? entry[1] : undefined;
    };

    // Helper to build a scene node with a specific nodeId (supports duplicates)
    const buildSceneNode = (
      nodeId: string,
      sceneId: string,
      basePos: { x: number; y: number },
      allowOutputs: boolean
    ) => {
      const scene = graph.scenes[sceneId];
      const lineData: SceneLineData[] = scene.lines.map(l => {
        const speakerStyle = l.speaker ? graph.styles.speakers[l.speaker] : undefined;
        const nameColor = speakerStyle?.name?.color;
        const nameBold = !!(speakerStyle?.name?.bold);
        const nameItalic = !!(speakerStyle?.name?.italic);
        const nameUnderline = !!(speakerStyle?.name?.underline);
        const nameStrikethrough = !!(speakerStyle?.name?.strikethrough);
        const textColorFallback = speakerStyle?.text?.color || speakerStyle?.color;
        const textBoldFallback = !!(speakerStyle?.text?.bold ?? speakerStyle?.bold);
        const textItalicFallback = !!(speakerStyle?.text?.italic ?? speakerStyle?.italic);
        const textUnderlineFallback = !!(speakerStyle?.text?.underline ?? speakerStyle?.underline);
        const textStrikeFallback = !!(speakerStyle?.text?.strikethrough ?? speakerStyle?.strikethrough);
        const color = l.style?.color || textColorFallback || '#c8c8c8';
        const choices: OptionData[] = l.choices.map((choice, i) => {
          const btn = getButtonStyle(choice.className);
          const finalLabel = (() => {
            if (choice.text && choice.text.length > 0) return choice.text;
            if (btn?.label && btn.label.length > 0) return btn.label;
            return choice.className || 'button';
          })();
          return ({
            id: `${nodeId}-inline-${i}`,
            label: finalLabel,
            color: choice.color || btn?.color || textColorFallback,
            bold: (choice.bold !== undefined ? choice.bold : !!btn?.bold),
            italic: (choice.italic !== undefined ? choice.italic : !!btn?.italic),
            underline: (choice.underline !== undefined ? choice.underline : !!btn?.underline),
            strikethrough: (choice.strikethrough !== undefined ? choice.strikethrough : !!btn?.strikethrough),
          });
        });
        const showName = !!l.showSpeakerLabel && !!l.speaker;
        return {
          namePrefix: showName ? `${l.speaker}: ` : undefined,
          nameColor,
          nameBold,
          nameItalic,
          nameUnderline,
          nameStrikethrough,
          text: l.text,
          runs: (l as any).runs,
          color,
          bold: (l.style?.bold !== undefined ? !!l.style?.bold : textBoldFallback),
          italic: (l.style?.italic !== undefined ? !!l.style?.italic : textItalicFallback),
          underline: (l.style?.underline !== undefined ? !!l.style?.underline : textUnderlineFallback),
          strikethrough: (l.style?.strikethrough !== undefined ? !!l.style?.strikethrough : textStrikeFallback),
          choices,
        };
      });
      // gather options for right side; handle IDs must match nodeId
      let optionIndex = 0;
      const options: OptionData[] = [];
      if (allowOutputs) {
        graph.scenes[sceneId].lines.forEach(line => {
          const spStyle = line.speaker ? graph.styles.speakers[line.speaker] : undefined;
          const textColorFallback = spStyle?.text?.color || spStyle?.color;
          line.choices.forEach(choice => {
            const btn = getButtonStyle(choice.className);
            const styleColor = choice.color || btn?.color || textColorFallback;
            const finalLabel = (() => {
              if (choice.text && choice.text.length > 0) return choice.text;
              if (btn?.label && btn.label.length > 0) return btn.label;
              return choice.className || 'button';
            })();
            options.push({
              id: `${nodeId}-opt-${optionIndex++}`,
              label: finalLabel,
              color: styleColor,
              bold: (choice.bold !== undefined ? choice.bold : !!btn?.bold),
              italic: (choice.italic !== undefined ? choice.italic : !!btn?.italic),
              underline: (choice.underline !== undefined ? choice.underline : !!btn?.underline),
              strikethrough: (choice.strikethrough !== undefined ? choice.strikethrough : !!btn?.strikethrough),
            });
          });
        });
      }
      nodes.push({
        id: nodeId,
        type: 'scene',
        position: { x: basePos.x, y: basePos.y },
        data: { id: sceneId, label: `@${graph.scenes[sceneId].id}${graph.scenes[sceneId].tags.length ? '  ' + graph.scenes[sceneId].tags.map(t => '#' + t).join(' ') : ''}`, lines: lineData, options },
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
      });
    };

    // Build scene nodes; duplicate nodes for scenes with >1 parent (one per parent)
    const multiParent = new Set<string>(sceneIds.filter(sid => (indegree[sid] || 0) > 1));
    // Pick a primary parent for each multi-parent scene (first encountered order)
    const primaryParentOf: Record<string, string> = {};
    sceneIds.forEach(id => {
      if (multiParent.has(id)) {
        const plist = parentsOf[id] || [];
        if (plist.length > 0) primaryParentOf[id] = plist[0];
      }
    });
    sceneIds.forEach(id => {
      const basePos = scenePositions[id] || { x: 0, y: 0, level: 0 };
      if (!multiParent.has(id)) {
        buildSceneNode(id, id, { x: basePos.x, y: basePos.y }, true);
      }
    });
    // Now add duplicates for multi-parent scenes
    sceneIds.forEach(id => {
      if (!multiParent.has(id)) return;
      const basePos = scenePositions[id] || { x: 0, y: 0, level: 0 };
      const parents = parentsOf[id] || [];
      parents.forEach((pid, idx) => {
        const dupId = `dup:${id}:${pid}`;
        const allowOutputs = primaryParentOf[id] === pid;
        buildSceneNode(dupId, id, { x: basePos.x, y: basePos.y + idx * 40 }, allowOutputs);
      });
    });

    // edges & ghost nodes based on per-option handles
    sceneIds.forEach((id) => {
      const scene = graph.scenes[id];
      // determine which source instances to emit edges from
      const sourceInstances: string[] = (multiParent.has(id) ? (parentsOf[id] || []).map(pid => `dup:${id}:${pid}`) : [id]);
      sourceInstances.forEach(srcInstance => {
        // For multi-parent scenes, only allow edges from the primary parent's duplicate
        if (srcInstance.startsWith('dup:') && multiParent.has(id)) {
          const parts = srcInstance.split(':');
          const parentId = parts[2];
          if (primaryParentOf[id] !== parentId) {
            return; // skip edges for non-primary duplicates (terminal duplicates)
          }
        }
        let optionIndex = 0;
        scene.lines.forEach((line, li) => {
          line.choices.forEach((choice, ci) => {
            const optId = `${srcInstance}-opt-${optionIndex++}`;
            const spStyle = line.speaker ? graph.styles.speakers[line.speaker] : undefined;
            const textColorFallback = spStyle?.text?.color || spStyle?.color;
            const btn = getButtonStyle(choice.className);
            const styleColor = choice.color || btn?.color || textColorFallback || '#cccccc';
            const tgt = choice.target.startsWith('@') ? choice.target.slice(1) : null;
            if (tgt && graph.scenes[tgt]) {
              const targetId = multiParent.has(tgt) ? `dup:${tgt}:${id}` : tgt; // key by base source scene id
              edges.push({
                id: `${srcInstance}-${li}-${ci}-to-${targetId}`,
                source: srcInstance,
                sourceHandle: optId,
                target: targetId,
                targetHandle: 'in',
                style: { stroke: styleColor },
              });
            } else {
              const fnLabel = choice.target;
              const ghostId = `fn:${id}:${fnLabel}`; // keep ghost key by base scene id
              if (!nodes.find(n => n.id === ghostId)) {
                const pos = scenePositions[id];
                nodes.push({
                  id: ghostId,
                  type: 'ghost',
                  position: { x: pos.x + X_SPACING, y: pos.y + 40 * (li + ci) },
                  data: { label: fnLabel },
                  targetPosition: Position.Left,
                });
              }
              edges.push({
                id: `${srcInstance}-${li}-${ci}-to-${ghostId}`,
                source: srcInstance,
                sourceHandle: optId,
                target: ghostId,
                targetHandle: 'in',
                style: { stroke: styleColor },
              });
            }
          });
        });
      });
    });

    return { nodes, edges };
  }, [graph]);

  // Initialize / refresh when graph changes
  useEffect(() => {
    const cache = loadLayoutCache();
    const cachedPositions = cache?.positions || {};
    const nextNodesInit = (layout.nodes as any[]).map((n: any) => {
      const cached = cachedPositions[n.id];
      if (cached && typeof cached.x === 'number' && typeof cached.y === 'number') {
        return { ...n, position: { x: cached.x, y: cached.y } };
      }
      return n;
    });
    setGraphNodes(nextNodesInit as any);
    setEdges(layout.edges as any);
    // initialize physics state
    const nextPos: Record<string, { x: number; y: number }> = {};
    const nextVel: Record<string, { vx: number; vy: number }> = {};
    (nextNodesInit as any[]).forEach((n: any) => {
      nextPos[n.id] = { x: n.position.x, y: n.position.y };
      nextVel[n.id] = { vx: 0, vy: 0 };
    });
    posRef.current = nextPos;
    velRef.current = nextVel;
    didSimulateRef.current = true; // disable old relaxer
    const vp = cache?.viewport;
    if (vp && typeof vp.x === 'number' && typeof vp.y === 'number' && typeof vp.zoom === 'number') {
      setHasCachedLayout(true);
      setInitialViewport(vp);
      transformRef.current = [vp.x, vp.y, vp.zoom];
    } else {
      setHasCachedLayout(false);
      setInitialViewport(null);
    }
    // hydrate last known desired targets if present
    if (cache?.targets && typeof cache.targets === 'object') {
      desiredTargetsRef.current = cache.targets as Record<string, { x: number; y: number }>;
    }
    // If a node is an orphan (no incoming edges) and has a cached position, treat it as pinned
    try {
      const incoming: Record<string, number> = {};
      (nextNodesInit as any[]).forEach((n: any) => { incoming[n.id] = 0; });
      (layout.edges as any[]).forEach((e: any) => {
        const t = String(e.target);
        if (incoming[t] === undefined) incoming[t] = 0;
        incoming[t] += 1;
      });
      Object.keys(incoming).forEach(id => {
        if ((incoming[id] || 0) === 0) {
          const cached = cachedPositions[id];
          if (cached && typeof cached.x === 'number' && typeof cached.y === 'number') {
            pinnedRootIdsRef.current.add(id);
          }
        }
      });
    } catch (_e) {
      // ignore
    }
    // Mark hydration complete so simulation can start
    setIsLayoutHydrated(true);
  }, [layout.nodes, layout.edges, setGraphNodes, setEdges, loadLayoutCache]);

  // Build parent->children mapping when nodes/edges change
  useEffect(() => {
    const mapping: Record<string, string[]> = {};
    (graphNodes as any[]).forEach((n: any) => { mapping[n.id] = mapping[n.id] || []; });
    (edges as any[]).forEach((e: any) => {
      const s = String(e.source);
      const t = String(e.target);
      if (!mapping[s]) mapping[s] = [];
      mapping[s].push(t);
    });
    parentToChildrenRef.current = mapping;
    totalsDirtyRef.current = true;
    scheduleTotalsCompute();
  }, [graphNodes, edges, scheduleTotalsCompute]);

  // Track measured heights and mark totals dirty if changed
  useEffect(() => {
    const nextHeights: Record<string, number> = {};
    const nextWidths: Record<string, number> = {};
    (graphNodes as any[]).forEach((n: any) => {
      const fallbackH = n.type === 'ghost' ? 40 : 160;
      const fallbackW = n.type === 'ghost' ? 140 : 520;
      nextHeights[n.id] = (n as any).height ?? fallbackH;
      nextWidths[n.id] = (n as any).width ?? fallbackW;
    });
    const prev = ownHeightMapRef.current;
    const prevW = ownWidthMapRef.current;
    let changed = false;
    const keysArr = Array.from(new Set([...Object.keys(prev), ...Object.keys(nextHeights)]));
    for (let i = 0; i < keysArr.length; i++) {
      const k = keysArr[i];
      if ((prev[k] ?? -1) !== (nextHeights[k] ?? -1)) { changed = true; break; }
    }
    if (!changed) {
      const wKeys = Array.from(new Set([...Object.keys(prevW), ...Object.keys(nextWidths)]));
      for (let i = 0; i < wKeys.length; i++) {
        const k = wKeys[i];
        if ((prevW[k] ?? -1) !== (nextWidths[k] ?? -1)) { changed = true; break; }
      }
    }
    if (changed) {
      ownHeightMapRef.current = nextHeights;
      ownWidthMapRef.current = nextWidths;
      totalsDirtyRef.current = true;
      scheduleTotalsCompute();
    }
  }, [graphNodes, scheduleTotalsCompute]);

  // Idle-compute totals when dirty (duplicate removed)

  // Track container size and compute world center
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setWorldCenter({ x: rect.width / 2, y: rect.height / 2 });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Disable previous one-shot relaxer
  useEffect(() => {}, []);

  // Legacy relaxer removed

  // Deterministic parent-alignment simulator (smoothing toward computed targets)
  useEffect(() => {
    if (graphNodes.length === 0) return;
    // Defer simulation until hydrated (if cache exists) and 1s delay elapsed
    if (!isLayoutHydrated || !isSimDelayElapsed) return;
    // Helper: compute combined height span of a node's immediate children using the same
    // stacking/offset rules (without re-centering), measured using own heights after offsets
    const computeImmediateChildrenCombinedExtent = (parentIdLocal: string): number => {
      const localChildren = parentToChildren[parentIdLocal] || [];
      if (localChildren.length === 0) return 0;
      const GAP = 12;
      const effectiveHeightsLocal: number[] = localChildren.map(cid => (
        totalHeightMapRef.current[cid] ?? (dims[cid]?.h ?? 0)
      ));
      const baseTargetsLocal: number[] = new Array(localChildren.length);
      let beforeLocal = 0;
      const totalHLocal = effectiveHeightsLocal.reduce((a, b) => a + b, 0) + GAP * Math.max(0, localChildren.length - 1);
      for (let i = 0; i < localChildren.length; i++) {
        const slotH = effectiveHeightsLocal[i];
        baseTargetsLocal[i] = -totalHLocal / 2 + beforeLocal + slotH / 2;
        beforeLocal += effectiveHeightsLocal[i] + (i < localChildren.length - 1 ? GAP : 0);
      }
      const offsetsLocal: number[] = new Array(localChildren.length).fill(0);
      for (let i = 0; i < localChildren.length - 1; i++) {
        const curIdLocal = localChildren[i];
        const nextIdxLocal = i + 1;
        const nextIdLocal = localChildren[nextIdxLocal];
        const nextKidsLocal = parentToChildren[nextIdLocal] || [];
        const curKidsLocal = parentToChildren[curIdLocal] || [];
        if (nextKidsLocal.length === 0 && curKidsLocal.length === 0) continue;
        const curTotalWLocal = totalWidthMapRef.current[curIdLocal] ?? (() => {
          let width = dims[curIdLocal]?.w ?? 0;
          const visitedL = new Set<string>();
          let currentL = curIdLocal;
          while (!visitedL.has(currentL)) {
            visitedL.add(currentL);
            const kidsL = parentToChildren[currentL] || [];
            if (kidsL.length !== 1) break;
            const childL = kidsL[0];
            const linkL = computeLinkDistanceForParent(currentL);
            width += linkL + (dims[childL]?.w ?? 0);
            currentL = childL;
          }
          return width;
        })();
        const nextOwnWLocal = ownWidthMapRef.current[nextIdLocal] ?? (dims[nextIdLocal]?.w ?? 0);
        if (nextOwnWLocal >= curTotalWLocal) {
          const nextTotalHLocal = totalHeightMapRef.current[nextIdLocal] ?? (dims[nextIdLocal]?.h ?? 0);
          const nextOwnHLocal = ownHeightMapRef.current[nextIdLocal] ?? (dims[nextIdLocal]?.h ?? 0);
          const deltaLocal = 0.5 * Math.max(0, nextTotalHLocal - nextOwnHLocal);
          if (deltaLocal > 0) {
            const passingIdx: number[] = [];
            let failedLocal = false;
            for (let k = nextIdxLocal; k < localChildren.length; k++) {
              const kid = localChildren[k];
              const kidOwnW = ownWidthMapRef.current[kid] ?? (dims[kid]?.w ?? 0);
              const kidHasChildren = (parentToChildren[kid] || []).length > 0;
              if (!kidHasChildren || kidOwnW >= curTotalWLocal) passingIdx.push(k); else { failedLocal = true; break; }
            }
            const appliedLocal = failedLocal ? (deltaLocal) : deltaLocal;
            for (const idx of passingIdx) offsetsLocal[idx] -= appliedLocal;
            if (failedLocal && passingIdx.length > 0) {
              const failIdx = nextIdxLocal + passingIdx.length;
              let combinedLocal = 0;
              for (let t = 0; t < passingIdx.length - 1; t++) combinedLocal += effectiveHeightsLocal[passingIdx[t]];
              combinedLocal += GAP * Math.max(0, passingIdx.length - 1);
              for (let j = failIdx; j < localChildren.length; j++) offsetsLocal[j] -= combinedLocal;
            }
          }
        } else {
          const curOwnWLocal = ownWidthMapRef.current[curIdLocal] ?? (dims[curIdLocal]?.w ?? 0);
          const nextTotalWLocal = totalWidthMapRef.current[nextIdLocal] ?? (() => {
            let width = dims[nextIdLocal]?.w ?? 0;
            const visitedL = new Set<string>();
            let currentL = nextIdLocal;
            while (!visitedL.has(currentL)) {
              visitedL.add(currentL);
              const kidsL = parentToChildren[currentL] || [];
              if (kidsL.length !== 1) break;
              const childL = kidsL[0];
              const linkL = computeLinkDistanceForParent(currentL);
              width += linkL + (dims[childL]?.w ?? 0);
              currentL = childL;
            }
            return width;
          })();
          if (curOwnWLocal >= nextTotalWLocal) {
            const curTotalHLocal = totalHeightMapRef.current[curIdLocal] ?? (dims[curIdLocal]?.h ?? 0);
            const curOwnHLocal = ownHeightMapRef.current[curIdLocal] ?? (dims[curIdLocal]?.h ?? 0);
            const deltaLocal = 0.5 * Math.max(0, curTotalHLocal - curOwnHLocal);
            if (deltaLocal > 0) {
              const passingIdx: number[] = [];
              let failedLocal = false;
              for (let k = nextIdxLocal; k < localChildren.length; k++) {
                const kid = localChildren[k];
                const kidTotalW = totalWidthMapRef.current[kid] ?? (() => {
                  let width = dims[kid]?.w ?? 0;
                  const visitedL = new Set<string>();
                  let currentL = kid;
                  while (!visitedL.has(currentL)) {
                    visitedL.add(currentL);
                    const kidsL = parentToChildren[currentL] || [];
                    if (kidsL.length !== 1) break;
                    const childL = kidsL[0];
                    const linkL = computeLinkDistanceForParent(currentL);
                    width += linkL + (dims[childL]?.w ?? 0);
                    currentL = childL;
                  }
                  return width;
                })();
                const kidHasChildren = (parentToChildren[kid] || []).length > 0;
                if (!kidHasChildren || curOwnWLocal >= kidTotalW) passingIdx.push(k); else { failedLocal = true; break; }
              }
              const appliedLocal = failedLocal ? (deltaLocal) : deltaLocal;
              for (const idx of passingIdx) offsetsLocal[idx] -= appliedLocal;
              if (failedLocal && passingIdx.length > 0) {
                const failIdx = nextIdxLocal + passingIdx.length;
                let combinedLocal = 0;
                for (let t = 0; t < passingIdx.length - 1; t++) combinedLocal += effectiveHeightsLocal[passingIdx[t]];
                combinedLocal += GAP * Math.max(0, passingIdx.length - 1);
                for (let j = failIdx; j < localChildren.length; j++) offsetsLocal[j] -= combinedLocal;
              }
            }
          } else {
            const curChildrenLocal = parentToChildren[curIdLocal] || [];
            let maxChildOwnWLocal = 0;
            for (const ch of curChildrenLocal) {
              const w = ownWidthMapRef.current[ch] ?? (dims[ch]?.w ?? 0);
              if (w > maxChildOwnWLocal) maxChildOwnWLocal = w;
            }
            const extendedCapacityLocal = curOwnWLocal + computeLinkDistanceForParent(curIdLocal) + maxChildOwnWLocal;
            if (extendedCapacityLocal >= nextTotalWLocal) {
              // delta based on current's children combined height
              let combinedChildrenHLocal = 0;
              if (curChildrenLocal.length > 0) {
                // sum totals + gaps
                for (const ch of curChildrenLocal) combinedChildrenHLocal += (totalHeightMapRef.current[ch] ?? (dims[ch]?.h ?? 0));
                combinedChildrenHLocal += GAP * Math.max(0, curChildrenLocal.length - 1);
              }
              const curTotalHLocal = totalHeightMapRef.current[curIdLocal] ?? (dims[curIdLocal]?.h ?? 0);
              const deltaLocal = 0.5 * Math.max(0, curTotalHLocal - combinedChildrenHLocal);
              if (deltaLocal > 0) {
                const passingIdx: number[] = [];
                let failedLocal = false;
                for (let k = nextIdxLocal; k < localChildren.length; k++) {
                  const kid = localChildren[k];
                  const kidTotalW = totalWidthMapRef.current[kid] ?? (() => {
                    let width = dims[kid]?.w ?? 0;
                    const visitedL = new Set<string>();
                    let currentL = kid;
                    while (!visitedL.has(currentL)) {
                      visitedL.add(currentL);
                      const kidsL = parentToChildren[currentL] || [];
                      if (kidsL.length !== 1) break;
                      const childL = kidsL[0];
                      const linkL = computeLinkDistanceForParent(currentL);
                      width += linkL + (dims[childL]?.w ?? 0);
                      currentL = childL;
                    }
                    return width;
                  })();
                  const kidHasChildren = (parentToChildren[kid] || []).length > 0;
                  if (!kidHasChildren || extendedCapacityLocal >= kidTotalW) passingIdx.push(k); else { failedLocal = true; break; }
                }
                for (const idx of passingIdx) offsetsLocal[idx] -= deltaLocal;
                if (failedLocal && passingIdx.length > 0) {
                  const failIdx = nextIdxLocal + passingIdx.length;
                  let combinedLocal = 0;
                  for (let t = 0; t < passingIdx.length - 1; t++) combinedLocal += effectiveHeightsLocal[passingIdx[t]];
                  combinedLocal += GAP * Math.max(0, passingIdx.length - 1);
                  for (let j = failIdx; j < localChildren.length; j++) offsetsLocal[j] -= combinedLocal;
                }
              }
            }
          }
        }
      }
      // compute span using own heights with offsets
      let minTopLocal = Infinity, maxBottomLocal = -Infinity;
      for (let i = 0; i < localChildren.length; i++) {
        const cid = localChildren[i];
        const center = baseTargetsLocal[i] + (offsetsLocal[i] || 0);
        const ownH = ownHeightMapRef.current[cid] ?? (dims[cid]?.h ?? 0);
        const top = center - ownH / 2;
        const bottom = center + ownH / 2;
        if (top < minTopLocal) minTopLocal = top;
        if (bottom > maxBottomLocal) maxBottomLocal = bottom;
      }
      return Math.max(0, maxBottomLocal - minTopLocal);
    };

    // Per-parent dynamic link distance helper
    const computeLinkDistanceForParent = (parentIdLocal: string): number => {
      const extent = computeImmediateChildrenCombinedExtent(parentIdLocal);
      return Math.max(120, extent * 0.25);
    };

    // Directed graph for alignment
    const outDir: Record<string, string[]> = {};
    const inDir: Record<string, string[]> = {};
    const indeg: Record<string, number> = {};
    graphNodes.forEach((n: any) => { outDir[n.id] = []; inDir[n.id] = []; indeg[n.id] = 0; });
    edges.forEach((e: any) => {
      const s = String(e.source);
      const t = String(e.target);
      outDir[s].push(t);
      inDir[t].push(s);
      indeg[t] = (indeg[t] || 0) + 1;
    });
    // BFS to compute level starting from roots (indegree 0)
    const level: Record<string, number> = {};
    const q: string[] = [];
    graphNodes.forEach((n: any) => { if ((indeg[n.id] || 0) === 0) { level[n.id] = 0; q.push(n.id); } });
    while (q.length) {
      const u = q.shift() as string;
      const l = level[u];
      (outDir[u] || []).forEach(v => { if (!(v in level)) { level[v] = l + 1; q.push(v); } });
    }

    // Cache node dimensions for anchor calculations
    const dims: Record<string, { w: number; h: number; type?: string }> = {};
    graphNodes.forEach((n: any) => {
      const fallbackW = n.type === 'ghost' ? 140 : 520;
      const fallbackH = n.type === 'ghost' ? 40 : 160;
      // React Flow will populate width/height after measurement; fall back if undefined
      const w = (n as any).width ?? fallbackW;
      const h = (n as any).height ?? fallbackH;
      dims[n.id] = { w, h, type: n.type };
    });

    // Use cached children map for stacking
    const parentToChildren: Record<string, string[]> = parentToChildrenRef.current;

  // anchorPoint helper was unused; removed to satisfy lint

    const step = () => {
      if (graphNodes.length === 0) return;
      const cx = worldCenter.x;
      const cy = worldCenter.y;
      // reset targets each frame (only when debugging)
      if (DEBUG_SHOW_TARGETS) targetCentersRef.current = {};

      // Totals are precomputed outside the frame; nothing to do here

      // compute and smooth toward target centers only
      let frameMaxDelta = 0;

      // Helper: compute the horizontal chain width from a node following
      // consecutive single-child links, adding LINK_DISTANCE between nodes.
      const computeChainWidth = (startId: string): number => {
        let width = dims[startId]?.w ?? 0;
        const visited = new Set<string>();
        let current = startId;
        while (!visited.has(current)) {
          visited.add(current);
          const kids = parentToChildren[current] || [];
          if (kids.length !== 1) break;
          const child = kids[0];
          const link = computeLinkDistanceForParent(current);
          width += link + (dims[child]?.w ?? 0);
          current = child;
        }
        return width;
      };
      // Recursive capacity using own widths: own + LINK_DISTANCE + max(child capacity)
      const computeRecursiveOwnCapacity = (id: string): number => {
        const ownW = ownWidthMapRef.current[id] ?? (dims[id]?.w ?? 0);
        const kids = parentToChildren[id] || [];
        if (kids.length === 0) return ownW;
        let maxChildCap = 0;
        for (const k of kids) {
          const cap = computeRecursiveOwnCapacity(k);
          if (cap > maxChildCap) maxChildCap = cap;
        }
        const link = computeLinkDistanceForParent(id);
        return ownW + link + maxChildCap;
      };
      // Helper: compute combined height span of a node's immediate children using the same
      // stacking/offset rules (without re-centering), measured using own heights after offsets
      const computeImmediateChildrenCombinedExtent = (parentIdLocal: string): number => {
        const localChildren = parentToChildren[parentIdLocal] || [];
        if (localChildren.length === 0) return 0;
        const GAP = GAP_BETWEEN_SIBLINGS;
        const effectiveHeightsLocal: number[] = localChildren.map(cid => (
          totalHeightMapRef.current[cid] ?? (dims[cid]?.h ?? 0)
        ));
        const baseTargetsLocal: number[] = new Array(localChildren.length);
        let beforeLocal = 0;
        const totalHLocal = effectiveHeightsLocal.reduce((a, b) => a + b, 0) + GAP * Math.max(0, localChildren.length - 1);
        for (let i = 0; i < localChildren.length; i++) {
          const slotH = effectiveHeightsLocal[i];
          baseTargetsLocal[i] = -totalHLocal / 2 + beforeLocal + slotH / 2;
          beforeLocal += effectiveHeightsLocal[i] + (i < localChildren.length - 1 ? GAP : 0);
        }
        const offsetsLocal: number[] = new Array(localChildren.length).fill(0);
        for (let i = 0; i < localChildren.length - 1; i++) {
          const curIdLocal = localChildren[i];
          const nextIdxLocal = i + 1;
          const nextIdLocal = localChildren[nextIdxLocal];
          const nextKidsLocal = parentToChildren[nextIdLocal] || [];
          const curKidsLocal = parentToChildren[curIdLocal] || [];
          if (nextKidsLocal.length === 0 && curKidsLocal.length === 0) continue;
          const curTotalWLocal = totalWidthMapRef.current[curIdLocal] ?? computeChainWidth(curIdLocal);
          const nextOwnWLocal = ownWidthMapRef.current[nextIdLocal] ?? (dims[nextIdLocal]?.w ?? 0);
          if (nextOwnWLocal >= curTotalWLocal) {
            const nextTotalHLocal = totalHeightMapRef.current[nextIdLocal] ?? (dims[nextIdLocal]?.h ?? 0);
            const nextOwnHLocal = ownHeightMapRef.current[nextIdLocal] ?? (dims[nextIdLocal]?.h ?? 0);
            const deltaLocal = 0.5 * Math.max(0, nextTotalHLocal - nextOwnHLocal);
            if (deltaLocal > 0) {
              const passingIdx: number[] = [];
              let failedLocal = false;
              for (let k = nextIdxLocal; k < localChildren.length; k++) {
                const kid = localChildren[k];
                const kidOwnW = ownWidthMapRef.current[kid] ?? (dims[kid]?.w ?? 0);
                if (kidOwnW >= curTotalWLocal) passingIdx.push(k); else { failedLocal = true; break; }
              }
              const appliedLocal = failedLocal ? (deltaLocal) : deltaLocal;
              for (const idx of passingIdx) offsetsLocal[idx] -= appliedLocal;
              if (failedLocal && passingIdx.length > 0) {
                const failIdx = nextIdxLocal + passingIdx.length;
                let combinedLocal = 0;
                for (let t = 0; t < passingIdx.length - 1; t++) combinedLocal += effectiveHeightsLocal[passingIdx[t]];
                combinedLocal += GAP * Math.max(0, passingIdx.length - 1);
                for (let j = failIdx; j < localChildren.length; j++) offsetsLocal[j] -= combinedLocal;
              }
            }
          } else {
            const curOwnWLocal = ownWidthMapRef.current[curIdLocal] ?? (dims[curIdLocal]?.w ?? 0);
            const nextTotalWLocal = totalWidthMapRef.current[nextIdLocal] ?? (() => {
              let width = dims[nextIdLocal]?.w ?? 0;
              const visitedL = new Set<string>();
              let currentL = nextIdLocal;
              while (!visitedL.has(currentL)) {
                visitedL.add(currentL);
                const kidsL = parentToChildren[currentL] || [];
                if (kidsL.length !== 1) break;
                const childL = kidsL[0];
                const linkL = computeLinkDistanceForParent(currentL);
                width += linkL + (dims[childL]?.w ?? 0);
                currentL = childL;
              }
              return width;
            })();
            if (curOwnWLocal >= nextTotalWLocal) {
              const curTotalHLocal = totalHeightMapRef.current[curIdLocal] ?? (dims[curIdLocal]?.h ?? 0);
              const curOwnHLocal = ownHeightMapRef.current[curIdLocal] ?? (dims[curIdLocal]?.h ?? 0);
              const deltaLocal = 0.5 * Math.max(0, curTotalHLocal - curOwnHLocal);
              if (deltaLocal > 0) {
                const passingIdx: number[] = [];
                let failedLocal = false;
                for (let k = nextIdxLocal; k < localChildren.length; k++) {
                  const kid = localChildren[k];
                  const kidTotalW = totalWidthMapRef.current[kid] ?? computeChainWidth(kid);
                  if (curOwnWLocal >= kidTotalW) passingIdx.push(k); else { failedLocal = true; break; }
                }
                const appliedLocal = failedLocal ? (deltaLocal) : deltaLocal;
                for (const idx of passingIdx) offsetsLocal[idx] -= appliedLocal;
                if (failedLocal && passingIdx.length > 0) {
                  const failIdx = nextIdxLocal + passingIdx.length;
                  let combinedLocal = 0;
                  for (let t = 0; t < passingIdx.length - 1; t++) combinedLocal += effectiveHeightsLocal[passingIdx[t]];
                  combinedLocal += GAP * Math.max(0, passingIdx.length - 1);
                  for (let j = failIdx; j < localChildren.length; j++) offsetsLocal[j] -= combinedLocal;
                }
              }
            } else {
              const curChildrenLocal = parentToChildren[curIdLocal] || [];
              let maxChildOwnWLocal = 0;
              for (const ch of curChildrenLocal) {
                const w = ownWidthMapRef.current[ch] ?? (dims[ch]?.w ?? 0);
                if (w > maxChildOwnWLocal) maxChildOwnWLocal = w;
              }
              const extendedCapacityLocal = curOwnWLocal + computeLinkDistanceForParent(curIdLocal) + maxChildOwnWLocal;
              if (extendedCapacityLocal >= nextTotalWLocal) {
                // delta based on current's children combined height
                // compute combined height of curIdLocal's immediate children (recursively not needed here)
                let combinedChildrenHLocal = 0;
                if (curChildrenLocal.length > 0) {
                  // sum totals + gaps
                  for (const ch of curChildrenLocal) combinedChildrenHLocal += (totalHeightMapRef.current[ch] ?? (dims[ch]?.h ?? 0));
                  combinedChildrenHLocal += GAP * Math.max(0, curChildrenLocal.length - 1);
                }
                const curTotalHLocal = totalHeightMapRef.current[curIdLocal] ?? (dims[curIdLocal]?.h ?? 0);
                const deltaLocal = 0.5 * Math.max(0, curTotalHLocal - combinedChildrenHLocal);
                if (deltaLocal > 0) {
                  const passingIdx: number[] = [];
                  let failedLocal = false;
                  for (let k = nextIdxLocal; k < localChildren.length; k++) {
                    const kid = localChildren[k];
                  const kidTotalW = totalWidthMapRef.current[k] ?? (() => {
                    let width = dims[kid]?.w ?? 0;
                    const visitedL = new Set<string>();
                    let currentL = kid;
                    while (!visitedL.has(currentL)) {
                      visitedL.add(currentL);
                      const kidsL = parentToChildren[currentL] || [];
                      if (kidsL.length !== 1) break;
                      const childL = kidsL[0];
                      const linkL = computeLinkDistanceForParent(currentL);
                      width += linkL + (dims[childL]?.w ?? 0);
                      currentL = childL;
                    }
                    return width;
                  })();
                    if (extendedCapacityLocal >= kidTotalW) passingIdx.push(k); else { failedLocal = true; break; }
                  }
                  for (const idx of passingIdx) offsetsLocal[idx] -= deltaLocal;
                  if (failedLocal && passingIdx.length > 0) {
                    const failIdx = nextIdxLocal + passingIdx.length;
                    let combinedLocal = 0;
                    for (let t = 0; t < passingIdx.length - 1; t++) combinedLocal += effectiveHeightsLocal[passingIdx[t]];
                    combinedLocal += GAP * Math.max(0, passingIdx.length - 1);
                    for (let j = failIdx; j < localChildren.length; j++) offsetsLocal[j] -= combinedLocal;
                  }
                }
              }
            }
          }
        }
        // compute span using own heights with offsets
        let minTopLocal = Infinity, maxBottomLocal = -Infinity;
        for (let i = 0; i < localChildren.length; i++) {
          const cid = localChildren[i];
          const center = baseTargetsLocal[i] + (offsetsLocal[i] || 0);
          const ownH = ownHeightMapRef.current[cid] ?? (dims[cid]?.h ?? 0);
          const top = center - ownH / 2;
          const bottom = center + ownH / 2;
          if (top < minTopLocal) minTopLocal = top;
          if (bottom > maxBottomLocal) maxBottomLocal = bottom;
        }
        return Math.max(0, maxBottomLocal - minTopLocal);
      };
      // Precompute per-parent child target Y positions using total subtree heights only
      const parentChildTargetY: Record<string, Record<string, number>> = {};
      const GAP_BETWEEN_SIBLINGS = 12;
      const parents = Object.keys(parentToChildren);
      for (const parentId of parents) {
        const childList = parentToChildren[parentId] || [];
        if (childList.length === 0) continue;
        // Prefer the parent's desired target center Y so children don't flicker when parent is moved
        const desiredParentCenterY = desiredTargetsRef.current[parentId]?.y;
        const parentPos = (() => {
          const isDragged = draggedIdsRef.current.has(parentId);
          const isRootDrag = draggingRootIdsRef.current.has(parentId);
          if (isDragged && !isRootDrag) return frozenPosDuringDragRef.current[parentId] || posRef.current[parentId];
          return posRef.current[parentId];
        })();
        const parentH = dims[parentId]?.h ?? 0;
        if (!parentPos && typeof desiredParentCenterY !== 'number') continue;
        const parentCenterY = typeof desiredParentCenterY === 'number' ? desiredParentCenterY : (parentPos!.y + parentH / 2);

        // Effective heights: always use TOTAL subtree heights for distribution
        const effectiveHeights: number[] = childList.map(cid => (
          totalHeightMapRef.current[cid] ?? (dims[cid]?.h ?? 0)
        ));

        // Total height and base per-child target centers using the effective slot height for centering
        const totalHeight = effectiveHeights.reduce((a, b) => a + b, 0) + GAP_BETWEEN_SIBLINGS * Math.max(0, childList.length - 1);
        const baseTargets: number[] = new Array(childList.length);
        let before = 0;
        for (let i = 0; i < childList.length; i++) {
          const slotH = effectiveHeights[i];
          baseTargets[i] = parentCenterY - totalHeight / 2 + before + slotH / 2;
          before += effectiveHeights[i] + (i < childList.length - 1 ? GAP_BETWEEN_SIBLINGS : 0);
        }

        // Node-driven offsets (forward-only, additive)
        const offsets: number[] = new Array(childList.length).fill(0);
        for (let i = 0; i < childList.length - 1; i++) {
          const curId = childList[i];
          const nextIdx = i + 1;
          const nextId = childList[nextIdx];
          // Act if either current or next node has children (non-exclusive)
          const nextKids = parentToChildren[nextId] || [];
          const curKids = parentToChildren[curId] || [];
          if (nextKids.length === 0 && curKids.length === 0) continue;

          const curTotalW = totalWidthMapRef.current[curId] ?? computeChainWidth(curId);
          const nextOwnW = ownWidthMapRef.current[nextId] ?? (dims[nextId]?.w ?? 0);

          if (nextOwnW >= curTotalW) {
            // Next can fit current's chain: move NEXT (and subsequent fitting nodes) up by its own overhang
            const nextTotalH = totalHeightMapRef.current[nextId] ?? (dims[nextId]?.h ?? 0);
            const nextOwnH = ownHeightMapRef.current[nextId] ?? (dims[nextId]?.h ?? 0);
            const delta = 0.5 * Math.max(0, nextTotalH - nextOwnH);
            if (delta > 0) {
              const passing: number[] = [];
              let failed = false;
              for (let k = nextIdx; k < childList.length; k++) {
                const kid = childList[k];
                const kidOwnW = ownWidthMapRef.current[kid] ?? (dims[kid]?.w ?? 0);
                const kidHasChildren = (parentToChildren[kid] || []).length > 0;
                if (!kidHasChildren || kidOwnW >= curTotalW) {
                  passing.push(k);
                } else {
                  failed = true;
                  break;
                }
              }
              const applied = failed ? (delta) : delta;
              for (const idx of passing) offsets[idx] -= applied;
              // If a failure occurred, apply combined total height (of passing nodes) to failing and subsequent nodes
              if (failed && passing.length > 0) {
                const failIdx = nextIdx + passing.length;
                let combined = 0;
                for (let t = 0; t < passing.length - 1; t++) {
                  combined += effectiveHeights[passing[t]];
                }
                combined += GAP_BETWEEN_SIBLINGS * Math.max(0, passing.length - 1);
                for (let j = failIdx; j < childList.length; j++) offsets[j] -= combined;
              }
            }
          } else {
            // Reverse check: can CURRENT fit NEXT's chain?
            const curOwnW = ownWidthMapRef.current[curId] ?? (dims[curId]?.w ?? 0);
            const nextTotalW = totalWidthMapRef.current[nextId] ?? computeChainWidth(nextId);
            if (curOwnW >= nextTotalW) {
              const curTotalH = totalHeightMapRef.current[curId] ?? (dims[curId]?.h ?? 0);
              const curOwnH = ownHeightMapRef.current[curId] ?? (dims[curId]?.h ?? 0);
              const delta = 0.5 * Math.max(0, curTotalH - curOwnH);
              if (delta > 0) {
                const passing: number[] = [];
                let failed = false;
                for (let k = nextIdx; k < childList.length; k++) {
                  const kid = childList[k];
                  const kidTotalW = totalWidthMapRef.current[kid] ?? computeChainWidth(kid);
                  const kidHasChildren = (parentToChildren[kid] || []).length > 0;
                  if (!kidHasChildren || curOwnW >= kidTotalW) {
                    passing.push(k);
                  } else {
                    failed = true;
                    break;
                  }
                }
                const applied = failed ? (delta) : delta;
                for (const idx of passing) offsets[idx] -= applied;
                if (failed && passing.length > 0) {
                  const failIdx = nextIdx + passing.length;
                  let combined = 0;
                  for (let t = 0; t < passing.length - 1; t++) {
                    combined += effectiveHeights[passing[t]];
                  }
                  combined += GAP_BETWEEN_SIBLINGS * Math.max(0, passing.length - 1);
                  for (let j = failIdx; j < childList.length; j++) offsets[j] -= combined;
                }
              }
            } else {
              // Extended capacity: recursively include deeper widths if needed
              // const curChildren = parentToChildren[curId] || [];
              const extendedCapacity = computeRecursiveOwnCapacity(curId);
              if (extendedCapacity >= nextTotalW) {
                // Move by current total height minus combined extent of children (with offsets), recursively deep
                const combinedChildrenH = (() => {
                  // Try deepest possible fit by recursing children for extent if needed
                  const tryExtent = (nodeId: string): number => {
                    const kids = parentToChildren[nodeId] || [];
                    if (kids.length === 0) return 0;
                    // compute local extent using immediate children rules
                    const local = computeImmediateChildrenCombinedExtent(nodeId);
                    // If local width capacity still insufficient upstream, deeper layers will be considered
                    return local;
                  };
                  return tryExtent(curId);
                })();
                const curTotalH = totalHeightMapRef.current[curId] ?? (dims[curId]?.h ?? 0);
                const delta = 0.5 * Math.max(0, curTotalH - combinedChildrenH);
                if (delta > 0) {
                  const passing: number[] = [];
                  let failed = false;
                  for (let k = nextIdx; k < childList.length; k++) {
                    const kid = childList[k];
                    const kidTotalW = totalWidthMapRef.current[kid] ?? computeChainWidth(kid);
                    const kidHasChildren = (parentToChildren[kid] || []).length > 0;
                    if (!kidHasChildren || extendedCapacity >= kidTotalW) {
                      passing.push(k);
                    } else {
                      failed = true;
                      break;
                    }
                  }
                  const applied = delta;
                  for (const idx of passing) offsets[idx] -= applied;
                  if (failed && passing.length > 0) {
                    const failIdx = nextIdx + passing.length;
                    let combined = 0;
                    for (let t = 0; t < passing.length - 1; t++) {
                      combined += effectiveHeights[passing[t]];
                    }
                    combined += GAP_BETWEEN_SIBLINGS * Math.max(0, passing.length - 1);
                    for (let j = failIdx; j < childList.length; j++) offsets[j] -= combined;
                  }
                }
              }
            }
          }
        }

        // Compute adjusted group extent after offsets to keep centered on parent
        let minTop = Infinity;
        let maxBottom = -Infinity;
        for (let i = 0; i < childList.length; i++) {
          const center = baseTargets[i] + (offsets[i] || 0);
          const slotH = effectiveHeights[i];
          const top = center - slotH / 2;
          const bottom = center + slotH / 2;
          if (top < minTop) minTop = top;
          if (bottom > maxBottom) maxBottom = bottom;
        }
        // Recompute group bounds using ONLY direct children's own heights for centering
        minTop = Infinity;
        maxBottom = -Infinity;
        for (let i = 0; i < childList.length; i++) {
          const cid = childList[i];
          const center = baseTargets[i] + (offsets[i] || 0);
          const ownH = ownHeightMapRef.current[cid] ?? (dims[cid]?.h ?? 0);
          const top = center - ownH / 2;
          const bottom = center + ownH / 2;
          if (top < minTop) minTop = top;
          if (bottom > maxBottom) maxBottom = bottom;
        }
        // Shift all children so their mid aligns with parentCenterY, based on own heights only
        const groupCenter = (minTop + maxBottom) / 2;
        const shiftY = parentCenterY - groupCenter;

        // Apply offsets plus centering shift to base targets and materialize map
        const targets: Record<string, number> = {};
        for (let i = 0; i < childList.length; i++) {
          const cid = childList[i];
          targets[cid] = baseTargets[i] + (offsets[i] || 0) + shiftY;
        }
        parentChildTargetY[parentId] = targets;
      }

      for (const n of graphNodes as Node[]) {
        const id = n.id;
        if (draggedIdsRef.current.has(id)) continue;
        const p = posRef.current[id];
        // Desired X from parents
        const incomers = inDir[id];
        if (incomers && incomers.length > 0) {
          let desiredXSum = 0; let xCount = 0;
          let desiredYSum = 0; let yCount = 0;
          for (const srcId of incomers) {
            const srcDesiredCenterX = desiredTargetsRef.current[srcId]?.x;
            const sp = (() => {
              const isDragged = draggedIdsRef.current.has(srcId);
              const isRootDrag = draggingRootIdsRef.current.has(srcId);
              if (isDragged && !isRootDrag) return frozenPosDuringDragRef.current[srcId] || posRef.current[srcId];
              return posRef.current[srcId];
            })();
            const sw = dims[srcId]?.w ?? 0;
            const tw = dims[id]?.w ?? 0;
            if (!sp) continue;
            const srcCenterX = typeof srcDesiredCenterX === 'number' ? srcDesiredCenterX : (sp.x + sw / 2);
            const linkForSrc = computeLinkDistanceForParent(srcId);
            const tgtDesiredCenterX = srcCenterX + sw / 2 + tw / 2 + linkForSrc;
            desiredXSum += tgtDesiredCenterX; xCount++;
            const sh = dims[srcId]?.h ?? 0;
            desiredYSum += sp.y + sh / 2; yCount++;
          }
          if (xCount > 0 || yCount > 0) {
            const dw = dims[id]?.w ?? 0;
            const dh = dims[id]?.h ?? 0;
            const curCenterX = p.x + dw / 2;
            const curCenterY = p.y + dh / 2;
            const targetCenterX = xCount > 0 ? (desiredXSum / xCount) : cx;
            // Compute target Y: for nodes with exactly one parent, use the parent's precomputed stacking plan
            let targetCenterY: number;
            if (incomers.length === 1) {
              const parentId = incomers[0];
              const targets = parentChildTargetY[parentId];
              if (targets && id in targets) targetCenterY = targets[id];
              else targetCenterY = yCount > 0 ? (desiredYSum / yCount) : cy;
            } else {
              // Multi-parent or none: fall back to average of parents
              targetCenterY = yCount > 0 ? (desiredYSum / yCount) : cy;
            }
            // store desired target center (persisted)
            desiredTargetsRef.current[id] = { x: targetCenterX, y: targetCenterY };
            if (DEBUG_SHOW_TARGETS) targetCentersRef.current[id] = { x: targetCenterX, y: targetCenterY };
            const nx = curCenterX + (targetCenterX - curCenterX) * smoothingAlpha;
            const ny = curCenterY + (targetCenterY - curCenterY) * smoothingAlpha;
            const newX = nx - dw / 2;
            const newY = ny - dh / 2;
            frameMaxDelta = Math.max(frameMaxDelta, Math.abs(newX - p.x), Math.abs(newY - p.y));
            posRef.current[id] = { x: newX, y: newY };
          } else {
            // roots
            const dw = dims[id]?.w ?? 0;
            const dh = dims[id]?.h ?? 0;
            const curCenterX = p.x + dw / 2;
            const curCenterY = p.y + dh / 2;
            // If this root was pinned by user, keep where they placed it (no drift)
            if (pinnedRootIdsRef.current.has(id)) {
              // optionally expose target marker at current center when debugging
              if (DEBUG_SHOW_TARGETS) {
                const [tx, ty, tz] = transformRef.current || [0, 0, 1];
                const paneX = (curCenterX - tx) / tz;
                const paneY = (curCenterY - ty) / tz;
                targetCentersRef.current[id] = { x: paneX, y: paneY };
              }
              // do not modify posRef.current[id]
            } else {
              // gently drift toward center for unpinned roots
              if (DEBUG_SHOW_TARGETS) {
                const [tx, ty, tz] = transformRef.current || [0, 0, 1];
                const paneX = (cx - tx) / tz;
                const paneY = (cy - ty) / tz;
                targetCentersRef.current[id] = { x: paneX, y: paneY };
                desiredTargetsRef.current[id] = { x: paneX, y: paneY };
              }
              const nx = curCenterX + (cx - curCenterX) * smoothingAlpha * 0.5;
              const ny = curCenterY + (cy - curCenterY) * smoothingAlpha * 0.5;
              const newX = nx - dw / 2;
              const newY = ny - dh / 2;
              frameMaxDelta = Math.max(frameMaxDelta, Math.abs(newX - p.x), Math.abs(newY - p.y));
              posRef.current[id] = { x: newX, y: newY };
            }
          }
        }
        // end per-node processing
      }

      // Only update nodes whose positions actually changed beyond a small epsilon.
      setGraphNodes((prev: Node[]) => {
        let anyChanged = false;
        const EPS = 0.01;
        const next = prev.map((n: any) => {
          if (draggedIdsRef.current.has(n.id)) return n;
          const target = posRef.current[n.id];
          const px = n.position?.x ?? 0;
          const py = n.position?.y ?? 0;
          if (Math.abs(px - target.x) < EPS && Math.abs(py - target.y) < EPS) return n;
          anyChanged = true;
          return { ...n, position: { x: target.x, y: target.y } };
        });
        return anyChanged ? next : prev;
      });

      // Stop animating when stable for a period; restart on any interaction/param change
      const isIdle = frameMaxDelta < 0.05 && !totalsDirtyRef.current && draggedIdsRef.current.size === 0;
      if (isIdle) idleFramesRef.current += 1; else idleFramesRef.current = 0;
      if (idleFramesRef.current > 30) {
        // Persist layout once when we settle, avoiding frequent writes during interaction
        try { saveLayoutCache(); } catch (_e) { /* ignore */ }
        animFrameRef.current = null;
        return;
      }
      animFrameRef.current = requestAnimationFrame(step);
    };

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(step);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; };
  }, [graphNodes, edges, setGraphNodes, smoothingAlpha, worldCenter, simTick, isLayoutHydrated, isSimDelayElapsed, saveLayoutCache, DEBUG_SHOW_TARGETS]);

  // Restart relaxation after a drag completes; provide smaller runs during drag
  const handleNodeDragStart = useCallback((_e: any, node: Node) => {
    isDraggingAnyRef.current = true;
    draggedIdsRef.current.add(node.id);
    // determine if node has parents (incoming edges)
    const hasParents = (edges as any[]).some((e: any) => String(e.target) === node.id);
    if (!hasParents) draggingRootIdsRef.current.add(node.id); else draggingRootIdsRef.current.delete(node.id);
    // snapshot positions to freeze layout during non-root drags
    frozenPosDuringDragRef.current = { ...posRef.current };
    // sync ref pos
    posRef.current[node.id] = { x: node.position.x, y: node.position.y };
    velRef.current[node.id] = { vx: 0, vy: 0 };
    // record drag start position for click-threshold detection
    const start = posRef.current[node.id];
    if (start) dragStartPosRef.current[node.id] = { x: start.x, y: start.y };
  }, [edges]);

  const handleNodeDrag = useCallback((_e: any, node: Node) => {
    // Avoid running the whole simulation; just track the latest drag position in refs
    posRef.current[node.id] = { x: node.position.x, y: node.position.y };
  }, []);

  const focusScene = useCallback((logicalId: string, duration: number = 1100) => {
    try {
      const candidates = (graphNodes as any[]).filter(n => (n as any).data?.id === logicalId);
      let target = candidates.find(n => !String(n.id).startsWith('dup:'))
        || candidates.find(n => Array.isArray((n as any).data?.options) && (n as any).data.options.length > 0)
        || (candidates[0] as any);
      if (!target) return;
      const targetId = String((target as any).id);
      const pos = posRef.current[targetId];
      const w = (target as any).width ?? ((target as any).type === 'ghost' ? 140 : 520);
      const h = (target as any).height ?? ((target as any).type === 'ghost' ? 40 : 160);
      if (!pos) return;
      const centerX = pos.x + w / 2;
      const centerY = pos.y + h / 2;
      flowInstanceRef.current?.setCenter(centerX, centerY, { zoom: 1, duration });
    } catch {}
  }, [graphNodes]);

  const handleNodeDragStop = useCallback((_e: any, node: Node) => {
    draggedIdsRef.current.delete(node.id);
    isDraggingAnyRef.current = false;
    lastDragTsRef.current = Date.now();
    const wasRootDrag = draggingRootIdsRef.current.has(node.id);
    draggingRootIdsRef.current.delete(node.id);
    // If user moved a root, pin it so it doesn't drift back
    if (wasRootDrag) pinnedRootIdsRef.current.add(node.id);
    // clear snapshot if no more drags
    if (draggedIdsRef.current.size === 0) frozenPosDuringDragRef.current = {};
    // Always accept current drop position as the starting point for smoothing back
    posRef.current[node.id] = { x: node.position.x, y: node.position.y };
    // If movement was below threshold, treat as a click selection
    try {
      const start = dragStartPosRef.current[node.id];
      const end = posRef.current[node.id];
      if (start && end) {
        const dx = end.x - start.x; const dy = end.y - start.y;
        const dist = Math.hypot(dx, dy);
        if (dist < CLICK_DRAG_THRESHOLD) {
          const logicalId = (node as any).data?.id as string | undefined;
          if (logicalId) {
            setSelectedSceneId(logicalId);
            focusScene(logicalId, 600);
          }
        }
      }
    } catch {}
    // kick the simulator to settle after a drag
    setSimTick(v => v + 1);
    // Only cache after root drag; non-root drags should not update saved positions
    if (wasRootDrag) {
      // Persist the orphan's new location immediately
      saveLayoutCache();
    }
  }, [saveLayoutCache, focusScene]);

  const handleNodeClick = useCallback((e: any, node: Node) => {
    const logicalId = (node as any).data?.id as string | undefined;
    if (!logicalId) return;
    setSelectedSceneId(logicalId);
    focusScene(logicalId, 600);
  }, [focusScene]);

  const displayNodes = useMemo(() => {
    if (!graphNodes) return [] as any[];
    const prevHovered = prevHoveredSceneIdRef.current;
    if (!SHOW_NODE_DEBUG) {
      // Fast path: only update nodes whose hover state changed
      return (graphNodes as any[]).map(n => {
        const logicalSceneId = (n as any).data?.id as string | undefined;
        const nowHovered = !!logicalSceneId && hoveredSceneId === logicalSceneId;
        const wasHovered = !!logicalSceneId && prevHovered === logicalSceneId;
        const isSelected = !!logicalSceneId && selectedSceneId === logicalSceneId;
        if (!nowHovered && !wasHovered && !isSelected && !(n as any).data?.isSelected) return n;
        return {
          ...n,
          data: { ...(n.data || {}), isHovered: nowHovered, isSelected },
          style: nowHovered || isSelected ? { ...(n.style || {}), zIndex: 2 } : n.style,
        } as any;
      });
    }
    // Debug path: compute overlays only when debugging is enabled
    const dimsLocal: Record<string, { w: number; h: number; type?: string }> = {};
    (graphNodes as any[]).forEach((n: any) => {
      const fallbackW = n.type === 'ghost' ? 140 : 520;
      const fallbackH = n.type === 'ghost' ? 40 : 160;
      const w = (n as any).width ?? fallbackW;
      const h = (n as any).height ?? fallbackH;
      dimsLocal[n.id] = { w, h, type: n.type };
    });
    const mapping = parentToChildrenRef.current;
    const computeChainWidthDisplay = (startId: string): number => {
      // Use cached total width if available for consistency with layout math
      const cached = totalWidthMapRef.current[startId];
      if (typeof cached === 'number') return cached;
      let width = dimsLocal[startId]?.w ?? 0;
      const visited = new Set<string>();
      let current = startId;
      while (!visited.has(current)) {
        visited.add(current);
        const kids = mapping[current] || [];
        if (kids.length !== 1) break;
        const child = kids[0];
        // Mirror dynamic link distance roughly for display using parent's children extent
        let sum = 0;
        for (const k of kids) sum += (totalHeightMapRef.current[k] ?? (dimsLocal[k]?.h ?? 0));
        sum += 12 * Math.max(0, kids.length - 1);
        const link = Math.max(120, sum * 0.25);
        width += link + (dimsLocal[child]?.w ?? 0);
        current = child;
      }
      return width;
    };

    return (graphNodes as any[]).map(n => {
      const logicalSceneId = (n as any).data?.id as string | undefined;
      const isHovered = !!logicalSceneId && hoveredSceneId === logicalSceneId;
      const dimsH = (n as any).height ?? (n.type === 'ghost' ? 40 : 160);
      // read cached totals for debug overlay (throttled via debugVersion)
      const ownH = ownHeightMapRef.current[n.id] ?? dimsH;
      const totalH = totalHeightMapRef.current[n.id] ?? ownH;
      const ownW = dimsLocal[n.id]?.w ?? (n.type === 'ghost' ? 140 : 520);
      const totalW = computeChainWidthDisplay(n.id);
      return {
        ...n,
        data: { ...(n.data || {}), isHovered, debugHeight: totalH, debugOwnHeight: ownH, debugTotalHeight: totalH, debugOwnWidth: ownW, debugTotalWidth: totalW },
        // slight wrapper elevation as a fallback (main styling handled inside node components)
        style: isHovered ? { ...(n.style || {}), zIndex: 2 } : n.style,
      } as any;
    });
  }, [graphNodes, hoveredSceneId, selectedSceneId]);

  if (!graph || graphNodes.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Card size="3" variant="surface" style={{ maxWidth: 600, textAlign: 'center' }}>
          <Heading size="6" mb="3">Conversation Graph</Heading>
          <Text size="3" color="gray">Load a dialogue .txt to visualize.</Text>
        </Card>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #2b2b2b', boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset' }}>
      {/* Physics control panel */}
      {/* Controls removed (no sliders). Smoothing and link distance are managed in code. */}
      <ReactFlowProvider>
        <ReactFlow
          nodes={displayNodes as any}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={handleNodeDragStart}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          onNodeClick={handleNodeClick}
          onNodeMouseEnter={(_e, node) => setHoveredSceneId((node as any).data?.id ?? null)}
          onNodeMouseLeave={(_e, node) => {
            const sceneId = (node as any).data?.id ?? null;
            setHoveredSceneId(prev => (prev === sceneId ? null : prev));
          }}
          nodeTypes={nodeTypes}
            minZoom={0.1}
          nodesDraggable
          style={{ backgroundColor: '#1e1e1e' }}
          onMove={(_evt, viewport) => {
            // Track viewport for correct math, but avoid expensive localStorage writes per-frame
            if (viewport) transformRef.current = [viewport.x, viewport.y, viewport.zoom];
          }}
          fitView={!hasCachedLayout}
          defaultViewport={hasCachedLayout && initialViewport ? initialViewport : undefined}
          proOptions={{ hideAttribution: true }}
          onlyRenderVisibleElements
          onInit={(instance) => {
            flowInstanceRef.current = instance as ReactFlowInstance;
            // hydrate any last targets into overlay if debug shows
            if (DEBUG_SHOW_TARGETS) targetCentersRef.current = { ...desiredTargetsRef.current };
          }}
          onNodeDoubleClick={(e, node) => {
            try {
              const logicalId = (node as any).data?.id as string | undefined;
              if (!logicalId) return;
              setSelectedSceneId(logicalId);
              focusScene(logicalId, 1000);
              try { onSelectScene?.(logicalId); } catch {}
            } catch {}
          }}
        >
          <Controls />
          <Background color="#333" gap={16} />
          <MiniMap style={{ backgroundColor: '#2a2a2a', borderRadius: 8, overflow: 'hidden' }} nodeColor="#666" maskColor="rgba(0, 0, 0, 0.5)" />
          {/* Overlay: target centers as red X markers (debug only, not influenced by physics) */}
          {DEBUG_SHOW_TARGETS && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
              {Object.entries(targetCentersRef.current).map(([id, c]) => {
                const [tx, ty, tz] = transformRef.current || [0, 0, 1];
                const sx = tx + c.x * tz;
                const sy = ty + c.y * tz;
                const size = 12;
                const half = size / 2;
                return (
                  <div key={`target-${id}`} style={{ position: 'absolute', left: sx - half, top: sy - half, width: size, height: size }}>
                    <div style={{ position: 'absolute', left: 0, top: half - 1, width: size, height: 2, background: 'red', transform: 'rotate(45deg)' }} />
                    <div style={{ position: 'absolute', left: 0, top: half - 1, width: size, height: 2, background: 'red', transform: 'rotate(-45deg)' }} />
                  </div>
                );
              })}
            </div>
          )}
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
};

export default EnhancedConversationGraph;


