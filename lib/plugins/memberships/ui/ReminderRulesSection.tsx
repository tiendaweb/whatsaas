'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, Bot, Loader2, MessageSquare, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { fetcher, type AutomationOption, type InstanceOption, type ReminderRule } from './shared';

type When = 'before' | 'on' | 'after';

type RuleForm = {
  id?: number;
  name: string;
  when: When;
  days: string;
  actionType: 'message' | 'automation';
  message: string;
  mediaUrl: string;
  automationId: string;
  instanceId: string;
  isActive: boolean;
};

function emptyForm(): RuleForm {
  return {
    name: '',
    when: 'before',
    days: '7',
    actionType: 'message',
    message: '',
    mediaUrl: '',
    automationId: '__none__',
    instanceId: '__auto__',
    isActive: true,
  };
}

function offsetToWhen(offsetDays: number): { when: When; days: string } {
  if (offsetDays < 0) return { when: 'before', days: String(-offsetDays) };
  if (offsetDays > 0) return { when: 'after', days: String(offsetDays) };
  return { when: 'on', days: '0' };
}

function whenToOffset(when: When, days: string): number {
  const n = Math.abs(parseInt(days || '0', 10)) || 0;
  if (when === 'before') return -n;
  if (when === 'after') return n;
  return 0;
}

function describeOffset(offsetDays: number): string {
  if (offsetDays < 0) return `${-offsetDays} día(s) antes del vencimiento`;
  if (offsetDays > 0) return `${offsetDays} día(s) después del vencimiento`;
  return 'El día del vencimiento';
}

export function ReminderRulesSection() {
  const { data, mutate } = useSWR<ReminderRule[]>('/api/plugins/memberships/reminder-rules', fetcher);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RuleForm | undefined>(undefined);
  const [toDelete, setToDelete] = useState<ReminderRule | null>(null);

  const rules = data ?? [];

  function handleNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function handleEdit(r: ReminderRule) {
    const { when, days } = offsetToWhen(r.offsetDays);
    setEditing({
      id: r.id,
      name: r.name,
      when,
      days,
      actionType: r.actionType,
      message: r.message,
      mediaUrl: r.mediaUrl ?? '',
      automationId: r.automationId != null ? String(r.automationId) : '__none__',
      instanceId: r.instanceId != null ? String(r.instanceId) : '__auto__',
      isActive: r.isActive,
    });
    setFormOpen(true);
  }

  async function handleSave(form: RuleForm) {
    const payload = {
      name: form.name,
      offsetDays: whenToOffset(form.when, form.days),
      actionType: form.actionType,
      message: form.actionType === 'message' ? form.message : '',
      mediaUrl: form.mediaUrl || null,
      automationId: form.actionType === 'automation' && form.automationId !== '__none__' ? parseInt(form.automationId, 10) : null,
      instanceId: form.instanceId === '__auto__' ? null : parseInt(form.instanceId, 10),
      isActive: form.isActive,
    };
    const res = await fetch(
      form.id ? `/api/plugins/memberships/reminder-rules/${form.id}` : '/api/plugins/memberships/reminder-rules',
      {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      toast.error('No se pudo guardar la regla');
      return false;
    }
    toast.success(form.id ? 'Regla actualizada' : 'Regla creada');
    mutate();
    return true;
  }

  async function toggleActive(rule: ReminderRule) {
    await fetch(`/api/plugins/memberships/reminder-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    mutate();
  }

  async function handleDelete() {
    if (!toDelete) return;
    const res = await fetch(`/api/plugins/memberships/reminder-rules/${toDelete.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('No se pudo eliminar');
      return;
    }
    toast.success('Regla eliminada');
    mutate();
    setToDelete(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Configura avisos automáticos de vencimiento enviados por WhatsApp al contacto.
        </p>
        <Button size="sm" onClick={handleNew} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Nueva regla
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-10 border border-dashed border-border rounded-lg">
          Sin reglas. Crea, por ejemplo, un aviso 7 días antes del vencimiento.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rules.map((rule) => (
            <div key={rule.id} className="border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    {rule.actionType === 'automation' ? <Bot className="h-4 w-4 text-sky-500" /> : <MessageSquare className="h-4 w-4 text-emerald-500" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{rule.name}</p>
                    <p className="text-xs text-muted-foreground">{describeOffset(rule.offsetDays)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch checked={rule.isActive} onCheckedChange={() => toggleActive(rule)} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={() => handleEdit(rule)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setToDelete(rule)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {rule.actionType === 'message' && rule.message && (
                <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/40 rounded px-2 py-1.5">{rule.message}</p>
              )}
              {!rule.isActive && <Badge variant="outline" className="text-xs">Inactiva</Badge>}
            </div>
          ))}
        </div>
      )}

      <RuleFormDialog open={formOpen} onOpenChange={setFormOpen} onSave={handleSave} initialData={editing} />

      {toDelete && (
        <Dialog open onOpenChange={(o) => !o && setToDelete(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>¿Eliminar &quot;{toDelete.name}&quot;?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setToDelete(null)}>Cancelar</Button>
              <Button size="sm" variant="destructive" onClick={handleDelete}>Eliminar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function RuleFormDialog({
  open,
  onOpenChange,
  onSave,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: RuleForm) => Promise<boolean>;
  initialData?: RuleForm;
}) {
  const { data: automations } = useSWR<AutomationOption[]>(open ? '/api/plugins/memberships/automations' : null, fetcher);
  const { data: instances } = useSWR<InstanceOption[]>(open ? '/api/instance/list' : null, fetcher);
  const [form, setForm] = useState<RuleForm>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);

  const automationList = Array.isArray(automations) ? automations : [];
  const instanceList = Array.isArray(instances) ? instances : [];

  function set<K extends keyof RuleForm>(key: K, value: RuleForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      alert('El nombre de la regla es requerido');
      return;
    }
    if (form.actionType === 'message' && !form.message.trim()) {
      alert('Escribe el mensaje a enviar');
      return;
    }
    if (form.actionType === 'automation' && form.automationId === '__none__') {
      alert('Selecciona una automatización');
      return;
    }
    setIsSaving(true);
    try {
      const ok = await onSave(form);
      if (ok) onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(initialData ?? emptyForm());
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData?.id ? 'Editar regla' : 'Nueva regla de recordatorio'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej: Aviso 7 días antes" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cuándo</Label>
              <Select value={form.when} onValueChange={(v) => set('when', v as When)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="before">Antes del vencimiento</SelectItem>
                  <SelectItem value="on">El día del vencimiento</SelectItem>
                  <SelectItem value="after">Después del vencimiento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Días</Label>
              <Input type="number" min="0" step="1" value={form.days} onChange={(e) => set('days', e.target.value)} disabled={form.when === 'on'} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Acción</Label>
            <Select value={form.actionType} onValueChange={(v) => set('actionType', v as RuleForm['actionType'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="message">Enviar mensaje</SelectItem>
                <SelectItem value="automation">Disparar automatización</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.actionType === 'message' ? (
            <>
              <div className="space-y-1.5">
                <Label>Mensaje <span className="text-destructive">*</span></Label>
                <Textarea value={form.message} onChange={(e) => set('message', e.target.value)} rows={3} className="resize-none text-sm" placeholder="Hola, tu membresía vence pronto..." />
              </div>
              <div className="space-y-1.5">
                <Label>URL de imagen (opcional)</Label>
                <Input value={form.mediaUrl} onChange={(e) => set('mediaUrl', e.target.value)} placeholder="https://..." />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label>Automatización <span className="text-destructive">*</span></Label>
              <Select value={form.automationId} onValueChange={(v) => set('automationId', v)}>
                <SelectTrigger><SelectValue placeholder="Selecciona una automatización" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Selecciona…</SelectItem>
                  {automationList.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">La automatización se ejecuta en la conexión del contacto.</p>
            </div>
          )}

          {form.actionType === 'message' && (
            <div className="space-y-1.5">
              <Label>Conexión de WhatsApp</Label>
              <Select value={form.instanceId} onValueChange={(v) => set('instanceId', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Automática (la del contacto)</SelectItem>
                  {instanceList.map((inst) => (
                    <SelectItem key={inst.id} value={String(inst.id)}>{inst.instanceName || inst.name || `Conexión #${inst.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Regla activa</span>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
