export function computeNextRunAt(msg: {
  scheduleType: string;
  scheduledAt?: Date | null;
  hour?: number | null;
  minute?: number | null;
  weekdays?: number[] | null;
}): Date | null {
  const now = new Date();

  if (msg.scheduleType === 'once') {
    return msg.scheduledAt ?? null;
  }

  if (msg.scheduleType === 'daily') {
    const next = new Date();
    next.setHours(msg.hour ?? 9, msg.minute ?? 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  if (msg.scheduleType === 'weekly') {
    const weekdays = msg.weekdays ?? [];
    if (!weekdays.length) return null;
    for (let i = 1; i <= 7; i++) {
      const next = new Date();
      next.setDate(next.getDate() + i);
      next.setHours(msg.hour ?? 9, msg.minute ?? 0, 0, 0);
      if (weekdays.includes(next.getDay())) return next;
    }
    return null;
  }

  return null;
}
