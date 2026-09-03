'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  ArrowRight,
  Braces,
  Database,
  GitBranch,
  Link2,
  Plus,
  ShieldCheck,
  Trash2,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type {
  AppEntityDefinition,
  AppEntityFieldDefinition,
  AppFieldType,
  AppBlockDefinition,
  AppRelationDefinition,
  ApplicationDefinition,
} from '../shared/contract';

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo cargar el catálogo.');
  return response.json();
};

const FIELD_TYPES: Array<{ value: AppFieldType; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'long-text', label: 'Texto largo' },
  { value: 'rich-text', label: 'Texto enriquecido' },
  { value: 'number', label: 'Número' },
  { value: 'currency', label: 'Moneda' },
  { value: 'percent', label: 'Porcentaje' },
  { value: 'boolean', label: 'Sí / No' },
  { value: 'date', label: 'Fecha' },
  { value: 'datetime', label: 'Fecha y hora' },
  { value: 'duration', label: 'Duración' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'url', label: 'URL' },
  { value: 'status', label: 'Estado' },
  { value: 'select', label: 'Selección' },
  { value: 'multi-select', label: 'Selección múltiple' },
  { value: 'user', label: 'Usuario' },
  { value: 'department', label: 'Departamento' },
  { value: 'relation', label: 'Relación' },
  { value: 'image', label: 'Imagen privada' },
  { value: 'file', label: 'Archivo privado' },
  { value: 'audio', label: 'Audio privado' },
  { value: 'video', label: 'Video privado' },
  { value: 'formula', label: 'Fórmula' },
  { value: 'lookup', label: 'Lookup' },
  { value: 'rollup', label: 'Rollup' },
];

const RELATION_TYPES: Array<{ value: AppRelationDefinition['type']; label: string }> = [
  { value: 'belongs-to', label: 'Pertenece a' },
  { value: 'has-many', label: 'Tiene muchos' },
  { value: 'many-to-many', label: 'Muchos a muchos' },
  { value: 'one-to-one', label: 'Uno a uno' },
  { value: 'parent-child', label: 'Padre e hijo' },
  { value: 'polymorphic', label: 'Polimórfica' },
];

type Catalog = { resources: Array<{ key: string; title?: string; available: boolean }> };
type EditorTab = 'entities' | 'relations' | 'workflows';

function keyFrom(value: string) {
  return value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

function uniqueKey(base: string, used: Set<string>) {
  const initial = base || 'entidad';
  if (!used.has(initial)) return initial;
  let index = 2;
  while (used.has(`${initial}-${index}`)) index += 1;
  return `${initial}-${index}`;
}

function emptyField(key = 'nombre', label = 'Nombre'): AppEntityFieldDefinition {
  return { key, label, type: 'text', required: true, unique: false, permissions: {}, sensitive: false, hidden: false };
}

function formType(field: AppEntityFieldDefinition): NonNullable<AppBlockDefinition['form']>['fields'][number]['type'] {
  if (field.type === 'long-text') return 'textarea';
  if (field.type === 'boolean') return 'checkbox';
  if (field.type === 'status') return 'select';
  if (field.type === 'duration') return 'number';
  return field.type as NonNullable<AppBlockDefinition['form']>['fields'][number]['type'];
}

export function AppMakerDataModelEditor({ definition, onChange }: { definition: ApplicationDefinition; onChange: (definition: ApplicationDefinition) => void }) {
  const { data: catalog } = useSWR<Catalog>('/api/plugins/app-maker/catalog', fetcher);
  const [tab, setTab] = useState<EditorTab>('entities');
  const [selectedEntity, setSelectedEntity] = useState(definition.dataModel.entities[0]?.key ?? '');
  const [entityName, setEntityName] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [relationName, setRelationName] = useState('');
  const [relationTarget, setRelationTarget] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const entity = definition.dataModel.entities.find((candidate) => candidate.key === selectedEntity) ?? definition.dataModel.entities[0];
  const resourceOptions = useMemo(() => (catalog?.resources ?? []).filter((resource) => resource.available), [catalog]);

  function commit(mutator: (next: ApplicationDefinition) => void) {
    const next = structuredClone(definition);
    mutator(next);
    onChange(next);
  }

  function addEntity() {
    const name = entityName.trim();
    if (!name) return;
    const key = uniqueKey(keyFrom(name), new Set(definition.dataModel.entities.map((item) => item.key)));
    commit((next) => {
      next.dataModel.entities.push({ key, name, pluralName: name, titleField: 'nombre', fields: [emptyField()], permissions: {}, timestamps: true });
      if (!next.connectors.some((connector) => connector.key === 'app-maker')) next.connectors.push({ key: 'app-maker', type: 'internal', label: 'Datos de la aplicación' });
      const sourceKey = uniqueKey(key, new Set(next.dataSources.map((source) => source.key)));
      next.dataSources.push({ key: sourceKey, resource: `app:${key}`, pageSize: 25, fields: ['id', 'nombre', 'updatedAt'] });
    });
    setEntityName('');
    setSelectedEntity(key);
  }

  function removeEntity(target: AppEntityDefinition) {
    if (!window.confirm(`¿Eliminar el modelo ${target.name}? También se quitarán sus fuentes, relaciones, acciones y bloques vinculados. Los registros guardados no se borrarán hasta eliminarlos por la API.`)) return;
    commit((next) => {
      const sourceKeys = new Set(next.dataSources.filter((source) => source.resource === `app:${target.key}`).map((source) => source.key));
      const actionKeys = new Set(next.actions.filter((action) => action.connector === 'app-maker' && (action.inputDefaults?.entityKey === target.key || action.inputDefaults?.entity === target.key)).map((action) => action.key));
      next.dataModel.entities = next.dataModel.entities.filter((item) => item.key !== target.key);
      next.dataModel.relations = next.dataModel.relations.filter((relation) => relation.source.key !== target.key && !(relation.target.kind === 'entity' && relation.target.key === target.key));
      next.dataSources = next.dataSources.filter((source) => !sourceKeys.has(source.key));
      next.actions = next.actions.filter((action) => !actionKeys.has(action.key));
      next.workflows = next.workflows.filter((workflow) => workflow.trigger.entity !== target.key).map((workflow) => ({ ...workflow, steps: workflow.steps.filter((step) => !actionKeys.has(step.action)) })).filter((workflow) => workflow.steps.length > 0);
      next.views = next.views.map((view) => {
        const sections: ApplicationDefinition['views'][number]['sections'] = view.sections.map((section) => ({ ...section, blocks: section.blocks.filter((block) => !block.dataSource || !sourceKeys.has(block.dataSource)).map((block) => ({ ...block, actions: block.actions?.filter((action) => !actionKeys.has(action)), action: block.action && actionKeys.has(block.action) ? undefined : block.action })) })).filter((section) => section.blocks.length > 0);
        if (!sections.length) sections.push({ id: uniqueKey('contenido', new Set()), layout: 'stack', blocks: [{ id: uniqueKey('configurar-vista', new Set()), type: 'text', text: 'Agregá una entidad o editá esta vista desde la definición JSON.', grid: { desktop: 12, tablet: 12, mobile: 12 }, mobilePriority: 10, hidden: false, collapsible: false, sticky: false }] });
        return { ...view, sections };
      });
    });
    setSelectedEntity(definition.dataModel.entities.find((item) => item.key !== target.key)?.key ?? '');
  }

  function patchEntity(targetKey: string, patch: Partial<AppEntityDefinition>) {
    commit((next) => {
      const index = next.dataModel.entities.findIndex((item) => item.key === targetKey);
      if (index >= 0) next.dataModel.entities[index] = { ...next.dataModel.entities[index], ...patch };
    });
  }

  function addField() {
    if (!entity || !fieldName.trim()) return;
    const key = uniqueKey(keyFrom(fieldName), new Set(entity.fields.map((field) => field.key)));
    patchEntity(entity.key, { fields: [...entity.fields, emptyField(key, fieldName.trim())] });
    setFieldName('');
  }

  function patchField(fieldKey: string, patch: Partial<AppEntityFieldDefinition>) {
    if (!entity) return;
    patchEntity(entity.key, { fields: entity.fields.map((field) => field.key === fieldKey ? { ...field, ...patch } : field) });
  }

  function removeField(fieldKey: string) {
    if (!entity || entity.fields.length === 1) return;
    const fields = entity.fields.filter((field) => field.key !== fieldKey);
    patchEntity(entity.key, { fields, titleField: entity.titleField === fieldKey ? fields[0].key : entity.titleField });
  }

  function addCrudActions() {
    if (!entity) return;
    commit((next) => {
      if (!next.connectors.some((connector) => connector.key === 'app-maker')) next.connectors.push({ key: 'app-maker', type: 'internal', label: 'Datos de la aplicación' });
      const used = new Set(next.actions.map((action) => action.key));
      const specs = [
        { suffix: 'crear', label: `Crear ${entity.name}`, operation: 'appmaker_create_record', tone: 'primary' as const, scope: 'form' as const },
        { suffix: 'actualizar', label: `Actualizar ${entity.name}`, operation: 'appmaker_update_record', tone: 'secondary' as const, scope: 'form' as const },
        { suffix: 'eliminar', label: `Eliminar ${entity.name}`, operation: 'appmaker_delete_record', tone: 'destructive' as const, scope: 'record' as const },
      ];
      for (const spec of specs) {
        const key = uniqueKey(`${spec.suffix}-${entity.key}`, used);
        used.add(key);
        if (next.actions.some((action) => action.operation === spec.operation && action.inputDefaults?.entityKey === entity.key)) continue;
        next.actions.push({
          key,
          label: spec.label,
          connector: 'app-maker',
          operation: spec.operation,
          tone: spec.tone,
          scope: spec.scope,
          inputDefaults: { entityKey: entity.key },
          inputBindings: spec.operation === 'appmaker_create_record'
            ? undefined
            : spec.operation === 'appmaker_update_record'
              ? { recordId: '{{selected.id}}', expectedVersion: '{{selected.version}}' }
              : { recordId: '{{row.id}}', expectedVersion: '{{row.version}}' },
          confirmation: spec.tone === 'destructive' ? `¿Eliminar este registro de ${entity.name}?` : undefined,
          refresh: true,
        });
      }
      const source = next.dataSources.find((item) => item.resource === `app:${entity.key}`);
      const view = next.views[0];
      const section = view?.sections[0];
      if (!source || !section) return;
      const createAction = next.actions.find((action) => action.operation === 'appmaker_create_record' && action.inputDefaults?.entityKey === entity.key);
      const updateAction = next.actions.find((action) => action.operation === 'appmaker_update_record' && action.inputDefaults?.entityKey === entity.key);
      const deleteAction = next.actions.find((action) => action.operation === 'appmaker_delete_record' && action.inputDefaults?.entityKey === entity.key);
      const blockIds = new Set(next.views.flatMap((item) => item.sections.flatMap((group) => group.blocks.map((block) => block.id))));
      if (!section.blocks.some((block) => block.dataSource === source.key)) {
        section.blocks.push({
          id: uniqueKey(`tabla-${entity.key}`, blockIds),
          type: 'table',
          title: entity.pluralName ?? entity.name,
          dataSource: source.key,
          fields: entity.fields.filter((field) => !field.hidden).slice(0, 8).map((field) => field.key),
          actions: deleteAction ? [deleteAction.key] : [],
          grid: { desktop: 12, tablet: 12, mobile: 12 },
          mobilePriority: 30,
          hidden: false,
          collapsible: false,
          sticky: false,
        });
      }
      const formFields = entity.fields.filter((field) => !field.hidden && !['formula', 'lookup', 'rollup', 'relation'].includes(field.type)).slice(0, 30).map((field) => ({
        key: field.key,
        label: field.label,
        type: formType(field),
        required: field.required,
        options: field.options?.map((option) => ({ label: option.label, value: option.value })),
      }));
      if (createAction && formFields.length && !section.blocks.some((block) => block.action === createAction.key)) {
        section.blocks.push({ id: uniqueKey(`crear-${entity.key}`, blockIds), type: 'form', title: createAction.label, action: createAction.key, form: { fields: formFields, submitLabel: 'Guardar' }, grid: { desktop: 6, tablet: 12, mobile: 12 }, mobilePriority: 10, hidden: false, collapsible: false, sticky: false });
      }
      if (updateAction && formFields.length && !section.blocks.some((block) => block.action === updateAction.key)) {
        section.blocks.push({ id: uniqueKey(`editar-${entity.key}`, blockIds), type: 'form', title: updateAction.label, description: 'Seleccioná un registro y completá solo los campos que querés cambiar.', action: updateAction.key, form: { fields: formFields.map((field) => ({ ...field, required: false })), submitLabel: 'Actualizar' }, grid: { desktop: 6, tablet: 12, mobile: 12 }, mobilePriority: 20, hidden: false, collapsible: true, sticky: false });
      }
    });
  }

  function addRelation() {
    if (!entity || !relationName.trim() || !relationTarget) return;
    const [kind, targetKey] = relationTarget.split(':', 2) as ['entity' | 'resource', string];
    const key = uniqueKey(keyFrom(relationName), new Set(definition.dataModel.relations.map((relation) => relation.key)));
    commit((next) => next.dataModel.relations.push({ key, label: relationName.trim(), source: { kind: 'entity', key: entity.key }, target: { kind, key: targetKey } as AppRelationDefinition['target'], type: 'belongs-to', onDelete: 'unlink', required: false }));
    setRelationName('');
    setRelationTarget('');
  }

  function patchRelation(key: string, patch: Partial<AppRelationDefinition>) {
    commit((next) => { next.dataModel.relations = next.dataModel.relations.map((relation) => relation.key === key ? { ...relation, ...patch } : relation); });
  }

  function addWorkflow() {
    if (!workflowName.trim() || !entity || !definition.actions.length) return;
    const key = uniqueKey(keyFrom(workflowName), new Set(definition.workflows.map((workflow) => workflow.key)));
    commit((next) => next.workflows.push({ key, name: workflowName.trim(), enabled: true, trigger: { type: 'record-created', entity: entity.key }, steps: [{ action: next.actions[0].key, continueOnError: false }] }));
    setWorkflowName('');
  }

  const tabs: Array<{ key: EditorTab; label: string; icon: typeof Database; count: number }> = [
    { key: 'entities', label: 'Entidades', icon: Database, count: definition.dataModel.entities.length },
    { key: 'relations', label: 'Relaciones', icon: Link2, count: definition.dataModel.relations.length },
    { key: 'workflows', label: 'Flujos', icon: Workflow, count: definition.workflows.length },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#F7F7F8] text-[#111] [font-family:Helvetica_Neue,Helvetica,Arial,sans-serif]">
      <nav className="grid shrink-0 grid-cols-3 border-b border-[#111] bg-white">
        {tabs.map((item) => { const Icon = item.icon; return <button key={item.key} type="button" onClick={() => setTab(item.key)} className={cn('flex items-center justify-between border-r border-[#111] px-4 py-3 text-left text-xs font-semibold last:border-r-0', tab === item.key && 'bg-[#002FA7] text-white')}><span className="flex items-center gap-2"><Icon className="size-4" />{item.label}</span><span className="tabular-nums">{String(item.count).padStart(2, '0')}</span></button>; })}
      </nav>

      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
        <aside className="overflow-y-auto border-r border-[#111] bg-white">
          <div className="border-b border-[#111] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]">Modelo de datos</p>
            <p className="mt-1 text-xs text-[#555]">Esquema versionado; registros persistentes.</p>
          </div>
          {definition.dataModel.entities.map((item, index) => <button key={item.key} type="button" onClick={() => setSelectedEntity(item.key)} className={cn('grid w-full grid-cols-[34px_1fr] border-b border-[#B8B8BA] text-left', entity?.key === item.key && 'bg-[#E7ECFF]')}><span className="border-r border-[#B8B8BA] px-2 py-3 text-[10px] font-bold tabular-nums text-[#002FA7]">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 px-3 py-3"><span className="block truncate text-xs font-bold">{item.name}</span><span className="mt-0.5 block truncate text-[10px] text-[#555]">{item.key} · {item.fields.length} campos</span></span></button>)}
          <div className="space-y-2 p-3"><Input value={entityName} onChange={(event) => setEntityName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addEntity(); }} placeholder="Nombre de entidad" className="h-9 rounded-none border-[#111] bg-white text-xs" /><Button type="button" onClick={addEntity} disabled={!entityName.trim()} className="h-9 w-full rounded-none bg-[#002FA7] text-xs text-white hover:bg-[#002579]"><Plus className="size-3.5" />Agregar entidad</Button></div>
        </aside>

        <section className="min-h-0 overflow-y-auto">
          {!entity ? <div className="flex h-full items-center justify-center p-8 text-center"><div><Database className="mx-auto size-7 text-[#002FA7]" /><h3 className="mt-3 text-base font-bold">Creá la primera entidad</h3><p className="mt-1 max-w-sm text-xs text-[#555]">Cada entidad define sus campos, permisos, relaciones y registros propios.</p></div></div> : null}

          {entity && tab === 'entities' ? <div>
            <header className="grid gap-4 border-b border-[#111] bg-white p-5 lg:grid-cols-[1fr_1fr_auto]">
              <label className="text-[10px] font-bold uppercase tracking-[0.12em]">Nombre<Input value={entity.name} onChange={(event) => patchEntity(entity.key, { name: event.target.value })} className="mt-2 h-10 rounded-none border-[#111] text-sm normal-case tracking-normal" /></label>
              <label className="text-[10px] font-bold uppercase tracking-[0.12em]">Campo principal<select value={entity.titleField} onChange={(event) => patchEntity(entity.key, { titleField: event.target.value })} className="mt-2 h-10 w-full border border-[#111] bg-white px-3 text-sm font-normal normal-case tracking-normal">{entity.fields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>
              <div className="flex items-end gap-2"><Button type="button" onClick={addCrudActions} className="h-10 rounded-none bg-[#002FA7] text-white hover:bg-[#002579]"><Braces className="size-4" />Crear CRUD</Button><Button type="button" variant="outline" size="icon" onClick={() => removeEntity(entity)} className="h-10 w-10 rounded-none border-[#111] text-red-700" aria-label="Eliminar entidad"><Trash2 className="size-4" /></Button></div>
            </header>
            <div className="border-b border-[#111] px-5 py-3"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold">Campos</h3><p className="text-xs text-[#555]">Validación, privacidad y comportamiento de cada valor.</p></div><span className="text-3xl font-bold tabular-nums text-[#002FA7]">{String(entity.fields.length).padStart(2, '0')}</span></div></div>
            <div className="divide-y divide-[#B8B8BA] border-b border-[#111] bg-white">
              {entity.fields.map((field, index) => <div key={field.key} className="grid gap-3 p-4 lg:grid-cols-[36px_1fr_180px_auto]">
                <span className="pt-2 text-[10px] font-bold tabular-nums text-[#002FA7]">{String(index + 1).padStart(2, '0')}</span>
                <div className="grid gap-2 sm:grid-cols-2"><Input value={field.label} onChange={(event) => patchField(field.key, { label: event.target.value })} aria-label="Etiqueta del campo" className="h-9 rounded-none border-[#777] text-xs" /><Input value={field.key} readOnly aria-label="Clave del campo" className="h-9 rounded-none border-[#B8B8BA] bg-[#F7F7F8] font-mono text-[11px]" /></div>
                <select value={field.type} onChange={(event) => patchField(field.key, { type: event.target.value as AppFieldType })} className="h-9 border border-[#777] bg-white px-2 text-xs">{FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
                <div className="flex items-center gap-3"><label className="flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={field.required} onChange={(event) => patchField(field.key, { required: event.target.checked })} />Obligatorio</label><label className="flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={field.sensitive} onChange={(event) => patchField(field.key, { sensitive: event.target.checked })} />Sensible</label><button type="button" onClick={() => removeField(field.key)} disabled={entity.fields.length === 1} className="ml-auto p-2 text-red-700 disabled:opacity-30" aria-label={`Eliminar ${field.label}`}><Trash2 className="size-4" /></button></div>
              </div>)}
            </div>
            <div className="grid gap-2 p-4 sm:grid-cols-[1fr_auto]"><Input value={fieldName} onChange={(event) => setFieldName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addField(); }} placeholder="Nombre del nuevo campo" className="h-9 rounded-none border-[#111] bg-white text-xs" /><Button type="button" onClick={addField} disabled={!fieldName.trim()} className="h-9 rounded-none bg-[#111] text-white hover:bg-[#333]"><Plus className="size-3.5" />Agregar campo</Button></div>
            <EntityPermissionMatrix entity={entity} onChange={(permissions) => patchEntity(entity.key, { permissions })} />
          </div> : null}

          {entity && tab === 'relations' ? <div>
            <header className="border-b border-[#111] bg-white p-5"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold">Relaciones desde {entity.name}</h2><p className="mt-1 text-xs text-[#555]">Conectá registros propios con otras entidades o recursos existentes.</p></div><GitBranch className="size-6 text-[#002FA7]" /></div></header>
            <div className="divide-y divide-[#B8B8BA] border-b border-[#111] bg-white">
              {definition.dataModel.relations.filter((relation) => relation.source.key === entity.key).map((relation, index) => <div key={relation.key} className="grid gap-3 p-4 lg:grid-cols-[42px_1fr_190px_150px_auto]">
                <span className="flex size-8 items-center justify-center border border-[#002FA7] text-[10px] font-bold text-[#002FA7]">R{String(index + 1).padStart(2, '0')}</span>
                <div><p className="text-xs font-bold">{relation.label}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-[#555]">{relation.source.key}<ArrowRight className="size-3" />{relation.target.key}</p></div>
                <select value={relation.type} onChange={(event) => patchRelation(relation.key, { type: event.target.value as AppRelationDefinition['type'] })} className="h-9 border border-[#777] bg-white px-2 text-xs">{RELATION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
                <select value={relation.onDelete} onChange={(event) => patchRelation(relation.key, { onDelete: event.target.value as AppRelationDefinition['onDelete'] })} className="h-9 border border-[#777] bg-white px-2 text-xs"><option value="unlink">Desvincular</option><option value="restrict">Restringir</option><option value="cascade">Eliminar en cascada</option></select>
                <button type="button" onClick={() => commit((next) => { next.dataModel.relations = next.dataModel.relations.filter((item) => item.key !== relation.key); })} className="p-2 text-red-700" aria-label={`Eliminar ${relation.label}`}><Trash2 className="size-4" /></button>
              </div>)}
            </div>
            <div className="grid gap-2 p-4 lg:grid-cols-[1fr_1fr_auto]"><Input value={relationName} onChange={(event) => setRelationName(event.target.value)} placeholder="Nombre de la relación" className="h-10 rounded-none border-[#111] bg-white" /><select value={relationTarget} onChange={(event) => setRelationTarget(event.target.value)} className="h-10 border border-[#111] bg-white px-3 text-sm"><option value="">Seleccionar destino</option><optgroup label="Entidades de esta app">{definition.dataModel.entities.map((item) => <option key={item.key} value={`entity:${item.key}`}>{item.name}</option>)}</optgroup><optgroup label="Recursos de WhatsPro">{resourceOptions.map((resource) => <option key={resource.key} value={`resource:${resource.key}`}>{resource.title ?? resource.key}</option>)}</optgroup></select><Button type="button" onClick={addRelation} disabled={!relationName.trim() || !relationTarget} className="h-10 rounded-none bg-[#002FA7] text-white hover:bg-[#002579]"><Link2 className="size-4" />Vincular</Button></div>
          </div> : null}

          {entity && tab === 'workflows' ? <div>
            <header className="border-b border-[#111] bg-white p-5"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold">Flujos automatizados</h2><p className="mt-1 text-xs text-[#555]">Ejecutan acciones registradas al crear, actualizar o eliminar registros.</p></div><Workflow className="size-6 text-[#002FA7]" /></div></header>
            <div className="divide-y divide-[#B8B8BA] border-b border-[#111] bg-white">{definition.workflows.map((workflow, index) => <div key={workflow.key} className="grid gap-3 p-4 lg:grid-cols-[42px_1fr_190px_1fr_auto]"><span className="pt-2 text-[10px] font-bold tabular-nums text-[#002FA7]">{String(index + 1).padStart(2, '0')}</span><div><p className="text-xs font-bold">{workflow.name}</p><label className="mt-1 flex items-center gap-1.5 text-[10px] text-[#555]"><input type="checkbox" checked={workflow.enabled} onChange={(event) => commit((next) => { const item = next.workflows.find((candidate) => candidate.key === workflow.key); if (item) item.enabled = event.target.checked; })} />Activo</label></div><select value={workflow.trigger.type} onChange={(event) => commit((next) => { const item = next.workflows.find((candidate) => candidate.key === workflow.key); if (item) item.trigger.type = event.target.value as typeof item.trigger.type; })} className="h-9 border border-[#777] bg-white px-2 text-xs"><option value="manual">Manual</option><option value="record-created">Al crear</option><option value="record-updated">Al actualizar</option><option value="record-deleted">Al eliminar</option></select><div className="text-xs"><span className="font-bold">{workflow.steps.length} pasos</span><p className="mt-1 truncate text-[10px] text-[#555]">{workflow.steps.map((step) => step.action).join(' → ')}</p></div><button type="button" onClick={() => commit((next) => { next.workflows = next.workflows.filter((item) => item.key !== workflow.key); })} className="p-2 text-red-700" aria-label={`Eliminar ${workflow.name}`}><Trash2 className="size-4" /></button></div>)}</div>
            <div className="grid gap-2 p-4 lg:grid-cols-[1fr_auto]"><Input value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} placeholder={definition.actions.length ? 'Nombre del flujo' : 'Creá acciones antes de agregar un flujo'} disabled={!definition.actions.length} className="h-10 rounded-none border-[#111] bg-white" /><Button type="button" onClick={addWorkflow} disabled={!workflowName.trim() || !definition.actions.length} className="h-10 rounded-none bg-[#002FA7] text-white hover:bg-[#002579]"><Plus className="size-4" />Agregar flujo</Button></div>
          </div> : null}
        </section>
      </div>
    </div>
  );
}

function EntityPermissionMatrix({ entity, onChange }: { entity: AppEntityDefinition; onChange: (permissions: AppEntityDefinition['permissions']) => void }) {
  const operations = ['read', 'create', 'update', 'delete'] as const;
  const roles = ['owner', 'admin', 'agent'] as const;
  function toggle(operation: typeof operations[number], role: typeof roles[number]) {
    const current = entity.permissions[operation]?.roles ?? roles;
    const nextRoles = current.includes(role) ? current.filter((item) => item !== role) : [...current, role];
    onChange({ ...entity.permissions, [operation]: { ...(entity.permissions[operation] ?? {}), roles: nextRoles } });
  }
  return <section className="border-t border-[#111] bg-white p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-[#002FA7]" /><div className="min-w-0 flex-1"><h3 className="text-sm font-bold">Permisos por operación</h3><p className="mt-1 text-xs text-[#555]">La app también exige los permisos generales de App Maker.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[520px] border-collapse text-xs"><thead><tr><th className="border border-[#111] p-2 text-left">Operación</th>{roles.map((role) => <th key={role} className="border border-[#111] p-2 text-left capitalize">{role}</th>)}</tr></thead><tbody>{operations.map((operation) => <tr key={operation}><td className="border border-[#111] p-2 font-bold capitalize">{operation}</td>{roles.map((role) => <td key={role} className="border border-[#111] p-2"><input type="checkbox" checked={(entity.permissions[operation]?.roles ?? roles).includes(role)} onChange={() => toggle(operation, role)} aria-label={`${operation} ${role}`} /></td>)}</tr>)}</tbody></table></div></div></div></section>;
}
