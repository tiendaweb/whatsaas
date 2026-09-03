'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import useSWR, { type KeyedMutator } from 'swr';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Inbox,
  Link2,
  Loader2,
  MessageSquareText,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type FieldType = 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'select' | 'checkbox' | 'date';

type FormField = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder: string;
  options: string[];
};

type FormStyle = {
  theme: 'blank' | 'classic' | 'soft';
  background: string;
  textColor: string;
  accentColor: string;
  borderRadius: 'none' | 'small' | 'medium' | 'large';
};

type FormItem = {
  id: number;
  teamId: number;
  instanceId: number | null;
  publicId: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'draft' | 'published';
  fields: FormField[];
  style: FormStyle;
  submitButtonLabel: string;
  successMessage: string;
  confirmationMessage: string;
  instanceName?: string | null;
  submissionCount?: number;
  updatedAt: string;
};

type InstanceItem = {
  dbId: number;
  instanceName: string;
  status: string;
  integration: string | null;
};

type SubmissionItem = {
  id: number;
  formId: number;
  formName: string | null;
  instanceName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  data: Record<string, unknown>;
  status: 'new' | 'in_review' | 'managed' | 'archived';
  messageStatus: 'pending' | 'sent' | 'error';
  messageError: string | null;
  submittedAt: string;
};

type FieldTemplate = Pick<FormField, 'key' | 'label' | 'type' | 'required' | 'placeholder' | 'options'>;

const defaultStyle: FormStyle = {
  theme: 'blank',
  background: '',
  textColor: '',
  accentColor: '',
  borderRadius: 'medium',
};

const fieldTypeLabels: Record<FieldType, string> = {
  text: 'Texto',
  textarea: 'Texto largo',
  email: 'Email',
  phone: 'Telefono',
  number: 'Numero',
  select: 'Selector',
  checkbox: 'Checkbox',
  date: 'Fecha',
};

const formStatusLabels: Record<FormItem['status'], string> = {
  draft: 'Borrador',
  published: 'Publicado',
};

const submissionStatusLabels: Record<SubmissionItem['status'], string> = {
  new: 'Nuevo',
  in_review: 'En revision',
  managed: 'Gestionado',
  archived: 'Archivado',
};

const messageStatusLabels: Record<SubmissionItem['messageStatus'], string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  error: 'Error',
};

const fieldTemplates: FieldTemplate[] = [
  { key: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Nombre completo', options: [] },
  { key: 'telefono', label: 'Telefono', type: 'phone', required: true, placeholder: '+549...', options: [] },
  { key: 'email', label: 'Email', type: 'email', required: false, placeholder: 'email@dominio.com', options: [] },
  { key: 'consulta', label: 'Consulta', type: 'textarea', required: false, placeholder: 'Escribe tu consulta', options: [] },
  { key: 'fecha', label: 'Fecha', type: 'date', required: false, placeholder: '', options: [] },
  { key: 'opcion', label: 'Opciones', type: 'select', required: false, placeholder: 'Selecciona una opcion', options: ['Opcion 1', 'Opcion 2'] },
  { key: 'contacto_autorizado', label: 'Autorizacion', type: 'checkbox', required: false, placeholder: 'Acepto ser contactado', options: [] },
];

function makeFieldId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `field_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

function defaultFields(): FormField[] {
  return [
    { id: makeFieldId(), key: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Tu nombre', options: [] },
    { id: makeFieldId(), key: 'telefono', label: 'Telefono', type: 'phone', required: true, placeholder: '+549...', options: [] },
    { id: makeFieldId(), key: 'email', label: 'Email', type: 'email', required: false, placeholder: 'email@dominio.com', options: [] },
  ];
}

function newForm(instanceId?: number): Partial<FormItem> {
  return {
    name: 'Nuevo formulario',
    description: '',
    slug: 'nuevo-formulario',
    status: 'draft',
    instanceId: instanceId ?? null,
    fields: defaultFields(),
    style: defaultStyle,
    submitButtonLabel: 'Enviar',
    successMessage: 'Gracias. Recibimos tus datos correctamente.',
    confirmationMessage: 'Hola {{nombre}}, recibimos tus datos de {{formulario}}.\n\n{{datos}}',
  };
}

function hasPhoneField(fields: FormField[]) {
  return fields.some((field) => {
    const text = `${field.key} ${field.label}`.toLowerCase();
    return field.type === 'phone' || text.includes('telefono') || text.includes('phone') || text.includes('celular') || text.includes('whatsapp');
  });
}

function makeUniqueKey(baseKey: string, fields: FormField[]) {
  const normalizedBase = baseKey.replace(/[^a-zA-Z0-9_]/g, '') || `campo_${fields.length + 1}`;
  const used = new Set(fields.map((field) => field.key));
  if (!used.has(normalizedBase)) return normalizedBase;

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${normalizedBase}_${index}`;
    if (!used.has(candidate)) return candidate;
  }

  return `${normalizedBase}_${Date.now()}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function valueToText(value: unknown) {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Si' : 'No';
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function usePublicBaseUrl() {
  const [base, setBase] = useState('');

  useEffect(() => {
    const locale = window.location.pathname.split('/').filter(Boolean)[0] || 'es';
    setBase(`${window.location.origin}/${locale}/forms`);
  }, []);

  return base;
}

export function FormBuilderDashboard() {
  const { data: forms = [], isLoading: loadingForms, mutate: mutateForms } = useSWR<FormItem[]>('/api/plugins/form-builder/forms', fetcher);
  const { data: instances = [] } = useSWR<InstanceItem[]>('/api/instance/details', fetcher);
  const { data: submissions = [], mutate: mutateSubmissions } = useSWR<SubmissionItem[]>('/api/plugins/form-builder/submissions', fetcher);
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<Partial<FormItem> | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'builder' | 'inbox'>('builder');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<number | null>(null);
  const [submissionFilter, setSubmissionFilter] = useState<SubmissionItem['status'] | 'all'>('all');
  const publicBaseUrl = usePublicBaseUrl();

  const persistedForm = typeof selectedId === 'number' ? forms.find((form) => form.id === selectedId) ?? null : null;
  const selectedFormSubmissions = useMemo(() => {
    if (typeof selectedId !== 'number') return [];
    return submissions.filter((submission) => submission.formId === selectedId);
  }, [selectedId, submissions]);
  const filteredSubmissions = useMemo(() => {
    if (submissionFilter === 'all') return submissions;
    return submissions.filter((submission) => submission.status === submissionFilter);
  }, [submissionFilter, submissions]);
  const selectedSubmission = filteredSubmissions.find((item) => item.id === selectedSubmissionId) ?? filteredSubmissions[0] ?? null;
  const publicUrl = persistedForm?.publicId && publicBaseUrl ? `${publicBaseUrl}/${persistedForm.publicId}` : '';
  const embedCode = publicUrl ? `<iframe src="${publicUrl}" width="100%" height="720" style="border:0;" loading="lazy"></iframe>` : '';
  const publishedCount = forms.filter((form) => form.status === 'published').length;
  const newSubmissionCount = submissions.filter((submission) => submission.status === 'new').length;

  useEffect(() => {
    if (!selectedId && forms.length > 0) {
      setSelectedId(forms[0].id);
    }
  }, [forms, selectedId]);

  useEffect(() => {
    if (selectedId === 'new') return;
    const form = forms.find((item) => item.id === selectedId);
    if (form) setDraft(form);
  }, [forms, selectedId]);

  function startNewForm() {
    setSelectedId('new');
    setDraft(newForm(instances[0]?.dbId));
    setActiveView('builder');
  }

  async function saveForm() {
    if (!draft) return;
    if (!draft.instanceId) {
      toast.error('Selecciona una instancia.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: draft.name,
        description: draft.description ?? '',
        slug: draft.slug || draft.name,
        status: draft.status ?? 'draft',
        instanceId: Number(draft.instanceId),
        fields: draft.fields ?? [],
        style: draft.style ?? defaultStyle,
        submitButtonLabel: draft.submitButtonLabel ?? 'Enviar',
        successMessage: draft.successMessage ?? 'Gracias. Recibimos tus datos correctamente.',
        confirmationMessage: draft.confirmationMessage ?? 'Hola {{nombre}}, recibimos tus datos de {{formulario}}.\n\n{{datos}}',
      };

      const response = await fetch(
        selectedId === 'new' ? '/api/plugins/form-builder/forms' : `/api/plugins/form-builder/forms/${selectedId}`,
        {
          method: selectedId === 'new' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar.');

      toast.success('Formulario guardado.');
      await mutateForms();
      if (selectedId === 'new') setSelectedId(result.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteForm(formId: number) {
    if (!confirm('Eliminar formulario y sus envios?')) return;
    const response = await fetch(`/api/plugins/form-builder/forms/${formId}`, { method: 'DELETE' });
    if (!response.ok) {
      toast.error('No se pudo eliminar.');
      return;
    }
    toast.success('Formulario eliminado.');
    setSelectedId(null);
    setDraft(null);
    await mutateForms();
    await mutateSubmissions();
  }

  function updateDraft(updates: Partial<FormItem>) {
    setDraft((current) => ({ ...(current ?? newForm(instances[0]?.dbId)), ...updates }));
  }

  function updateField(index: number, updates: Partial<FormField>) {
    const fields = [...(draft?.fields ?? [])];
    fields[index] = { ...fields[index], ...updates };
    updateDraft({ fields });
  }

  function addField(template?: FieldTemplate) {
    const fields = draft?.fields ?? [];
    const base = template ?? {
      key: `campo_${fields.length + 1}`,
      label: 'Nuevo campo',
      type: 'text' as const,
      required: false,
      placeholder: '',
      options: [],
    };

    updateDraft({
      fields: [
        ...fields,
        {
          ...base,
          id: makeFieldId(),
          key: makeUniqueKey(base.key, fields),
        },
      ],
    });
  }

  function removeField(index: number) {
    updateDraft({ fields: (draft?.fields ?? []).filter((_, itemIndex) => itemIndex !== index) });
  }

  function moveField(index: number, direction: -1 | 1) {
    const fields = [...(draft?.fields ?? [])];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= fields.length) return;
    [fields[index], fields[targetIndex]] = [fields[targetIndex], fields[index]];
    updateDraft({ fields });
  }

  return (
    <div
      className="min-h-screen bg-[#F7F7F8] text-[#111111]"
      style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
    >
      <header className="border-b border-[#D8DDE7] bg-[#FFFFFF] px-4 py-4 sm:px-6">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="grid gap-4 sm:grid-cols-[104px_minmax(0,1fr)] sm:items-end">
            <div className="hidden text-[76px] font-semibold leading-none text-[#002FA7] [font-variant-numeric:tabular-nums] sm:block">
              {String(forms.length).padStart(2, '0')}
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal text-[#111111]">Formularios</h1>
              <p className="mt-1 max-w-2xl text-sm text-[#525866]">
                Formularios publicos conectados a una instancia de WhatsApp.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#111111]">
                <MetricLabel value={publishedCount} label="publicados" />
                <MetricLabel value={newSubmissionCount} label="nuevos envios" />
                <MetricLabel value={instances.length} label="instancias" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ViewButton active={activeView === 'builder'} onClick={() => setActiveView('builder')}>
              <ClipboardList className="h-4 w-4" />
              Constructor
            </ViewButton>
            <ViewButton active={activeView === 'inbox'} onClick={() => setActiveView('inbox')}>
              <Inbox className="h-4 w-4" />
              Bandeja
            </ViewButton>
            <Button
              type="button"
              onClick={startNewForm}
              className="h-10 rounded-none border border-[#002FA7] bg-[#002FA7] px-3 text-sm font-semibold text-white hover:bg-[#002FA7]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuevo formulario
            </Button>
          </div>
        </div>
      </header>

      <main className="grid gap-4 px-4 py-4 sm:px-6 xl:grid-cols-[320px_minmax(0,1fr)_380px]">
        <FormRail
          forms={forms}
          loading={loadingForms}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setActiveView('builder');
          }}
          onNew={startNewForm}
        />

        {activeView === 'builder' ? (
          <BuilderCanvas
            draft={draft}
            instances={instances}
            saving={saving}
            selectedId={selectedId}
            onSave={saveForm}
            onDelete={typeof selectedId === 'number' ? () => deleteForm(selectedId) : undefined}
            onUpdateDraft={updateDraft}
            onUpdateField={updateField}
            onAddField={addField}
            onRemoveField={removeField}
            onMoveField={moveField}
          />
        ) : (
          <SubmissionInbox
            submissions={filteredSubmissions}
            filter={submissionFilter}
            selectedSubmissionId={selectedSubmission?.id ?? null}
            onFilterChange={setSubmissionFilter}
            onSelect={setSelectedSubmissionId}
          />
        )}

        {activeView === 'builder' ? (
          <PublishRail
            draft={draft}
            publicUrl={publicUrl}
            embedCode={embedCode}
            submissions={selectedFormSubmissions}
            saving={saving}
            onSave={saveForm}
            onUpdateDraft={updateDraft}
          />
        ) : (
          <SubmissionDetail submission={selectedSubmission} mutateSubmissions={mutateSubmissions} />
        )}
      </main>
    </div>
  );
}

function MetricLabel({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 border border-[#D8DDE7] bg-[#FFFFFF] px-2.5 py-1 [font-variant-numeric:tabular-nums]">
      <span className="text-[#002FA7]">{value}</span>
      {label}
    </span>
  );
}

function ViewButton(props: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        'inline-flex h-10 items-center gap-2 border px-3 text-sm font-semibold transition-colors',
        props.active
          ? 'border-[#002FA7] bg-[#002FA7] text-white'
          : 'border-[#D8DDE7] bg-[#FFFFFF] text-[#111111] hover:border-[#002FA7]',
      )}
    >
      {props.children}
    </button>
  );
}

function FormRail(props: {
  forms: FormItem[];
  loading: boolean;
  selectedId: number | 'new' | null;
  onSelect: (id: number | 'new') => void;
  onNew: () => void;
}) {
  return (
    <aside className="min-h-[360px] border border-[#D8DDE7] bg-[#FFFFFF] xl:sticky xl:top-4 xl:max-h-[calc(100vh-132px)]">
      <div className="flex items-center justify-between border-b border-[#D8DDE7] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[#111111]">Formularios</h2>
          <p className="text-xs text-[#525866]">{props.forms.length} creados</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={props.onNew}
          className="h-8 rounded-none border-[#D8DDE7] bg-[#FFFFFF] text-[#111111] hover:border-[#002FA7] hover:bg-[#FFFFFF]"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo
        </Button>
      </div>

      <div className="max-h-[calc(100vh-205px)] space-y-2 overflow-y-auto p-3">
        {props.loading ? (
          <div className="flex items-center gap-2 border border-[#D8DDE7] px-3 py-4 text-sm text-[#525866]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando formularios
          </div>
        ) : props.forms.length === 0 && props.selectedId !== 'new' ? (
          <button
            type="button"
            onClick={props.onNew}
            className="w-full border border-dashed border-[#D8DDE7] bg-[#F7F7F8] px-3 py-6 text-left text-sm text-[#525866] hover:border-[#002FA7]"
          >
            Crear el primer formulario
          </button>
        ) : null}

        {props.selectedId === 'new' && (
          <FormListButton active title="Nuevo formulario" subtitle="Borrador local" count={0} status="draft" onClick={() => props.onSelect('new')} />
        )}

        {props.forms.map((form, index) => (
          <FormListButton
            key={form.id}
            active={props.selectedId === form.id}
            number={index + 1}
            title={form.name}
            subtitle={form.instanceName ?? 'Sin instancia'}
            count={form.submissionCount ?? 0}
            status={form.status}
            onClick={() => props.onSelect(form.id)}
          />
        ))}
      </div>
    </aside>
  );
}

function FormListButton(props: {
  active: boolean;
  title: string;
  subtitle: string;
  count: number;
  status?: FormItem['status'] | 'draft';
  number?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        'grid w-full grid-cols-[40px_minmax(0,1fr)] border bg-[#FFFFFF] text-left transition-colors',
        props.active ? 'border-[#002FA7]' : 'border-[#D8DDE7] hover:border-[#002FA7]',
      )}
    >
      <span
        className={cn(
          'flex h-full items-start justify-center border-r px-2 py-3 text-xs font-semibold [font-variant-numeric:tabular-nums]',
          props.active ? 'border-[#002FA7] bg-[#002FA7] text-white' : 'border-[#D8DDE7] text-[#002FA7]',
        )}
      >
        {props.number ? String(props.number).padStart(2, '0') : 'N'}
      </span>
      <span className="min-w-0 px-3 py-3">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-[#111111]">{props.title}</span>
          {props.status && <StatusPill tone={props.status === 'published' ? 'blue' : 'neutral'}>{formStatusLabels[props.status]}</StatusPill>}
        </span>
        <span className="mt-2 flex items-center justify-between gap-2 text-xs text-[#525866]">
          <span className="truncate">{props.subtitle}</span>
          <span className="[font-variant-numeric:tabular-nums]">{props.count} envios</span>
        </span>
      </span>
    </button>
  );
}

function BuilderCanvas(props: {
  draft: Partial<FormItem> | null;
  instances: InstanceItem[];
  saving: boolean;
  selectedId: number | 'new' | null;
  onSave: () => void;
  onDelete?: () => void;
  onUpdateDraft: (updates: Partial<FormItem>) => void;
  onUpdateField: (index: number, updates: Partial<FormField>) => void;
  onAddField: (template?: FieldTemplate) => void;
  onRemoveField: (index: number) => void;
  onMoveField: (index: number, direction: -1 | 1) => void;
}) {
  const draft = props.draft;

  if (!draft) {
    return (
      <section className="flex min-h-[520px] items-center justify-center border border-[#D8DDE7] bg-[#FFFFFF] p-6">
        <div className="max-w-sm text-left">
          <FileText className="mb-4 h-8 w-8 text-[#002FA7]" />
          <h2 className="text-xl font-semibold text-[#111111]">Selecciona un formulario</h2>
          <p className="mt-2 text-sm text-[#525866]">El constructor aparece cuando eliges un formulario o creas uno nuevo.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <EditorHeader
        form={draft}
        saving={props.saving}
        onSave={props.onSave}
        onDelete={props.onDelete}
        selectedId={props.selectedId}
      />

      <Panel title="Datos del formulario" icon={<FileText className="h-4 w-4" />}>
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Nombre">
            <Input
              value={draft.name ?? ''}
              onChange={(event) => props.onUpdateDraft({ name: event.target.value, slug: slugify(event.target.value) })}
              className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] focus-visible:ring-[#002FA7]"
            />
          </FieldBlock>
          <FieldBlock label="Slug">
            <Input
              value={draft.slug ?? ''}
              onChange={(event) => props.onUpdateDraft({ slug: slugify(event.target.value) })}
              className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] focus-visible:ring-[#002FA7]"
            />
          </FieldBlock>
          <FieldBlock label="Descripcion" className="md:col-span-2">
            <Textarea
              value={draft.description ?? ''}
              onChange={(event) => props.onUpdateDraft({ description: event.target.value })}
              rows={2}
              className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] focus-visible:ring-[#002FA7]"
            />
          </FieldBlock>
          <FieldBlock label="Instancia">
            <Select value={draft.instanceId ? String(draft.instanceId) : ''} onValueChange={(value) => props.onUpdateDraft({ instanceId: Number(value) })}>
              <SelectTrigger className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] focus:ring-[#002FA7]">
                <SelectValue placeholder="Seleccionar instancia" />
              </SelectTrigger>
              <SelectContent>
                {props.instances.map((instance) => (
                  <SelectItem key={instance.dbId} value={String(instance.dbId)}>
                    {instance.instanceName} ({instance.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldBlock>
          <FieldBlock label="Estado">
            <Select value={draft.status ?? 'draft'} onValueChange={(value) => props.onUpdateDraft({ status: value as FormItem['status'] })}>
              <SelectTrigger className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] focus:ring-[#002FA7]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="published">Publicado</SelectItem>
              </SelectContent>
            </Select>
          </FieldBlock>
        </div>
      </Panel>

      <Panel
        title="Campos"
        icon={<ClipboardList className="h-4 w-4" />}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => props.onAddField()}
            className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] text-[#111111] hover:border-[#002FA7] hover:bg-[#FFFFFF]"
          >
            <Plus className="mr-2 h-4 w-4" />
            Campo
          </Button>
        }
      >
        <div className="grid gap-2 border-b border-[#D8DDE7] pb-4 sm:grid-cols-2 lg:grid-cols-4">
          {fieldTemplates.map((template) => (
            <button
              key={`${template.key}-${template.type}`}
              type="button"
              onClick={() => props.onAddField(template)}
              className="flex items-center justify-between border border-[#D8DDE7] bg-[#F7F7F8] px-3 py-2 text-left text-xs font-semibold text-[#111111] hover:border-[#002FA7] hover:bg-[#FFFFFF]"
            >
              {template.label}
              <Plus className="h-3.5 w-3.5 text-[#002FA7]" />
            </button>
          ))}
        </div>

        <div className="space-y-3 pt-4">
          {(draft.fields ?? []).length === 0 ? (
            <div className="border border-dashed border-[#D8DDE7] bg-[#F7F7F8] px-4 py-8 text-sm text-[#525866]">
              Agrega al menos un campo para guardar un formulario publicado.
            </div>
          ) : null}

          {(draft.fields ?? []).map((field, index) => (
            <FieldMapRow
              key={field.id}
              field={field}
              index={index}
              fieldCount={draft.fields?.length ?? 0}
              onUpdate={(updates) => props.onUpdateField(index, updates)}
              onMove={(direction) => props.onMoveField(index, direction)}
              onRemove={() => props.onRemoveField(index)}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Mensaje de WhatsApp" icon={<MessageSquareText className="h-4 w-4" />}>
        <div className="grid gap-3">
          <FieldBlock label="Mensaje de confirmacion">
            <Textarea
              value={draft.confirmationMessage ?? ''}
              onChange={(event) => props.onUpdateDraft({ confirmationMessage: event.target.value })}
              rows={7}
              className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] font-mono text-sm focus-visible:ring-[#002FA7]"
            />
          </FieldBlock>
          <div className="flex flex-wrap gap-2 text-xs text-[#525866]">
            {['{{nombre}}', '{{telefono}}', '{{formulario}}', '{{datos}}'].map((variable) => (
              <span key={variable} className="border border-[#D8DDE7] bg-[#F7F7F8] px-2 py-1 font-mono text-[#111111]">
                {variable}
              </span>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FieldBlock label="Texto del boton">
              <Input
                value={draft.submitButtonLabel ?? ''}
                onChange={(event) => props.onUpdateDraft({ submitButtonLabel: event.target.value })}
                className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] focus-visible:ring-[#002FA7]"
              />
            </FieldBlock>
            <FieldBlock label="Mensaje de exito">
              <Input
                value={draft.successMessage ?? ''}
                onChange={(event) => props.onUpdateDraft({ successMessage: event.target.value })}
                className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] focus-visible:ring-[#002FA7]"
              />
            </FieldBlock>
          </div>
        </div>
      </Panel>
    </section>
  );
}

function EditorHeader(props: {
  form: Partial<FormItem>;
  saving: boolean;
  selectedId: number | 'new' | null;
  onSave: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="grid gap-3 border border-[#D8DDE7] bg-[#FFFFFF] p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-xl font-semibold text-[#111111]">{props.form.name}</h2>
          <StatusPill tone={props.form.status === 'published' ? 'blue' : 'neutral'}>
            {formStatusLabels[props.form.status ?? 'draft']}
          </StatusPill>
        </div>
        <p className="mt-1 text-xs text-[#525866]">
          {props.form.publicId ? `ID publico: ${props.form.publicId}` : 'Borrador sin guardar'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {props.onDelete && (
          <Button
            type="button"
            variant="outline"
            onClick={props.onDelete}
            className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] text-[#111111] hover:border-[#002FA7] hover:bg-[#FFFFFF]"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar
          </Button>
        )}
        <Button
          type="button"
          onClick={props.onSave}
          disabled={props.saving}
          className="rounded-none border border-[#002FA7] bg-[#002FA7] text-white hover:bg-[#002FA7]"
        >
          {props.saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Guardar
        </Button>
      </div>
    </div>
  );
}

function Panel(props: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border border-[#D8DDE7] bg-[#FFFFFF]">
      <div className="flex items-center justify-between gap-3 border-b border-[#D8DDE7] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#111111]">
          <span className="text-[#002FA7]">{props.icon}</span>
          {props.title}
        </div>
        {props.action}
      </div>
      <div className="p-4">{props.children}</div>
    </section>
  );
}

function FieldBlock(props: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('space-y-2', props.className)}>
      <Label className="text-xs font-semibold text-[#111111]">{props.label}</Label>
      {props.children}
    </div>
  );
}

function FieldMapRow(props: {
  field: FormField;
  index: number;
  fieldCount: number;
  onUpdate: (updates: Partial<FormField>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid border border-[#D8DDE7] bg-[#FFFFFF] md:grid-cols-[64px_minmax(0,1fr)]">
      <div className="flex border-b border-[#D8DDE7] bg-[#F7F7F8] px-3 py-3 text-lg font-semibold text-[#002FA7] [font-variant-numeric:tabular-nums] md:border-b-0 md:border-r">
        {String(props.index + 1).padStart(2, '0')}
      </div>
      <div className="space-y-3 p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_170px_auto]">
          <Input
            value={props.field.label}
            onChange={(event) => props.onUpdate({ label: event.target.value })}
            placeholder="Etiqueta"
            className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] focus-visible:ring-[#002FA7]"
          />
          <Input
            value={props.field.key}
            onChange={(event) => props.onUpdate({ key: event.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
            placeholder="key"
            className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] font-mono text-sm focus-visible:ring-[#002FA7]"
          />
          <Select value={props.field.type} onValueChange={(value) => props.onUpdate({ type: value as FieldType })}>
            <SelectTrigger className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] focus:ring-[#002FA7]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fieldTypeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <IconButton title="Subir campo" disabled={props.index === 0} onClick={() => props.onMove(-1)}>
              <ArrowUp className="h-4 w-4" />
            </IconButton>
            <IconButton title="Bajar campo" disabled={props.index === props.fieldCount - 1} onClick={() => props.onMove(1)}>
              <ArrowDown className="h-4 w-4" />
            </IconButton>
            <IconButton title="Eliminar campo" onClick={props.onRemove}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px]">
          <Input
            value={props.field.placeholder}
            onChange={(event) => props.onUpdate({ placeholder: event.target.value })}
            placeholder="Placeholder"
            className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] focus-visible:ring-[#002FA7]"
          />
          <label className="flex h-10 items-center justify-between gap-3 border border-[#D8DDE7] bg-[#F7F7F8] px-3 text-sm font-semibold text-[#111111]">
            Requerido
            <Switch
              checked={props.field.required}
              onCheckedChange={(checked) => props.onUpdate({ required: checked })}
              className="data-[state=checked]:bg-[#002FA7]"
            />
          </label>
        </div>
        {props.field.type === 'select' && (
          <Input
            value={props.field.options.join(', ')}
            onChange={(event) => props.onUpdate({ options: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
            placeholder="Opciones separadas por coma"
            className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] focus-visible:ring-[#002FA7]"
          />
        )}
      </div>
    </div>
  );
}

function IconButton(props: { title: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      title={props.title}
      aria-label={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className="h-10 w-10 rounded-none border-[#D8DDE7] bg-[#FFFFFF] text-[#111111] hover:border-[#002FA7] hover:bg-[#FFFFFF]"
    >
      {props.children}
    </Button>
  );
}

function PublishRail(props: {
  draft: Partial<FormItem> | null;
  publicUrl: string;
  embedCode: string;
  submissions: SubmissionItem[];
  saving: boolean;
  onSave: () => void;
  onUpdateDraft: (updates: Partial<FormItem>) => void;
}) {
  if (!props.draft) {
    return (
      <aside className="border border-[#D8DDE7] bg-[#FFFFFF] p-4 text-sm text-[#525866] xl:sticky xl:top-4 xl:max-h-[calc(100vh-132px)]">
        Selecciona un formulario para ver publicacion y vista previa.
      </aside>
    );
  }

  const checks = [
    { label: 'Nombre', ok: Boolean(props.draft.name?.trim()) },
    { label: 'Instancia', ok: Boolean(props.draft.instanceId) },
    { label: 'Campos', ok: (props.draft.fields?.length ?? 0) > 0 },
    { label: 'Telefono', ok: hasPhoneField(props.draft.fields ?? []) },
  ];

  return (
    <aside className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-132px)] xl:overflow-y-auto">
      <Panel title="Publicacion" icon={<Link2 className="h-4 w-4" />}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {checks.map((check) => (
              <div key={check.label} className="flex items-center gap-2 border border-[#D8DDE7] bg-[#F7F7F8] px-3 py-2 text-xs font-semibold text-[#111111]">
                {check.ok ? <CheckCircle2 className="h-4 w-4 text-[#002FA7]" /> : <AlertCircle className="h-4 w-4 text-[#525866]" />}
                {check.label}
              </div>
            ))}
          </div>

          <Button
            type="button"
            onClick={props.onSave}
            disabled={props.saving}
            className="w-full rounded-none border border-[#002FA7] bg-[#002FA7] text-white hover:bg-[#002FA7]"
          >
            {props.saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar cambios
          </Button>

          <FieldBlock label="URL publica">
            <div className="flex gap-2">
              <Input
                value={props.publicUrl || 'Guarda el formulario para generar URL'}
                readOnly
                className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] text-xs focus-visible:ring-[#002FA7]"
              />
              <IconButton title="Copiar URL" disabled={!props.publicUrl} onClick={() => copyText(props.publicUrl)}>
                <Copy className="h-4 w-4" />
              </IconButton>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Abrir URL"
                aria-label="Abrir URL"
                disabled={!props.publicUrl}
                className="h-10 w-10 rounded-none border-[#D8DDE7] bg-[#FFFFFF] text-[#111111] hover:border-[#002FA7] hover:bg-[#FFFFFF]"
                asChild={Boolean(props.publicUrl)}
              >
                {props.publicUrl ? (
                  <a href={props.publicUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : (
                  <span>
                    <ExternalLink className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </div>
          </FieldBlock>

          <FieldBlock label="Codigo iframe">
            <Textarea
              value={props.embedCode || 'Guarda el formulario para generar el iframe'}
              readOnly
              rows={3}
              className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] font-mono text-xs focus-visible:ring-[#002FA7]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!props.embedCode}
              onClick={() => copyText(props.embedCode)}
              className="mt-2 rounded-none border-[#D8DDE7] bg-[#FFFFFF] text-[#111111] hover:border-[#002FA7] hover:bg-[#FFFFFF]"
            >
              <Copy className="mr-2 h-4 w-4" />
              Copiar codigo
            </Button>
          </FieldBlock>
        </div>
      </Panel>

      <StylePanel draft={props.draft} onUpdateDraft={props.onUpdateDraft} />
      <FormPreview form={props.draft} />
      <RecentSubmissions submissions={props.submissions} />
    </aside>
  );
}

function StylePanel({ draft, onUpdateDraft }: { draft: Partial<FormItem>; onUpdateDraft: (updates: Partial<FormItem>) => void }) {
  const style = draft.style ?? defaultStyle;

  return (
    <Panel title="Estilo publico" icon={<Eye className="h-4 w-4" />}>
      <StylePanelFields
        style={style}
        onChange={(updates) => onUpdateDraft({ style: { ...style, ...updates } })}
      />
    </Panel>
  );
}

function StylePanelFields(props: { style: FormStyle; onChange: (updates: Partial<FormStyle>) => void }) {
  const style = props.style;

  return (
    <div className="space-y-3">
      <FieldBlock label="Tema">
        <Select value={style.theme} onValueChange={(value) => props.onChange({ theme: value as FormStyle['theme'] })}>
          <SelectTrigger className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] focus:ring-[#002FA7]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="blank">Vacio</SelectItem>
            <SelectItem value="classic">Clasico</SelectItem>
            <SelectItem value="soft">Suave</SelectItem>
          </SelectContent>
        </Select>
      </FieldBlock>
      <div className="grid grid-cols-3 gap-2">
        <FieldBlock label="Fondo">
          <Input value={style.background} onChange={(event) => props.onChange({ background: event.target.value })} placeholder="#FFFFFF" className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] text-xs focus-visible:ring-[#002FA7]" />
        </FieldBlock>
        <FieldBlock label="Texto">
          <Input value={style.textColor} onChange={(event) => props.onChange({ textColor: event.target.value })} placeholder="#111111" className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] text-xs focus-visible:ring-[#002FA7]" />
        </FieldBlock>
        <FieldBlock label="Acento">
          <Input value={style.accentColor} onChange={(event) => props.onChange({ accentColor: event.target.value })} placeholder="#002FA7" className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] text-xs focus-visible:ring-[#002FA7]" />
        </FieldBlock>
      </div>
      <FieldBlock label="Bordes">
        <Select value={style.borderRadius} onValueChange={(value) => props.onChange({ borderRadius: value as FormStyle['borderRadius'] })}>
          <SelectTrigger className="rounded-none border-[#D8DDE7] bg-[#FFFFFF] focus:ring-[#002FA7]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin radio</SelectItem>
            <SelectItem value="small">Pequeno</SelectItem>
            <SelectItem value="medium">Medio</SelectItem>
            <SelectItem value="large">Grande</SelectItem>
          </SelectContent>
        </Select>
      </FieldBlock>
    </div>
  );
}

function FormPreview({ form }: { form: Partial<FormItem> }) {
  const style = form.style ?? defaultStyle;
  const accent = style.accentColor || '#002FA7';
  const background = style.background || '#FFFFFF';
  const textColor = style.textColor || '#111111';

  return (
    <Panel title="Vista previa" icon={<Eye className="h-4 w-4" />}>
      <div className="border border-[#D8DDE7] p-4" style={{ background, color: textColor }}>
        <div className="border-b pb-3" style={{ borderColor: accent }}>
          <p className="text-lg font-semibold">{form.name}</p>
          {form.description && <p className="mt-1 text-sm opacity-75">{form.description}</p>}
        </div>
        <div className="mt-4 space-y-3">
          {(form.fields ?? []).slice(0, 5).map((field) => (
            <PreviewField key={field.id} field={field} accent={accent} />
          ))}
        </div>
        <button type="button" className="mt-4 w-full px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: accent }}>
          {form.submitButtonLabel || 'Enviar'}
        </button>
      </div>
    </Panel>
  );
}

function PreviewField({ field, accent }: { field: FormField; accent: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold">
        {field.label}{field.required ? ' *' : ''}
      </p>
      {field.type === 'checkbox' ? (
        <div className="flex items-center gap-2 border px-3 py-2 text-sm">
          <span className="h-4 w-4 border" style={{ borderColor: accent }} />
          {field.placeholder || field.label}
        </div>
      ) : field.type === 'textarea' ? (
        <div className="h-16 border px-3 py-2 text-sm opacity-75">{field.placeholder}</div>
      ) : (
        <div className="h-9 border px-3 py-2 text-sm opacity-75">{field.placeholder}</div>
      )}
    </div>
  );
}

function RecentSubmissions({ submissions }: { submissions: SubmissionItem[] }) {
  return (
    <Panel title="Envios de este formulario" icon={<Inbox className="h-4 w-4" />}>
      <div className="space-y-2">
        {submissions.length === 0 ? (
          <div className="border border-dashed border-[#D8DDE7] bg-[#F7F7F8] px-3 py-4 text-sm text-[#525866]">Sin envios recibidos.</div>
        ) : (
          submissions.slice(0, 4).map((submission) => (
            <div key={submission.id} className="border border-[#D8DDE7] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-[#111111]">
                  {submission.contactName || submission.contactPhone || `Envio #${submission.id}`}
                </p>
                <StatusPill tone={submission.status === 'new' ? 'blue' : 'neutral'}>{submissionStatusLabels[submission.status]}</StatusPill>
              </div>
              <p className="mt-1 text-xs text-[#525866]">{formatDate(submission.submittedAt)}</p>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function SubmissionInbox(props: {
  submissions: SubmissionItem[];
  filter: SubmissionItem['status'] | 'all';
  selectedSubmissionId: number | null;
  onFilterChange: (filter: SubmissionItem['status'] | 'all') => void;
  onSelect: (id: number) => void;
}) {
  const filters: Array<{ value: SubmissionItem['status'] | 'all'; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'new', label: 'Nuevos' },
    { value: 'in_review', label: 'En revision' },
    { value: 'managed', label: 'Gestionados' },
    { value: 'archived', label: 'Archivados' },
  ];

  return (
    <section className="min-h-[520px] border border-[#D8DDE7] bg-[#FFFFFF]">
      <div className="border-b border-[#D8DDE7] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#111111]">
            <Inbox className="h-4 w-4 text-[#002FA7]" />
            Bandeja de envios
          </div>
          <div className="flex flex-wrap gap-1">
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => props.onFilterChange(filter.value)}
                className={cn(
                  'border px-2.5 py-1 text-xs font-semibold',
                  props.filter === filter.value
                    ? 'border-[#002FA7] bg-[#002FA7] text-white'
                    : 'border-[#D8DDE7] bg-[#FFFFFF] text-[#111111] hover:border-[#002FA7]',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="divide-y divide-[#D8DDE7]">
        {props.submissions.length === 0 ? (
          <div className="p-6 text-sm text-[#525866]">No hay envios para este filtro.</div>
        ) : (
          props.submissions.map((submission) => (
            <button
              key={submission.id}
              type="button"
              onClick={() => props.onSelect(submission.id)}
              className={cn(
                'grid w-full gap-3 px-4 py-3 text-left transition-colors md:grid-cols-[minmax(0,1fr)_160px_130px]',
                props.selectedSubmissionId === submission.id ? 'bg-[#F7F7F8]' : 'bg-[#FFFFFF] hover:bg-[#F7F7F8]',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[#111111]">
                  {submission.contactName || submission.contactPhone || `Envio #${submission.id}`}
                </span>
                <span className="mt-1 block truncate text-xs text-[#525866]">{submission.formName ?? 'Formulario eliminado'}</span>
              </span>
              <span className="flex items-center gap-2">
                <StatusPill tone={submission.status === 'new' ? 'blue' : 'neutral'}>{submissionStatusLabels[submission.status]}</StatusPill>
                <StatusPill tone={submission.messageStatus === 'error' ? 'danger' : 'neutral'}>{messageStatusLabels[submission.messageStatus]}</StatusPill>
              </span>
              <span className="text-xs text-[#525866]">{formatDate(submission.submittedAt)}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function SubmissionDetail(props: { submission: SubmissionItem | null; mutateSubmissions: KeyedMutator<SubmissionItem[]> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const submission = props.submission;

  async function updateStatus(status: SubmissionItem['status']) {
    if (!submission) return;
    setBusy(status);
    try {
      const response = await fetch(`/api/plugins/form-builder/submissions/${submission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('No se pudo actualizar.');
      await props.mutateSubmissions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar.');
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    if (!submission) return;
    setBusy('resend');
    try {
      const response = await fetch(`/api/plugins/form-builder/submissions/${submission.id}/resend`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo reenviar.');
      toast.success('Mensaje reenviado.');
      await props.mutateSubmissions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo reenviar.');
      await props.mutateSubmissions();
    } finally {
      setBusy(null);
    }
  }

  if (!submission) {
    return (
      <aside className="flex min-h-[360px] items-center justify-center border border-[#D8DDE7] bg-[#FFFFFF] p-4 text-sm text-[#525866] xl:sticky xl:top-4 xl:max-h-[calc(100vh-132px)]">
        Sin envios seleccionados.
      </aside>
    );
  }

  return (
    <aside className="border border-[#D8DDE7] bg-[#FFFFFF] xl:sticky xl:top-4 xl:max-h-[calc(100vh-132px)] xl:overflow-y-auto">
      <div className="border-b border-[#D8DDE7] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-[#111111]">
              {submission.contactName || submission.contactPhone || `Envio #${submission.id}`}
            </h2>
            <p className="mt-1 text-xs text-[#525866]">{submission.formName} via {submission.instanceName ?? 'instancia no disponible'}</p>
          </div>
          <StatusPill tone={submission.status === 'new' ? 'blue' : 'neutral'}>{submissionStatusLabels[submission.status]}</StatusPill>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <DetailStat label="Mensaje" value={messageStatusLabels[submission.messageStatus]} />
          <DetailStat label="Fecha" value={formatDate(submission.submittedAt)} />
        </div>

        {submission.messageError && (
          <div className="border border-[#111111] bg-[#FFFFFF] p-3 text-sm text-[#111111]">
            {submission.messageError}
          </div>
        )}

        <div className="space-y-2">
          {Object.entries(submission.data ?? {}).map(([key, value]) => (
            <div key={key} className="border border-[#D8DDE7] p-3">
              <p className="text-xs font-semibold text-[#525866]">{key}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-[#111111]">{valueToText(value)}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => updateStatus('in_review')}
            disabled={Boolean(busy)}
            className="justify-start rounded-none border-[#D8DDE7] bg-[#FFFFFF] text-[#111111] hover:border-[#002FA7] hover:bg-[#FFFFFF]"
          >
            <Inbox className="mr-2 h-4 w-4" />
            Marcar en revision
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => updateStatus('managed')}
            disabled={Boolean(busy)}
            className="justify-start rounded-none border-[#D8DDE7] bg-[#FFFFFF] text-[#111111] hover:border-[#002FA7] hover:bg-[#FFFFFF]"
          >
            <Check className="mr-2 h-4 w-4" />
            Marcar gestionado
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={resend}
            disabled={Boolean(busy)}
            className="justify-start rounded-none border-[#D8DDE7] bg-[#FFFFFF] text-[#111111] hover:border-[#002FA7] hover:bg-[#FFFFFF]"
          >
            {busy === 'resend' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Reenviar mensaje
          </Button>
        </div>
      </div>
    </aside>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#D8DDE7] bg-[#F7F7F8] px-3 py-2">
      <p className="text-xs font-semibold text-[#525866]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#111111]">{value}</p>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: 'blue' | 'neutral' | 'danger'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center border px-2 py-0.5 text-[11px] font-semibold',
        tone === 'blue' && 'border-[#002FA7] bg-[#002FA7] text-white',
        tone === 'neutral' && 'border-[#D8DDE7] bg-[#FFFFFF] text-[#525866]',
        tone === 'danger' && 'border-[#111111] bg-[#FFFFFF] text-[#111111]',
      )}
    >
      {children}
    </span>
  );
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
  toast.success('Copiado.');
}
