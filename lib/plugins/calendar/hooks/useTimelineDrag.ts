'use client';

import { useCallback, useRef, useState } from 'react';
import { addDays, toISODate } from '@/lib/plugins/calendar/client/utils';

export type TimelineDragMode = 'move' | 'resize-start' | 'resize-end';

export type TimelinePreview = {
  taskId: number;
  start: Date;
  end: Date;
};

type DragState = {
  taskId: number;
  mode: TimelineDragMode;
  originX: number;
  start: Date;
  end: Date;
};

export function useTimelineDrag(dayWidth: number, onCommit: (taskId: number, startDate: string, endDate: string) => void) {
  const dragRef = useRef<DragState | null>(null);
  const previewRef = useRef<TimelinePreview | null>(null);
  const [preview, setPreview] = useState<TimelinePreview | null>(null);

  const commitPreview = useCallback(() => {
    const current = previewRef.current;
    if (!current) return;
    onCommit(
      current.taskId,
      `${toISODate(current.start)}T12:00:00.000Z`,
      `${toISODate(current.end)}T12:00:00.000Z`,
    );
  }, [onCommit]);

  const startDrag = useCallback((
    e: React.MouseEvent,
    taskId: number,
    mode: TimelineDragMode,
    start: Date,
    end: Date,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    dragRef.current = { taskId, mode, originX: e.clientX, start, end };
    const initial = { taskId, start, end };
    previewRef.current = initial;
    setPreview(initial);

    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const deltaDays = Math.round((ev.clientX - drag.originX) / dayWidth);
      let nextStart = drag.start;
      let nextEnd = drag.end;

      if (drag.mode === 'move') {
        nextStart = addDays(drag.start, deltaDays);
        nextEnd = addDays(drag.end, deltaDays);
      } else if (drag.mode === 'resize-start') {
        nextStart = addDays(drag.start, deltaDays);
        if (nextStart > drag.end) nextStart = drag.end;
      } else {
        nextEnd = addDays(drag.end, deltaDays);
        if (nextEnd < drag.start) nextEnd = drag.start;
      }

      const next = { taskId: drag.taskId, start: nextStart, end: nextEnd };
      previewRef.current = next;
      setPreview(next);
    };

    const onUp = () => {
      commitPreview();
      dragRef.current = null;
      previewRef.current = null;
      setPreview(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [commitPreview, dayWidth]);

  return { startDrag, preview };
}