'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Search, User } from 'lucide-react';
import { taskOsFetcher } from '@/lib/plugins/tasks/client/api';
import { TaskOsModal, TaskOsModalHeader } from '@/lib/plugins/tasks/ui/shared';
import { getSafeAvatarSrc } from '@/lib/avatar-url';
import {
  taskOsBorder,
  taskOsCardInteractive,
  taskOsInput,
  taskOsMuted,
  taskOsMutedDim,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

type ContactListItem = {
  id: number;
  name: string;
  phone?: string | null;
  profilePicUrl?: string | null;
};

export type ContactPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (contactId: number) => void | Promise<void>;
};

export function ContactPickerModal({ open, onClose, onSelect }: ContactPickerModalProps) {
  const [query, setQuery] = useState('');
  const [selecting, setSelecting] = useState<number | null>(null);

  const { data: contacts = [], isLoading } = useSWR<ContactListItem[]>(
    open ? '/api/contacts/list' : null,
    taskOsFetcher,
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((c) =>
      `${c.name} ${c.phone ?? ''} ${c.id}`.toLowerCase().includes(needle),
    );
  }, [contacts, query]);

  if (!open) return null;

  const handleSelect = async (contactId: number) => {
    setSelecting(contactId);
    try {
      await onSelect(contactId);
      onClose();
    } finally {
      setSelecting(null);
    }
  };

  return (
    <TaskOsModal onClose={onClose} size="md" elevated className="flex max-h-[min(80vh,520px)] flex-col p-0">
      <div className={cn('shrink-0 border-b p-4', taskOsBorder)}>
        <TaskOsModalHeader title="Relacionar contacto" subtitle="Elige un contacto de tu equipo" onClose={onClose} />
        <div className="relative mt-3">
          <Search className={cn('pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2', taskOsMutedDim)} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className={cn('w-full py-2 pl-9 pr-3 text-sm', taskOsInput)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className={cn('flex items-center justify-center gap-2 py-12 text-sm', taskOsMuted)}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando contactos...
          </div>
        ) : filtered.length === 0 ? (
          <p className={cn('py-12 text-center text-sm', taskOsMuted)}>
            {contacts.length === 0 ? 'No hay contactos disponibles' : 'Sin resultados'}
          </p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((contact) => (
              <li key={contact.id}>
                <button
                  type="button"
                  onClick={() => void handleSelect(contact.id)}
                  disabled={selecting !== null}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left disabled:opacity-50',
                    taskOsCardInteractive,
                  )}
                >
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border', taskOsBorder, 'bg-[#141416]')}>
                    {getSafeAvatarSrc(contact.profilePicUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={getSafeAvatarSrc(contact.profilePicUrl)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <User className={cn('h-4 w-4', taskOsMutedDim)} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-medium', taskOsText)}>
                      {contact.name || `Contacto #${contact.id}`}
                    </p>
                    <p className={cn('truncate text-xs', taskOsMuted)}>
                      {contact.phone ? contact.phone : `ID ${contact.id}`}
                    </p>
                  </div>
                  {selecting === contact.id && <Loader2 className={cn('h-4 w-4 shrink-0 animate-spin', taskOsMutedDim)} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </TaskOsModal>
  );
}
