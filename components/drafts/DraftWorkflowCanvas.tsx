'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DraftDepartment, DraftStage, DraftTask, DraftWorkflow } from './types';

type Props = {
  value: DraftWorkflow;
  departments: DraftDepartment[];
  onChange: (workflow: DraftWorkflow) => void;
};

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function DraftWorkflowCanvas({ value, departments, onChange }: Props) {
  const stages = value.stages ?? [];
  const tasks = value.tasks ?? [];

  const updateStage = (stageId: string, patch: Partial<DraftStage>) => {
    onChange({
      ...value,
      stages: stages.map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage)),
    });
  };

  const addStage = () => {
    const nextOrder = stages.length;
    onChange({
      ...value,
      stages: [
        ...stages,
        { id: makeId('stage'), name: `Etapa ${nextOrder + 1}`, order: nextOrder },
      ],
    });
  };

  const removeStage = (stageId: string) => {
    const remainingStages = stages
      .filter((stage) => stage.id !== stageId)
      .map((stage, index) => ({ ...stage, order: index }));

    onChange({
      stages: remainingStages,
      tasks: tasks.filter((task) => task.stageId !== stageId),
    });
  };

  const moveStage = (stageId: string, direction: -1 | 1) => {
    const index = stages.findIndex((stage) => stage.id === stageId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= stages.length) return;

    const reordered = [...stages];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    onChange({
      ...value,
      stages: reordered.map((stage, order) => ({ ...stage, order })),
    });
  };

  const addTask = (stageId: string) => {
    const stageTasks = tasks.filter((task) => task.stageId === stageId);
    const nextOrder = stageTasks.length;
    onChange({
      ...value,
      tasks: [
        ...tasks,
        {
          id: makeId('task'),
          stageId,
          name: `Tarea ${nextOrder + 1}`,
          order: nextOrder,
          type: 'task',
          parentTaskId: null,
        },
      ],
    });
  };

  const updateTask = (taskId: string, patch: Partial<DraftTask>) => {
    onChange({
      ...value,
      tasks: tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    });
  };

  const removeTask = (taskId: string) => {
    const target = tasks.find((task) => task.id === taskId);
    if (!target) return;

    const filtered = tasks.filter((task) => task.id !== taskId && task.parentTaskId !== taskId);
    const reordered = filtered.map((task) => {
      if (task.stageId !== target.stageId) return task;
      const sameStage = filtered
        .filter((item) => item.stageId === task.stageId)
        .sort((a, b) => a.order - b.order);
      return { ...task, order: sameStage.findIndex((item) => item.id === task.id) };
    });

    onChange({ ...value, tasks: reordered });
  };

  return (
    <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Workflow por etapas</p>
        <Button type="button" size="sm" variant="outline" onClick={addStage}>
          <Plus className="h-4 w-4 mr-1" /> Etapa
        </Button>
      </div>

      {stages.length === 0 && (
        <p className="text-xs text-muted-foreground">Agrega etapas para estructurar el borrador.</p>
      )}

      {stages
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((stage, index) => {
          const stageTasks = tasks
            .filter((task) => task.stageId === stage.id)
            .sort((a, b) => a.order - b.order);

          return (
            <div key={stage.id} className="rounded border bg-background p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={stage.name}
                  onChange={(event) => updateStage(stage.id, { name: event.target.value })}
                  placeholder="Nombre de etapa"
                />
                <Select
                  value={stage.departmentId ? String(stage.departmentId) : 'none'}
                  onValueChange={(nextValue) =>
                    updateStage(stage.id, {
                      departmentId: nextValue === 'none' ? null : Number(nextValue),
                    })
                  }
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin departamento</SelectItem>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={String(department.id)}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={index === 0}
                  onClick={() => moveStage(stage.id, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={index === stages.length - 1}
                  onClick={() => moveStage(stage.id, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" onClick={() => removeStage(stage.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="space-y-2 pl-2 border-l">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Tareas</p>
                  <Button type="button" size="sm" variant="ghost" onClick={() => addTask(stage.id)}>
                    <Plus className="h-4 w-4 mr-1" /> Tarea
                  </Button>
                </div>

                {stageTasks.map((task) => (
                  <div key={task.id} className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      className="col-span-6"
                      value={task.name}
                      onChange={(event) => updateTask(task.id, { name: event.target.value })}
                      placeholder="Nombre de tarea"
                    />
                    <Select
                      value={task.type}
                      onValueChange={(typeValue: DraftTask['type']) => updateTask(task.id, { type: typeValue })}
                    >
                      <SelectTrigger className="col-span-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="task">Tarea</SelectItem>
                        <SelectItem value="subtask">Subtarea</SelectItem>
                        <SelectItem value="group">Agrupador</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={task.parentTaskId ?? 'none'}
                      onValueChange={(nextValue) =>
                        updateTask(task.id, { parentTaskId: nextValue === 'none' ? null : nextValue })
                      }
                    >
                      <SelectTrigger className="col-span-2">
                        <SelectValue placeholder="Padre" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin padre</SelectItem>
                        {stageTasks
                          .filter((option) => option.id !== task.id)
                          .map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeTask(task.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
