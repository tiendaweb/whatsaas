import { Boxes, CalendarDays, Handshake, Headset, LifeBuoy, PartyPopper, Phone, Pin, Repeat, Rocket, Users, type LucideIcon } from 'lucide-react';
import type { EventKind, Proposito } from '../../shared/tipos';

/**
 * Iconos en vez de emojis: los emojis cambian de forma y de tamaño en cada
 * sistema y en una grilla densa se leen como manchas de color.
 */
export const KIND_ICON: Record<EventKind, LucideIcon> = {
  meeting: Handshake,
  call: Phone,
  task: Boxes,
  reminder: CalendarDays,
  other: Pin,
};

export const PROPOSITO_ICON: Record<Proposito, LucideIcon> = {
  venta: PartyPopper,
  soporte: LifeBuoy,
  entrega: Boxes,
  onboarding: Rocket,
  seguimiento: Repeat,
  interna: Users,
};

export const ICONO_SOPORTE = Headset;
