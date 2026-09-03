'use client';

/**
 * Prompt Studio.
 *
 * La vista vive ahora en `ui/skills/SkillsStudioView`, junto al lanzador, el
 * editor y las tarjetas: el Studio dejó de ser una lista de botones y pasó a
 * ser un gestor de skills con formulario, motor y recomendaciones, y eso no
 * entra en un archivo de vista. Este módulo queda como la puerta que usa el
 * shell (`SalesOpsApp`), con el nombre que la app ya conoce.
 */
export { SkillsStudioView as PromptStudioView } from '../skills/SkillsStudioView';
