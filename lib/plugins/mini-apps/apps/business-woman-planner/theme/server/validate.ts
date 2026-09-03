import 'server-only';

import { bwCollectionFields, bwFieldDef } from '../shared/collections';
import type { BwBinding, BwBlock, BwThemeDefinition, BwValidationIssue, BwValidationResult, BwView } from '../shared/schema';

/**
 * Validación SEMÁNTICA (referencias cruzadas, duplicados) que zod no puede
 * expresar. Se corre siempre después de que la forma ya pasó zod — mismo
 * orden de dos capas que `lib/plugins/radar/server/engine/validate.ts`.
 * Todo lo que reporta acá es ERROR bloqueante: a diferencia de Radar (donde
 * un binding roto sólo apaga un componente en runtime), acá preferimos que
 * la escritura falle con un mensaje accionable a que el conector publique
 * una vista con una columna que nunca va a mostrar nada.
 */
export function validateBwThemeDefinition(definition: BwThemeDefinition): BwValidationResult {
  const errors: BwValidationIssue[] = [];
  const warnings: BwValidationIssue[] = [];
  const push = (path: string, message: string) => errors.push({ severity: 'error', path, message });

  const viewIds = new Set<string>(definition.views.map((view) => view.id));
  definition.views.forEach((view, viewIndex) => {
    const path = `/views/${viewIndex}`;
    const seenBefore = definition.views.slice(0, viewIndex).some((other) => other.id === view.id);
    if (seenBefore) push(`${path}/id`, `Id de vista duplicado: "${view.id}".`);
    validateView(view, path, push, warnings, viewIds);
  });

  const menuIds = new Set<string>();
  definition.menu.forEach((item, index) => {
    const path = `/menu/${index}`;
    if (menuIds.has(item.id)) push(`${path}/id`, `Id de ítem de menú duplicado: "${item.id}".`);
    menuIds.add(item.id);
    if (item.kind === 'custom' && !viewIds.has(item.viewId)) {
      push(`${path}/viewId`, `El ítem de menú "${item.id}" apunta a la vista "${item.viewId}", que no existe en definition.views.`);
    }
  });

  const primaryCount = definition.menu.filter((item) => item.visible && item.primary).length;
  if (primaryCount > 4) {
    warnings.push({
      severity: 'warning',
      path: '/menu',
      message: `Hay ${primaryCount} ítems marcados primary=true; sólo los primeros 4 visibles entran en la barra inferior de móvil.`,
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

function validateView(
  view: BwView,
  path: string,
  push: (path: string, message: string) => void,
  warnings: BwValidationIssue[],
  viewIds: Set<string>,
) {
  const blockIds = new Set<string>();
  let count = 0;
  const walk = (blocks: BwBlock[], blockPath: string) => {
    blocks.forEach((block, index) => {
      count += 1;
      const bp = `${blockPath}/${index}`;
      if (blockIds.has(block.id)) push(`${bp}/id`, `Id de bloque duplicado en la vista "${view.id}": "${block.id}".`);
      blockIds.add(block.id);

      if (block.type === 'columns') {
        block.lanes.forEach((lane, laneIndex) => walk(lane, `${bp}/lanes/${laneIndex}`));
        return;
      }
      validateBlockFields(block, bp, push, viewIds);
    });
  };
  walk(view.blocks, `${path}/blocks`);

  if (count > 12) {
    warnings.push({
      severity: 'warning',
      path: `${path}/blocks`,
      message: `La vista "${view.id}" tiene ${count} bloques; conviene dividir en varias vistas para que se lea bien en móvil.`,
    });
  }
}

/**
 * Sólo valida referencias de campo para bindings `local` (contra el catálogo
 * cerrado de `shared/collections.ts`). Un binding `system` referencia un
 * recurso real de WhatsPro cuyo catálogo de campos vive en Radar Engine
 * (`whatspro_radar_engine_catalog`) — no se duplica acá. Si trae `select`
 * explícito, al menos se chequea que las referencias estén ahí adentro; si
 * no, se confía en el default del source y el error, si lo hay, sale recién
 * al resolver (se degrada a ese bloque en error, nunca rompe la vista — igual
 * criterio que Radar).
 */
function fieldCheckerFor(binding: BwBinding, path: string, push: (path: string, message: string) => void) {
  if (binding.kind === 'local') {
    const fields = bwCollectionFields(binding.collection);
    const fieldKeys = new Set(fields.map((f) => f.key));
    return (field: string, fieldPath: string) => {
      if (!fieldKeys.has(field)) push(fieldPath, `"${field}" no es un campo de la colección "${binding.collection}".`);
    };
  }
  const selectSet = binding.select?.length ? new Set(binding.select) : null;
  return (field: string, fieldPath: string) => {
    if (selectSet && !selectSet.has(field)) {
      push(fieldPath, `"${field}" no está en el "select" del binding a "${binding.source}" — agregalo ahí o sacá el select para usar los campos por defecto del source.`);
    }
  };
}

function validateBinding(binding: BwBinding, path: string, push: (path: string, message: string) => void) {
  if (binding.kind === 'local') {
    const check = fieldCheckerFor(binding, path, push);
    (binding.filters ?? []).forEach((filter, index) => check(filter.field, `${path}/filters/${index}/field`));
    if (binding.sortField) check(binding.sortField, `${path}/sortField`);
  }
  // Los `where`/`sort` de un binding `system` usan `radarConditionSchema`, que
  // ya viene validado por zod (capa 1); sus campos se resuelven contra la
  // whitelist real del source al leer, en el servidor.
}

function validateBlockFields(block: Exclude<BwBlock, { type: 'columns' }>, path: string, push: (path: string, message: string) => void, viewIds: Set<string>) {
  switch (block.type) {
    case 'metric': {
      validateBinding(block.binding, `${path}/binding`, push);
      if (block.aggregate !== 'count') {
        if (!block.field) {
          push(`${path}/field`, `El bloque metric "${block.id}" usa aggregate="${block.aggregate}" pero no indica field.`);
        } else if (block.binding.kind === 'local') {
          const def = bwFieldDef(block.binding.collection, block.field);
          if (!def) push(`${path}/field`, `"${block.field}" no es un campo de "${block.binding.collection}".`);
          else if (def.type !== 'number') push(`${path}/field`, `"${block.field}" no es numérico; aggregate="${block.aggregate}" lo requiere.`);
        }
      }
      return;
    }
    case 'list': {
      validateBinding(block.binding, `${path}/binding`, push);
      const check = fieldCheckerFor(block.binding, `${path}/binding`, push);
      check(block.primaryField, `${path}/primaryField`);
      if (block.secondaryField) check(block.secondaryField, `${path}/secondaryField`);
      return;
    }
    case 'table': {
      validateBinding(block.binding, `${path}/binding`, push);
      const check = fieldCheckerFor(block.binding, `${path}/binding`, push);
      block.columns.forEach((col, index) => check(col, `${path}/columns/${index}`));
      return;
    }
    case 'cards': {
      validateBinding(block.binding, `${path}/binding`, push);
      const check = fieldCheckerFor(block.binding, `${path}/binding`, push);
      check(block.titleField, `${path}/titleField`);
      if (block.subtitleField) check(block.subtitleField, `${path}/subtitleField`);
      if (block.badgeField) check(block.badgeField, `${path}/badgeField`);
      return;
    }
    case 'quick_actions': {
      block.actions.forEach((action, index) => {
        if (action.action.kind === 'navigate' && action.action.viewId && !viewIds.has(action.action.viewId)) {
          push(`${path}/actions/${index}/action/viewId`, `La acción "${action.label}" navega a la vista "${action.action.viewId}", que no existe en definition.views.`);
        }
      });
      return;
    }
    case 'form_button':
    case 'heading':
    case 'text':
    case 'rotating_text':
    case 'image':
    case 'kanban':
      return;
  }
}
