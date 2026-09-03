'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { ArrowLeft, Check, ExternalLink, Loader2, Phone, Tag, User } from 'lucide-react';
import {
  buildContactCustomFieldRows,
  formatCustomFieldDisplayValue,
  normalizeCustomDataForSave,
  type ContactCustomFieldDef,
} from '@/lib/plugins/tasks/client/contact-custom-fields';
import { taskOsFetcher } from '@/lib/plugins/tasks/client/api';
import { TaskOsMarkdown } from '@/lib/plugins/tasks/ui/shared/TaskOsMarkdown';
import { getSafeAvatarSrc } from '@/lib/avatar-url';
import { taskOsBtn, taskOsInput, taskOsMuted, taskOsMutedDim } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

type ContactDetail = {
  id: number;
  name: string;
  notes?: string | null;
  phone?: string | null;
  profilePicUrl?: string | null;
  customData?: Record<string, unknown>;
  tags?: { id: number; name: string; color: string }[];
  funnelStage?: { id: number; name: string; emoji?: string | null } | null;
  assignedUser?: { id: number; name: string | null; email: string } | null;
  assignedDepartment?: { id: number; name: string } | null;
  instanceName?: string | null;
};

export type ContactInspectorPanelProps = {
  contactId: number;
  onBack?: () => void;
  /** Sin barra de volver — p. ej. bloque embebido en móvil */
  embedded?: boolean;
};

export function ContactInspectorPanel({ contactId, onBack, embedded = false }: ContactInspectorPanelProps) {
  const { data: contact, isLoading, error, mutate } = useSWR<ContactDetail>(
    `/api/contacts/${contactId}`,
    taskOsFetcher,
  );
  const { data: fieldDefs = [] } = useSWR<ContactCustomFieldDef[]>('/api/custom-fields', taskOsFetcher);

  const [localCustomData, setLocalCustomData] = useState<Record<string, unknown>>({});
  const [editingFields, setEditingFields] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const locale = typeof window !== 'undefined'
    ? (window.location.pathname.split('/')[1] || 'es')
    : 'es';

  const fieldRows = useMemo(
    () => buildContactCustomFieldRows(fieldDefs, contact?.customData),
    [fieldDefs, contact?.customData],
  );

  useEffect(() => {
    if (!contact) return;
    const next: Record<string, unknown> = {};
    for (const row of buildContactCustomFieldRows(fieldDefs, contact.customData)) {
      next[row.field.key] = row.value ?? (row.field.type === 'boolean' ? false : '');
    }
    setLocalCustomData(next);
    setEditingFields(false);
    setSaveOk(false);
  }, [contact, fieldDefs, contactId]);

  const persistCustomData = useCallback(async (values: Record<string, unknown>) => {
    if (!contact) return;
    setSaving(true);
    setSaveOk(false);
    try {
      const payload = normalizeCustomDataForSave(fieldRows, values, contact.customData);
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customData: payload }),
      });
      if (!res.ok) throw new Error('save failed');
      await mutate({ ...contact, customData: payload }, { revalidate: false });
      setSaveOk(true);
      window.setTimeout(() => setSaveOk(false), 2000);
    } catch {
      await mutate();
    } finally {
      setSaving(false);
    }
  }, [contact, contactId, fieldRows, mutate]);

  const queueSave = useCallback((next: Record<string, unknown>) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void persistCustomData(next); }, 600) as unknown as number;
  }, [persistCustomData]);

  const updateField = (key: string, value: unknown) => {
    setLocalCustomData((prev) => {
      const next = { ...prev, [key]: value };
      queueSave(next);
      return next;
    });
    setEditingFields(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-[#8b8b96]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando contacto...
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div className="p-4 text-center text-sm text-[#8b8b96]">
        No se pudo cargar el contacto
        {onBack && (
          <button type="button" onClick={onBack} className="mt-3 block w-full text-xs text-[#93c5fd]">
            Volver
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!embedded && (
        <div className="flex items-center gap-2 border-b border-[#2a2a30] px-3 py-2.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-md p-1 text-[#8b8b96] hover:bg-[#2a2a30] hover:text-white"
              title="Volver"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <span className="text-xs font-medium text-[#a8a8b3]">Inspector · Contacto</span>
        </div>
      )}

      {embedded && (
        <p className={cn('mb-3 text-[10px] font-medium uppercase tracking-wider', taskOsMutedDim)}>
          Contacto vinculado
        </p>
      )}

      <div className={cn('min-h-0 flex-1 space-y-4', !embedded && 'overflow-y-auto p-4', embedded && 'pb-2')}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2a2a30]">
            {getSafeAvatarSrc(contact.profilePicUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={getSafeAvatarSrc(contact.profilePicUrl)} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-5 w-5 text-[#6b6b76]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#ececf1]">{contact.name}</p>
            {contact.phone && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-[#8b8b96]">
                <Phone className="h-3 w-3" />
                {contact.phone}
              </p>
            )}
            {contact.instanceName && (
              <p className="mt-0.5 text-[10px] text-[#5c5c66]">{contact.instanceName}</p>
            )}
          </div>
        </div>

        {(contact.funnelStage || contact.assignedUser) && (
          <div className="grid grid-cols-2 gap-2">
            {contact.funnelStage && (
              <InfoChip label="Etapa" value={`${contact.funnelStage.emoji ?? ''} ${contact.funnelStage.name}`.trim()} />
            )}
            {contact.assignedUser?.name && (
              <InfoChip label="Agente" value={contact.assignedUser.name} />
            )}
          </div>
        )}

        {contact.tags && contact.tags.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[#5c5c66]">Etiquetas</p>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: `${tag.color}99` }}
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-[#2a2a30] bg-[#1a1a1e] p-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[#5c5c66]">Notas internas CRM</p>
          <TaskOsMarkdown content={contact.notes ?? ''} emptyLabel="Sin notas guardadas en el contacto." />
        </div>

        <div className="rounded-lg border border-[#2a2a30] bg-[#1a1a1e] p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#5c5c66]">
              Campos personalizados
              {fieldDefs.length > 0 && (
                <span className="ml-1.5 font-normal text-[#5c5c66]">({fieldDefs.length})</span>
              )}
            </p>
            <span className="flex items-center gap-1 text-[10px] text-[#5c5c66]">
              {saving && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Guardando
                </>
              )}
              {!saving && saveOk && (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Guardado</span>
                </>
              )}
            </span>
          </div>

          {fieldRows.length === 0 ? (
            <p className="text-xs text-[#5c5c66]">No hay campos personalizados configurados en el equipo.</p>
          ) : (
            <div className="space-y-3">
              {fieldRows.map((row) => (
                <CustomFieldEditor
                  key={`${row.field.id}-${row.field.key}`}
                  row={row}
                  value={localCustomData[row.field.key]}
                  onChange={(v) => updateField(row.field.key, v)}
                />
              ))}
            </div>
          )}

          {fieldRows.length > 0 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void persistCustomData(localCustomData)}
              className={cn('mt-3 w-full py-2 text-xs', taskOsBtn, saving && 'opacity-50')}
            >
              {editingFields ? 'Guardar campos ahora' : 'Guardar campos'}
            </button>
          )}
        </div>

        <a
          href={`/${locale}/contacts`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg border border-[#2a2a30] bg-[#222228] px-3 py-2 text-xs text-[#93c5fd] transition-colors hover:bg-[#2a2a30]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Abrir en CRM
        </a>
      </div>
    </div>
  );
}

function CustomFieldEditor({
  row,
  value,
  onChange,
}: {
  row: ReturnType<typeof buildContactCustomFieldRows>[number];
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { field } = row;
  const isBoolean = field.type === 'boolean';

  return (
    <div className="grid gap-1.5">
      <label className="text-xs text-[#8b8b96]">
        {field.name}
        {row.isOrphan && <span className="ml-1 text-[#5c5c66]">(sin definición)</span>}
      </label>
      {isBoolean ? (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={cn(
            'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
            taskOsInput,
            Boolean(value) && 'border-emerald-500/35 bg-emerald-500/10',
          )}
        >
          <span className="text-[#d4d4dc]">{formatCustomFieldDisplayValue('boolean', value)}</span>
          <span
            className={cn(
              'relative h-5 w-9 rounded-full transition-colors',
              Boolean(value) ? 'bg-emerald-500' : 'bg-[#3a3a42]',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                Boolean(value) ? 'left-[18px]' : 'left-0.5',
              )}
            />
          </span>
        </button>
      ) : (
        <input
          type="text"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Sin valor"
          className={cn('w-full px-3 py-2 text-sm', taskOsInput)}
        />
      )}
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('rounded-lg border border-[#2a2a30] bg-[#1a1a1e] px-2.5 py-2')}>
      <p className="text-[9px] uppercase tracking-wider text-[#5c5c66]">{label}</p>
      <p className="mt-0.5 truncate text-xs text-[#d4d4dc]">{value}</p>
    </div>
  );
}
