/**
 * Validación SEMÁNTICA de una definición de app del Radar Engine: lo que zod
 * no puede ver (referencias entre partes del documento, slugs repetidos,
 * acciones a medio armar). Los errores bloquean publicar; los warnings son
 * consejos que la IA puede ignorar bajo su responsabilidad.
 *
 * Sin 'server-only' a propósito: lo usan los scripts de seed para validar
 * definiciones sin levantar Next.
 */
import type {
  RadarAppDefinition,
  RadarMetric,
  RadarValidationIssue,
  RadarValidationResult,
} from '@/lib/plugins/radar/shared/engine';
import { checkFormulaSyntax, formulaIdentifiers } from '@/lib/plugins/radar/shared/formula';

/**
 * ¿La métrica `key` participa de un ciclo de fórmulas? DFS simple sobre las
 * referencias; las fórmulas con sintaxis rota se saltean (ya tienen su error).
 */
function hasFormulaCycle(key: string, metrics: RadarMetric[]): boolean {
  const visiting = new Set<string>();
  const walk = (current: string): boolean => {
    if (visiting.has(current)) return true;
    const metric = metrics.find((candidate) => candidate.key === current);
    if (!metric?.formula) return false;
    let names: string[];
    try {
      names = formulaIdentifiers(metric.formula);
    } catch {
      return false;
    }
    visiting.add(current);
    for (const name of names) {
      if (walk(name)) return true;
    }
    visiting.delete(current);
    return false;
  };
  return walk(key);
}

/** Junta los slugs repetidos de una lista y avisa dónde está cada repetición. */
function checkDuplicates(
  items: Array<{ slug: string; path: string }>,
  label: string,
  errors: RadarValidationIssue[],
) {
  const seen = new Map<string, string>();
  for (const item of items) {
    const first = seen.get(item.slug);
    if (first) {
      errors.push({
        severity: 'error',
        path: item.path,
        message: `${label} "${item.slug}" repetido (ya está en ${first})`,
      });
    } else {
      seen.set(item.slug, item.path);
    }
  }
}

export function validateRadarAppDefinition(
  def: RadarAppDefinition,
  options?: { knownSources?: string[] },
): RadarValidationResult {
  const errors: RadarValidationIssue[] = [];
  const warnings: RadarValidationIssue[] = [];

  const views = def.views ?? [];
  const datasources = def.datasources ?? [];
  const metrics = def.metrics ?? [];
  const actions = def.actions ?? [];

  const viewSlugs = new Set(views.map((v) => v.slug));
  const datasourceKeys = new Set(datasources.map((d) => d.key));
  const metricKeys = new Set(metrics.map((m) => m.key));
  const actionKeys = new Set(actions.map((a) => a.key));
  const knownSources = options?.knownSources ? new Set(options.knownSources) : null;

  /* ---------------- Slugs duplicados ---------------- */

  checkDuplicates(views.map((v, i) => ({ slug: v.slug, path: `/views/${i}/slug` })), 'vista', errors);
  checkDuplicates(datasources.map((d, i) => ({ slug: d.key, path: `/datasources/${i}/key` })), 'datasource', errors);
  checkDuplicates(metrics.map((m, i) => ({ slug: m.key, path: `/metrics/${i}/key` })), 'métrica', errors);
  checkDuplicates(actions.map((a, i) => ({ slug: a.key, path: `/actions/${i}/key` })), 'acción', errors);
  views.forEach((view, vi) => {
    checkDuplicates(
      view.components.map((c, ci) => ({ slug: c.id, path: `/views/${vi}/components/${ci}/id` })),
      'componente',
      errors,
    );
  });

  /* ---------------- Referencias rotas ---------------- */

  if (def.defaultView && !viewSlugs.has(def.defaultView)) {
    errors.push({
      severity: 'error',
      path: '/defaultView',
      message: `defaultView apunta a la vista "${def.defaultView}", que no existe`,
    });
  }

  (def.navigation ?? []).forEach((item, i) => {
    if (!viewSlugs.has(item.view)) {
      errors.push({
        severity: 'error',
        path: `/navigation/${i}/view`,
        message: `la navegación apunta a la vista "${item.view}", que no existe`,
      });
    }
    if (item.badgeMetric && !metricKeys.has(item.badgeMetric)) {
      errors.push({
        severity: 'error',
        path: `/navigation/${i}/badgeMetric`,
        message: `badgeMetric apunta a la métrica "${item.badgeMetric}", que no existe`,
      });
    }
  });

  views.forEach((view, vi) => {
    if (view.badgeMetric && !metricKeys.has(view.badgeMetric)) {
      errors.push({
        severity: 'error',
        path: `/views/${vi}/badgeMetric`,
        message: `badgeMetric apunta a la métrica "${view.badgeMetric}", que no existe`,
      });
    }

    view.components.forEach((component, ci) => {
      const base = `/views/${vi}/components/${ci}`;

      if (component.binding?.kind === 'datasource' && !datasourceKeys.has(component.binding.ref)) {
        errors.push({
          severity: 'error',
          path: `${base}/binding/ref`,
          message: `el binding apunta al datasource "${component.binding.ref}", que no existe`,
        });
      }
      if (component.binding?.kind === 'metrics') {
        component.binding.refs.forEach((ref, ri) => {
          if (!metricKeys.has(ref)) {
            errors.push({
              severity: 'error',
              path: `${base}/binding/refs/${ri}`,
              message: `el binding apunta a la métrica "${ref}", que no existe`,
            });
          }
        });
      }
      (component.actions ?? []).forEach((key, ai) => {
        if (!actionKeys.has(key)) {
          errors.push({
            severity: 'error',
            path: `${base}/actions/${ai}`,
            message: `el componente usa la acción "${key}", que no existe`,
          });
        }
      });
      if (component.when && !metricKeys.has(component.when.metric)) {
        errors.push({
          severity: 'error',
          path: `${base}/when/metric`,
          message: `when apunta a la métrica "${component.when.metric}", que no existe`,
        });
      }
    });
  });

  /* ---------------- Métricas ---------------- */

  metrics.forEach((metric, i) => {
    // Métrica de FÓRMULA: sintaxis + referencias a otras métricas + ciclos.
    if (metric.formula) {
      const syntaxError = checkFormulaSyntax(metric.formula);
      if (syntaxError) {
        errors.push({
          severity: 'error',
          path: `/metrics/${i}/formula`,
          message: `la fórmula de "${metric.key}" no compila: ${syntaxError}`,
        });
        return;
      }
      for (const name of formulaIdentifiers(metric.formula)) {
        if (!metricKeys.has(name)) {
          errors.push({
            severity: 'error',
            path: `/metrics/${i}/formula`,
            message: `la fórmula de "${metric.key}" usa "${name}", que no es una métrica de la app`,
          });
        }
      }
      if (hasFormulaCycle(metric.key, metrics)) {
        errors.push({
          severity: 'error',
          path: `/metrics/${i}/formula`,
          message: `la fórmula de "${metric.key}" forma un ciclo de métricas que se referencian entre sí`,
        });
      }
      return;
    }

    if (!metric.source || !metric.aggregation) {
      errors.push({
        severity: 'error',
        path: `/metrics/${i}`,
        message: `la métrica "${metric.key}" necesita source y aggregation (o una formula)`,
      });
      return;
    }
    if (metric.aggregation !== 'count' && !metric.field) {
      errors.push({
        severity: 'error',
        path: `/metrics/${i}/field`,
        message: `la métrica "${metric.key}" agrega con ${metric.aggregation} y necesita un field`,
      });
    }
    // `source` puede ser el key de un datasource de la app o un source del
    // sistema: sólo se chequea contra el catálogo si NO es un datasource propio.
    if (!datasourceKeys.has(metric.source)) {
      if (knownSources && !knownSources.has(metric.source)) {
        errors.push({
          severity: 'error',
          path: `/metrics/${i}/source`,
          message: `la métrica "${metric.key}" usa el source "${metric.source}", que no es un datasource de la app ni un source conocido`,
        });
      } else if (!knownSources) {
        warnings.push({
          severity: 'warning',
          path: `/metrics/${i}/source`,
          message: `no se pudo verificar el source "${metric.source}" de la métrica "${metric.key}"`,
        });
      }
    }
  });

  /* ---------------- Campos computados de datasources ---------------- */

  datasources.forEach((ds, i) => {
    (ds.compute ?? []).forEach((entry, j) => {
      const syntaxError = checkFormulaSyntax(entry.formula);
      if (syntaxError) {
        errors.push({
          severity: 'error',
          path: `/datasources/${i}/compute/${j}/formula`,
          message: `el campo computado "${entry.as}" de "${ds.key}" no compila: ${syntaxError}`,
        });
      }
    });
    // Un where sobre un campo computado nunca va a matchear en SQL: avisar.
    const computedNames = new Set((ds.compute ?? []).map((entry) => entry.as));
    (ds.where ?? []).forEach((condition, j) => {
      if (computedNames.has(condition.field)) {
        errors.push({
          severity: 'error',
          path: `/datasources/${i}/where/${j}/field`,
          message: `"${condition.field}" es un campo computado: se calcula después de la query y no se puede usar en where (sí en sort y en map)`,
        });
      }
    });
  });

  /* ---------------- Acciones ---------------- */

  actions.forEach((action, i) => {
    if (action.kind === 'navigate' && (!action.url || !action.url.startsWith('/'))) {
      errors.push({
        severity: 'error',
        path: `/actions/${i}/url`,
        message: `la acción navigate "${action.key}" necesita una url interna que empiece con /`,
      });
    }
    if (action.kind === 'open_url' && (!action.url || !action.url.startsWith('https://'))) {
      errors.push({
        severity: 'error',
        path: `/actions/${i}/url`,
        message: `la acción open_url "${action.key}" necesita una url https://`,
      });
    }
    if (action.kind === 'open_app' && !action.appSlug) {
      errors.push({
        severity: 'error',
        path: `/actions/${i}/appSlug`,
        message: `la acción open_app "${action.key}" necesita el slug de la app destino`,
      });
    }
    if (action.kind === 'copy' && !action.text) {
      errors.push({
        severity: 'error',
        path: `/actions/${i}/text`,
        message: `la acción copy "${action.key}" necesita el texto a copiar`,
      });
    }
  });

  /* ---------------- Datasources ---------------- */

  datasources.forEach((ds, i) => {
    if (knownSources && !knownSources.has(ds.source)) {
      errors.push({
        severity: 'error',
        path: `/datasources/${i}/source`,
        message: `el datasource "${ds.key}" usa el source "${ds.source}", que no es un source conocido`,
      });
    } else if (!knownSources) {
      warnings.push({
        severity: 'warning',
        path: `/datasources/${i}/source`,
        message: `no se pudo verificar el source "${ds.source}" del datasource "${ds.key}"`,
      });
    }
    if (typeof ds.limit === 'number' && ds.limit > 50) {
      warnings.push({
        severity: 'warning',
        path: `/datasources/${i}/limit`,
        message: `el datasource "${ds.key}" pide ${ds.limit} filas: una query así de grande sale cara en cada resolución`,
      });
    }
  });

  /* ---------------- Layout y tamaño ---------------- */

  views.forEach((view, vi) => {
    if (view.components.length > 20) {
      warnings.push({
        severity: 'warning',
        path: `/views/${vi}/components`,
        message: `la vista "${view.slug}" tiene ${view.components.length} componentes: más de 20 se vuelve pesada de resolver y de leer`,
      });
    }
    view.components.forEach((component, ci) => {
      const desktop = component.grid?.desktop;
      if (desktop && typeof desktop.x === 'number' && typeof desktop.w === 'number' && desktop.x + desktop.w > 12) {
        warnings.push({
          severity: 'warning',
          path: `/views/${vi}/components/${ci}/grid/desktop`,
          message: `el componente "${component.id}" se pasa de la grilla: x=${desktop.x} + w=${desktop.w} supera las 12 columnas`,
        });
      }
    });
  });

  if (!def.defaultView) {
    warnings.push({
      severity: 'warning',
      path: '/defaultView',
      message: 'la app no declara defaultView: se abre en la primera vista del array, que puede cambiar al reordenar',
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}
