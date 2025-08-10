import React, { useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  NodeTypes,
  Position,
  ReactFlowProvider,
  Handle,
  ConnectionLineType,
  ConnectionMode,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Card, Heading, Text, Button } from '@radix-ui/themes';

interface DialogueGraphProps {
  segments?: any[];
}

// Custom node component for dialogue segments
const DialogueNode: React.FC<{ data: any }> = ({ data }) => {
  const { segments } = data;
  
  return (
    <div style={{
      padding: '16px',
      borderRadius: '12px',
      backgroundColor: '#2a2a2a',
      border: '2px solid #444',
      boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
      position: 'relative',
    }}>
      {/* Target handle (left side) - input only */}
      <Handle
        type="target"
        position={Position.Left}
        id={`${data.id}-left`}
        style={{ background: '#666', width: '12px', height: '12px' }}
      />
      
      {/* Display all segments as sections */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', flexWrap: 'wrap' }}>
        {segments.map((segment: any, index: number) => {
          const textStyle: React.CSSProperties = {
            color: segment.color || '#ffffff',
            fontWeight: segment.bold ? 'bold' : 'normal',
            fontStyle: segment.italic ? 'italic' : 'normal',
            textDecoration: segment.strikethrough ? 'line-through' : 'none',
            textDecorationLine: segment.underline ? 'underline' : 'none',
            padding: '8px',
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: '6px',
            border: '1px solid #555',
            whiteSpace: 'nowrap', // Prevent text wrapping within segments
            position: 'relative', // For positioning handles
          };

          return (
            <div key={index} style={textStyle} className="minecraft-font">
              {/* Top handle for this segment */}
              <Handle
                type="source"
                position={Position.Top}
                id={`${data.id}-segment-${index}-top`}
                style={{ 
                  background: '#888', 
                  width: '8px', 
                  height: '8px',
                  top: '-4px',
                  left: '50%',
                  transform: 'translateX(-50%)'
                }}
              />
              
              {/* Bottom handle for this segment */}
              <Handle
                type="target"
                position={Position.Bottom}
                id={`${data.id}-segment-${index}-bottom`}
                style={{ 
                  background: '#888', 
                  width: '8px', 
                  height: '8px',
                  bottom: '-4px',
                  left: '50%',
                  transform: 'translateX(-50%)'
                }}
              />
              
              <div>{segment.text || ''}</div>
              {(segment.click_event || segment.hover_event) && (
                <div style={{ 
                  marginTop: '4px', 
                  fontSize: '10px', 
                  color: '#888',
                  borderTop: '1px solid #555',
                  paddingTop: '4px'
                }}>
                  {segment.click_event && (
                    <div>Click: {segment.click_event.action}</div>
                  )}
                  {segment.hover_event && (
                    <div>Hover: {segment.hover_event.value || segment.hover_event.text}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const nodeTypes: NodeTypes = {
  dialogue: DialogueNode,
};

const DialogueGraph: React.FC<DialogueGraphProps> = ({ segments = [] }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const isUpdatingRef = React.useRef(false);

  // Convert segments to nodes and edges
  const graphData = useMemo(() => {
    if (!segments || segments.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Filter out segments that are just spaces (unless they have events)
    const meaningfulSegments = segments.filter((segment, index) => {
      const text = segment.text || '';
      const isJustSpaces = text.trim() === '';
      const hasEvents = segment.click_event || segment.hover_event;
      
      // Keep the segment if it has events OR if it's not just spaces
      const shouldKeep = hasEvents || !isJustSpaces;
      
      if (!shouldKeep) {
        console.log(`📊 Skipping space-only segment at index ${index}: "${text}"`);
      }
      
      return shouldKeep;
    });

    console.log(`📊 Filtered ${segments.length} segments to ${meaningfulSegments.length} meaningful segments`);

    // Create a single node containing all segments
    const nodes: Node[] = [];
    if (meaningfulSegments.length > 0) {
      const singleNode: Node = {
        id: 'dialogue-node',
        type: 'dialogue',
        position: { x: 100, y: 100 },
        data: {
          id: 'dialogue-node',
          segments: meaningfulSegments, // Pass all segments to the node
        },
        targetPosition: Position.Left, // Only input/target handle
      };
      nodes.push(singleNode);
    }

    // No edges needed since we only have one node
    const edges: Edge[] = [];

    return { nodes, edges };
  }, [segments]);

  // Update graph when segments change
  React.useEffect(() => {
    if (isUpdatingRef.current) {
      console.log('📊 Update already in progress, skipping');
      return;
    }
    
    console.log('📊 Updating graph with segments:', segments.length);
    isUpdatingRef.current = true;
    
    try {
      // Validate edges before setting them
      const validEdges = graphData.edges.filter(edge => {
        const isValid = edge.source && edge.target && edge.id && edge.sourceHandle && edge.targetHandle;
        if (!isValid) {
          console.warn('⚠️ Invalid edge found:', edge);
        }
        return isValid;
      });
      
      // Ensure no duplicate edges
      const uniqueEdges = validEdges.filter((edge, index, self) => 
        index === self.findIndex(e => e.id === edge.id)
      );
      
      console.log('📊 Setting nodes:', graphData.nodes.length);
      console.log('📊 Setting edges:', uniqueEdges.length);
      setNodes(graphData.nodes);
      setEdges(uniqueEdges);
      console.log('📊 Graph updated successfully');
    } catch (error) {
      console.error('📊 Error updating graph:', error);
    } finally {
      isUpdatingRef.current = false;
    }
  }, [graphData, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      console.log('🔗 Connection attempt:', params);
      
      // Only add the connection if it has valid source and target
      if (params.source && params.target) {
        console.log('🔗 Adding valid connection:', params);
        setEdges((eds) => addEdge(params, eds));
      } else {
        console.warn('⚠️ Invalid connection attempt:', params);
      }
    },
    [setEdges],
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      console.log('🔗 Edge clicked:', edge);
      
      // Check if Ctrl key is held down
      if (event.ctrlKey || event.metaKey) {
        console.log('🔗 Ctrl+click detected, removing edge:', edge.id);
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      }
    },
    [setEdges],
  );

  const resetView = useCallback(() => {
    setNodes(graphData.nodes);
    setEdges(graphData.edges);
  }, [graphData, setNodes, setEdges]);

  if (segments.length === 0) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center' 
      }}>
        <Card size="3" variant="surface" style={{ maxWidth: '600px', textAlign: 'center' }}>
          <Heading size="6" mb="3">Dialogue Graph</Heading>
          <Text size="3" color="gray">
            No segments to visualize
          </Text>
          <Text size="2" color="gray" mt="2">
            Add some text in the editor to see the dialogue flow here.
          </Text>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ 
        padding: '12px', 
        borderBottom: '1px solid #444', 
        backgroundColor: '#1a1a1a',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
      }}>
        <Heading size="4">Dialogue Flow</Heading>
        <Button size="2" onClick={resetView}>Reset View</Button>
      </div>
      <div style={{ flex: 1, backgroundColor: '#1e1e1e' }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-left"
            style={{ backgroundColor: '#1e1e1e' }}
            onError={(error) => {
              console.error('🚨 ReactFlow error:', error);
            }}
            onInit={(reactFlowInstance) => {
              console.log('🚀 ReactFlow initialized:', reactFlowInstance);
            }}
            connectionLineStyle={{ stroke: '#666', strokeWidth: 2 }}
            connectionLineType={ConnectionLineType.SmoothStep}
            snapToGrid={true}
            snapGrid={[15, 15]}
            deleteKeyCode="Delete"
            multiSelectionKeyCode="Shift"
            panOnDrag={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
            zoomOnDoubleClick={false}
            selectNodesOnDrag={false}
            connectionMode={ConnectionMode.Loose}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.1}
            maxZoom={4}
            onConnectStart={(event, params) => {
              // Change cursor to plus when starting connection
              console.log('🔗 Connect start - changing cursor to crosshair');
              const reactFlowElement = document.querySelector('.react-flow');
              if (reactFlowElement) {
                (reactFlowElement as HTMLElement).style.cursor = 'crosshair';
              }
              document.body.style.cursor = 'crosshair';
              console.log('🔗 Current cursor style:', document.body.style.cursor);
            }}
            onConnectEnd={(event) => {
              // Reset cursor when connection ends
              console.log('🔗 Connect end - resetting cursor to default');
              const reactFlowElement = document.querySelector('.react-flow');
              if (reactFlowElement) {
                (reactFlowElement as HTMLElement).style.cursor = 'default';
              }
              document.body.style.cursor = 'default';
              console.log('🔗 Current cursor style:', document.body.style.cursor);
            }}
          >
            <Controls />
            <Background color="#333" gap={20} />
            <MiniMap 
              style={{ backgroundColor: '#2a2a2a' }}
              nodeColor="#666"
              maskColor="rgba(0, 0, 0, 0.5)"
            />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
};

export default DialogueGraph; 