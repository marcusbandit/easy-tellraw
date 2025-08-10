import React, { CSSProperties, useEffect, useMemo, useRef, useCallback, useState } from 'react';
import ReactFlow, { Background, Controls, Edge, MiniMap, Node, NodeTypes, Position, ReactFlowProvider, Handle, useEdgesState, useNodesState } from 'reactflow';
import 'reactflow/dist/style.css';
import { DialogueGraph } from '../../types/dialogue';
import { Card, Heading, Text } from '@radix-ui/themes';

interface ConversationGraphProps {
  graph: DialogueGraph | null;
}

type SceneLineData = { text: string; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; choices?: OptionData[] };
type OptionData = { id: string; label: string; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean };

const SceneNode: React.FC<{ data: { id: string; label: string; lines: SceneLineData[]; options: OptionData[]; isHovered?: boolean; debugHeight?: number; debugOwnHeight?: number; debugTotalHeight?: number } }> = ({ data }) => {
  return (
    <div style={{
      padding: '12px',
      borderRadius: 10,
      backgroundColor: data.isHovered ? '#333333' : '#2a2a2a',
      border: `1px solid ${data.isHovered ? '#aaaaaa' : '#444'}`,
      minWidth: 220,
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      columnGap: 12,
      boxShadow: data.isHovered ? '0 0 0 2px rgba(255,255,255,0.15)' : 'none',
      transition: 'border-color 120ms ease, box-shadow 120ms ease, background-color 120ms ease',
      textAlign: 'left',
      position: 'relative',
    }}>
      {(typeof data.debugOwnHeight === 'number' || typeof data.debugTotalHeight === 'number') && (
        <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: '#aaa', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {`Own: ${Math.round((data.debugOwnHeight ?? 0) as number)}, Total: ${Math.round((data.debugTotalHeight ?? data.debugHeight ?? 0) as number)}`}
        </div>
      )}
      {/* Center-left target handle ("in" anchor) */}
      <Handle type="target" position={Position.Left} id="in" style={{ left: -8, background: '#666', width: 10, height: 10, top: '50%', transform: 'translateY(-50%)' }} />
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{data.label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.lines.map((l, i) => {
            const baseStyle: CSSProperties = {
              color: l.color || '#c8c8c8',
              fontSize: 12,
              fontWeight: l.bold ? 700 : 400,
              fontStyle: l.italic ? 'italic' : 'normal',
              textDecoration: [l.underline ? 'underline' : '', l.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
              textAlign: 'left',
            };
            return (
              <div key={i} style={baseStyle}>
                {l.text}{' '}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        {data.options.map((opt) => {
          const style: CSSProperties = {
            color: opt.color || '#cccccc',
            fontSize: 12,
            fontWeight: opt.bold ? 700 : 400,
            fontStyle: opt.italic ? 'italic' : 'normal',
            textDecoration: [opt.underline ? 'underline' : '', opt.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid #555',
            borderRadius: 6,
            padding: '2px 6px',
            whiteSpace: 'normal',
            overflow: 'visible',
            textOverflow: 'clip',
            textAlign: 'left',
          };
          return (
            <div key={opt.id} style={{ position: 'relative' }}>
              <Handle type="source" position={Position.Right} id={opt.id} style={{ right: -8, background: opt.color || '#888', width: 10, height: 10 }} />
              <div style={style}>[{opt.label}]</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const GhostNode: React.FC<{ data: { label: string; isHovered?: boolean; debugHeight?: number; debugOwnHeight?: number; debugTotalHeight?: number } }> = ({ data }) => {
  return (
    <div style={{
      padding: '8px 10px',
      borderRadius: 8,
      backgroundColor: data.isHovered ? 'rgba(60,60,60,0.7)' : 'rgba(45,45,45,0.6)',
      border: data.isHovered ? '1px dashed #aaa' : '1px dashed #555',
      color: '#e0e0e0',
      fontSize: 12,
      boxShadow: data.isHovered ? '0 0 0 2px rgba(255,255,255,0.1)' : 'none',
      transition: 'border-color 120ms ease, box-shadow 120ms ease, background-color 120ms ease',
      position: 'relative',
    }}>
      {(typeof data.debugOwnHeight === 'number' || typeof data.debugTotalHeight === 'number') && (
        <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: '#aaa', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {`Own: ${Math.round((data.debugOwnHeight ?? 0) as number)}, Total: ${Math.round((data.debugTotalHeight ?? data.debugHeight ?? 0) as number)}`}
        </div>
      )}
      <Handle type="target" position={Position.Left} id="in" style={{ left: -8, background: '#666', width: 10, height: 10, top: '50%', transform: 'translateY(-50%)' }} />
      {data.label}
    </div>
  );
};

const nodeTypes: NodeTypes = { scene: SceneNode, ghost: GhostNode };

const EnhancedConversationGraph: React.FC<ConversationGraphProps> = ({ graph }) => {
  // Local state so nodes are draggable and connections editable
  // Toggle debug overlay markers for target centers
  const DEBUG_SHOW_TARGETS = false;
  const [graphNodes, setGraphNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const didSimulateRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const animRunningRef = useRef(false);
  const draggedIdsRef = useRef<Set<string>>(new Set());
  const posRef = useRef<Record<string, { x: number; y: number }>>({});
  const velRef = useRef<Record<string, { vx: number; vy: number }>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [worldCenter, setWorldCenter] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const targetCentersRef = useRef<Record<string, { x: number; y: number }>>({});
  const transformRef = useRef<[number, number, number]>([0, 0, 1]);
  // Transform is tracked via onMove into transformRef to avoid requiring useStore
  // When hovering one instance of a scene, highlight all instances by tracking the logical scene id
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);
  // Physics parameters (tunable)
  const [linkDistance, setLinkDistance] = useState(120);
  const [smoothingAlpha, setSmoothingAlpha] = useState(0.1);

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

    // Helper to build a scene node with a specific nodeId (supports duplicates)
    const buildSceneNode = (
      nodeId: string,
      sceneId: string,
      basePos: { x: number; y: number },
      allowOutputs: boolean
    ) => {
      const scene = graph.scenes[sceneId];
      const lineData: SceneLineData[] = scene.lines.map(l => {
        const speakerColor = l.speaker ? graph.styles.speakers[l.speaker]?.color : undefined;
        const color = l.style?.color || speakerColor || '#c8c8c8';
        const choices: OptionData[] = l.choices.map((choice, i) => ({
          id: `${nodeId}-inline-${i}`,
          label: choice.text,
          color: choice.color || (choice.className ? graph.styles.buttons[choice.className]?.color : undefined),
          bold: !!choice.bold,
          italic: !!choice.italic,
          underline: !!choice.underline,
          strikethrough: !!choice.strikethrough,
        }));
        return {
          text: `${l.speaker ? l.speaker + ': ' : ''}${l.text}`,
          color,
          bold: !!l.style?.bold,
          italic: !!l.style?.italic,
          underline: !!l.style?.underline,
          strikethrough: !!l.style?.strikethrough,
          choices,
        };
      });
      // gather options for right side; handle IDs must match nodeId
      let optionIndex = 0;
      const options: OptionData[] = [];
      if (allowOutputs) {
        graph.scenes[sceneId].lines.forEach(line => {
          line.choices.forEach(choice => {
            const styleColor = choice.color || (choice.className ? graph.styles.buttons[choice.className]?.color : undefined);
            options.push({
              id: `${nodeId}-opt-${optionIndex++}`,
              label: choice.text,
              color: styleColor,
              bold: !!choice.bold,
              italic: !!choice.italic,
              underline: !!choice.underline,
              strikethrough: !!choice.strikethrough,
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
            const styleColor = choice.color || (choice.className ? graph.styles.buttons[choice.className]?.color : undefined) || '#cccccc';
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
    setGraphNodes(layout.nodes as any);
    setEdges(layout.edges as any);
    // initialize physics state
    const nextPos: Record<string, { x: number; y: number }> = {};
    const nextVel: Record<string, { vx: number; vy: number }> = {};
    layout.nodes.forEach((n: any) => {
      nextPos[n.id] = { x: n.position.x, y: n.position.y };
      nextVel[n.id] = { vx: 0, vy: 0 };
    });
    posRef.current = nextPos;
    velRef.current = nextVel;
    didSimulateRef.current = true; // disable old relaxer
  }, [layout.nodes, layout.edges, setGraphNodes, setEdges]);

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
    const LINK_DISTANCE = linkDistance;

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

    // Build ordered child lists for each parent (include ghosts/dups; preserve order)
    const parentToChildren: Record<string, string[]> = {};
    Object.keys(outDir).forEach(parentId => {
      const orderedChildren = outDir[parentId] || [];
      const seen = new Set<string>();
      const children: string[] = [];
      for (const childId of orderedChildren) {
        if (!seen.has(childId)) { children.push(childId); seen.add(childId); }
      }
      parentToChildren[parentId] = children;
    });

    // Helper: direct children only. Instances without edges are treated as childless.
    const getChildrenFor = (nodeId: string): string[] => parentToChildren[nodeId] || [];

    const anchorPoint = (id: string, side: 'left' | 'right') => {
      const p = posRef.current[id];
      const d = dims[id];
      if (!p || !d) return { x: 0, y: 0 };
      const x = side === 'right' ? p.x + d.w : p.x;
      const y = p.y + d.h / 2;
      return { x, y };
    };

    const step = () => {
      if (graphNodes.length === 0) return;
      const cx = worldCenter.x;
      const cy = worldCenter.y;
      // reset targets each frame (only when debugging)
      if (DEBUG_SHOW_TARGETS) targetCentersRef.current = {};

      // Precompute own and total (children-combined) heights for all nodes
      const GAP = 12;
      const ownHeightMap: Record<string, number> = {};
      (graphNodes as any[]).forEach((n: any) => {
        const fallbackH = n.type === 'ghost' ? 40 : 160;
        ownHeightMap[n.id] = dims[n.id]?.h ?? fallbackH;
      });
      const totalHeightMap: Record<string, number> = {};
      const visiting = new Set<string>();
      const computeTotal = (nodeId: string): number => {
        if (totalHeightMap[nodeId] !== undefined) return totalHeightMap[nodeId];
        if (visiting.has(nodeId)) return ownHeightMap[nodeId];
        visiting.add(nodeId);
        const kids = getChildrenFor(nodeId) || [];
        let total: number;
        if (!kids || kids.length === 0) {
          total = ownHeightMap[nodeId];
        } else {
          let sum = 0;
          for (const kid of kids) sum += computeTotal(kid);
          total = sum + GAP * Math.max(0, kids.length - 1);
        }
        visiting.delete(nodeId);
        totalHeightMap[nodeId] = total;
        return total;
      };
      (graphNodes as any[]).forEach((n: any) => { computeTotal(n.id); });
      // Attach debug height data to nodes
      (graphNodes as any[]).forEach((n: any) => {
        n.data = {
          ...(n.data || {}),
          debugOwnHeight: ownHeightMap[n.id],
          debugTotalHeight: totalHeightMap[n.id],
          debugHeight: totalHeightMap[n.id],
        };
      });

      // compute and smooth toward target centers only
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
            const sp = posRef.current[srcId];
            const sw = dims[srcId]?.w ?? 0;
            const tw = dims[id]?.w ?? 0;
            if (!sp) continue;
            const srcCenterX = sp.x + sw / 2;
            const tgtDesiredCenterX = srcCenterX + sw / 2 + tw / 2 + LINK_DISTANCE;
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
            // Compute target Y: for nodes with exactly one parent, stack within parent's children based on index and heights
            let targetCenterY: number;
            if (incomers.length === 1) {
              const parentId = incomers[0];
              const childList = parentToChildren[parentId] || [];
              const idxInParent = childList.indexOf(id);
              if (idxInParent >= 0 && childList.length > 0) {
                const gap = 12;
                const parentPos = posRef.current[parentId];
                const parentH = dims[parentId]?.h ?? 0;
                const parentCenterY = parentPos.y + parentH / 2;
                // Use precomputed totals for children
                const childHeights = childList.map((cid) => totalHeightMap[cid] ?? ownHeightMap[cid]);
                const totalHeight = childHeights.reduce((a, b) => a + b, 0) + gap * Math.max(0, childList.length - 1);
                let before = 0;
                for (let i = 0; i < idxInParent; i++) {
                  before += childHeights[i] + gap;
                }
                const thisH = totalHeightMap[id] ?? (dims[id]?.h ?? 0);
                targetCenterY = parentCenterY - totalHeight / 2 + before + thisH / 2;
              } else {
                targetCenterY = yCount > 0 ? (desiredYSum / yCount) : cy;
              }
            } else {
              // Multi-parent or none: fall back to average of parents
              targetCenterY = yCount > 0 ? (desiredYSum / yCount) : cy;
            }
            // store desired target center
            if (DEBUG_SHOW_TARGETS) targetCentersRef.current[id] = { x: targetCenterX, y: targetCenterY };
            const nx = curCenterX + (targetCenterX - curCenterX) * smoothingAlpha;
            const ny = curCenterY + (targetCenterY - curCenterY) * smoothingAlpha;
            posRef.current[id] = { x: nx - dw / 2, y: ny - dh / 2 };
          } else {
            // roots gently drift toward center
            const dw = dims[id]?.w ?? 0;
            const dh = dims[id]?.h ?? 0;
            const curCenterX = p.x + dw / 2;
            const curCenterY = p.y + dh / 2;
            // store desired target center for root as world center, converted to pane coordinates
            if (DEBUG_SHOW_TARGETS) {
              const [tx, ty, tz] = transformRef.current || [0, 0, 1];
              const paneX = (cx - tx) / tz;
              const paneY = (cy - ty) / tz;
              targetCentersRef.current[id] = { x: paneX, y: paneY };
            }
            const nx = curCenterX + (cx - curCenterX) * smoothingAlpha * 0.5;
            const ny = curCenterY + (cy - curCenterY) * smoothingAlpha * 0.5;
            posRef.current[id] = { x: nx - dw / 2, y: ny - dh / 2 };
          }
        }
        // end per-node processing
      }

      setGraphNodes((prev: Node[]) => prev.map((n: any) => {
        if (draggedIdsRef.current.has(n.id)) return n;
        const target = posRef.current[n.id];
        return { ...n, position: { x: target.x, y: target.y } };
      }));

      animFrameRef.current = requestAnimationFrame(step);
    };

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(step);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; };
  }, [graphNodes, edges, setGraphNodes, linkDistance, smoothingAlpha, worldCenter]);

  // Restart relaxation after a drag completes; provide smaller runs during drag
  const handleNodeDragStart = useCallback((_e: any, node: Node) => {
    draggedIdsRef.current.add(node.id);
    // sync ref pos
    posRef.current[node.id] = { x: node.position.x, y: node.position.y };
    velRef.current[node.id] = { vx: 0, vy: 0 };
  }, []);

  const handleNodeDrag = useCallback(() => {
    // do nothing during drag; user has priority
  }, []);

  const handleNodeDragStop = useCallback((_e: any, node: Node) => {
    draggedIdsRef.current.delete(node.id);
    posRef.current[node.id] = { x: node.position.x, y: node.position.y };
  }, []);

  const displayNodes = useMemo(() => {
    if (!graphNodes) return [] as any[];
    return (graphNodes as any[]).map(n => {
      const logicalSceneId = (n as any).data?.id as string | undefined;
      const isHovered = !!logicalSceneId && hoveredSceneId === logicalSceneId;
      const dimsH = (n as any).height ?? (n.type === 'ghost' ? 40 : 160);
      // attach a debugHeight read from last known dims; child-combined value is set during step when available
      const currentDebugHeight = (n.data as any)?.debugHeight ?? dimsH;
      return {
        ...n,
        data: { ...(n.data || {}), isHovered, debugHeight: currentDebugHeight, debugOwnHeight: dimsH, debugTotalHeight: (n.data as any)?.debugHeight ?? currentDebugHeight },
        // slight wrapper elevation as a fallback (main styling handled inside node components)
        style: isHovered ? { ...(n.style || {}), zIndex: 2 } : n.style,
      };
    });
  }, [graphNodes, hoveredSceneId]);

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
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Physics control panel */}
      <div style={{ position: 'absolute', right: 12, top: 12, zIndex: 10, background: 'rgba(20,20,20,0.9)', border: '1px solid #444', borderRadius: 8, padding: 12, width: 360 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Physics</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
          <label>Link distance</label><span>{linkDistance}</span>
          <input type="range" min={50} max={400} step={10} value={linkDistance} onChange={e => setLinkDistance(parseInt(e.target.value))} />

          <label>Smoothing</label><span>{smoothingAlpha.toFixed(2)}</span>
          <input type="range" min={0.05} max={0.6} step={0.01} value={smoothingAlpha} onChange={e => setSmoothingAlpha(parseFloat(e.target.value))} />
        </div>
      </div>
      <ReactFlowProvider>
        <ReactFlow
          nodes={displayNodes as any}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={handleNodeDragStart}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          onNodeMouseEnter={(_e, node) => setHoveredSceneId((node as any).data?.id ?? null)}
          onNodeMouseLeave={(_e, node) => {
            const sceneId = (node as any).data?.id ?? null;
            setHoveredSceneId(prev => (prev === sceneId ? null : prev));
          }}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable
          style={{ backgroundColor: '#1e1e1e' }}
          onMove={(_evt, viewport) => {
            if (viewport) transformRef.current = [viewport.x, viewport.y, viewport.zoom];
          }}
        >
          <Controls />
          <Background color="#333" gap={20} />
          <MiniMap style={{ backgroundColor: '#2a2a2a' }} nodeColor="#666" maskColor="rgba(0, 0, 0, 0.5)" />
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


