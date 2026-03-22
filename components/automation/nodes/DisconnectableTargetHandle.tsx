import React, { useCallback } from 'react';
import { Edge, Handle, Position, useReactFlow } from '@xyflow/react';
import { toast } from 'sonner';

interface DisconnectableTargetHandleProps {
  nodeId: string;
  handleId?: string;
  className?: string;
  style?: React.CSSProperties;
  position?: Position;
}

export function DisconnectableTargetHandle({
  nodeId,
  handleId,
  className,
  style,
  position = Position.Left,
}: DisconnectableTargetHandleProps) {
  const { setEdges } = useReactFlow();

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();

      if (event.detail !== 3) {
        return;
      }

      let removedConnections = 0;

      setEdges((currentEdges: Edge[]) => {
        const remainingEdges = currentEdges.filter((edge) => {
          const matchesTargetNode = edge.target === nodeId;
          const matchesTargetHandle = handleId == null || edge.targetHandle === handleId;
          const shouldRemove = matchesTargetNode && matchesTargetHandle;

          if (shouldRemove) {
            removedConnections += 1;
          }

          return !shouldRemove;
        });

        return remainingEdges;
      });

      if (removedConnections > 0) {
        toast.success('Incoming connection removed');
      }
    },
    [handleId, nodeId, setEdges],
  );

  return (
    <Handle
      id={handleId}
      type="target"
      position={position}
      className={className}
      style={style}
      onClick={handleClick}
      title="Triple click to disconnect"
    />
  );
}
