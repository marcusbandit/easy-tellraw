import React, { CSSProperties, useMemo } from 'react';
import ReactFlow, { Background, Controls, Edge, MiniMap, Node, NodeTypes, Position, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { DialogueGraph } from '../../types/dialogue';
import { Card, Heading, Text } from '@radix-ui/themes';

interface ConversationGraphProps {
  graph: DialogueGraph | null;
}

type SceneLineData = { text: string; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean };

const SceneNode: React.FC<{ data: { id: string; label: string; lines: SceneLineData[] } }> = ({ data }) => {
  return (
    <div style={{
      padding: '12px',
      borderRadius: 10,
      backgroundColor: '#2a2a2a',
      border: '1px solid #444',
      minWidth: 200,
      maxWidth: 380,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{data.label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.lines.map((l, i) => {
          const style: CSSProperties = {
            color: l.color || '#c8c8c8',
            fontSize: 12,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontWeight: l.bold ? 700 : 400,
            fontStyle: l.italic ? 'italic' : 'normal',
            textDecoration: [l.underline ? 'underline' : '', l.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
          };
          return <div key={i} style={style}>{l.text}</div>;
        })}
      </div>
    </div>
  );
};

const nodeTypes: NodeTypes = { scene: SceneNode };

const ConversationGraph: React.FC<ConversationGraphProps> = ({ graph }) => {
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const sceneIds = Object.keys(graph.scenes);
    // grid positions
    const cols = Math.ceil(Math.sqrt(sceneIds.length || 1));
    sceneIds.forEach((id, index) => {
      const scene = graph.scenes[id];
      const row = Math.floor(index / cols);
      const col = index % cols;
      const lineData: SceneLineData[] = scene.lines.map(l => {
        const speakerColor = l.speaker ? graph.styles.speakers[l.speaker]?.color : undefined;
        const color = l.style?.color || speakerColor || '#c8c8c8';
        return {
          text: `${l.speaker ? l.speaker + ': ' : ''}${l.text}`,
          color,
          bold: !!l.style?.bold,
          italic: !!l.style?.italic,
          underline: !!l.style?.underline,
          strikethrough: !!l.style?.strikethrough,
        };
      });
      nodes.push({
        id,
        type: 'scene',
        position: { x: col * 420, y: row * 260 },
        data: { id, label: `@${scene.id}${scene.tags.length ? '  ' + scene.tags.map(t => '#' + t).join(' ') : ''}`, lines: lineData },
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
      });
      // edges from choices
      scene.lines.forEach((line, li) => {
        line.choices.forEach((choice, ci) => {
          const tgt = choice.target.startsWith('@') ? choice.target.slice(1) : null;
          if (tgt && graph.scenes[tgt]) {
            const styleColor = choice.color || (choice.className ? graph.styles.buttons[choice.className]?.color : undefined) || '#cccccc';
            edges.push({
              id: `${id}-${li}-${ci}-${tgt}`,
              source: id,
              target: tgt,
              label: choice.text,
              style: { stroke: styleColor },
              labelStyle: {
                fill: styleColor,
                fontWeight: choice.bold ? 700 : 400,
                fontStyle: choice.italic ? 'italic' : 'normal',
                textDecoration: [choice.underline ? 'underline' : '', choice.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
              },
            });
          }
        });
      });
    });

    return { nodes, edges };
  }, [graph]);

  if (!graph || nodes.length === 0) {
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
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView style={{ backgroundColor: '#1e1e1e' }}>
          <Controls />
          <Background color="#333" gap={20} />
          <MiniMap style={{ backgroundColor: '#2a2a2a' }} nodeColor="#666" maskColor="rgba(0,0,0,0.5)" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
};

export default ConversationGraph;


