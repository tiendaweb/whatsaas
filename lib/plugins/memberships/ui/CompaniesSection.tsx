'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowRight, Building2, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { fetcher, type Company, type Plan } from './shared';

type CompanyForm = {
  id?: number;
  name: string;
  description: string;
  logoUrl: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

const EMPTY: CompanyForm = { name: '', description: '', logoUrl: '', website: '', email: '', phone: '', address: '', notes: '' };

export function CompaniesSection() {
  const t = useTranslations('Memberships');
  const { data, mutate } = useSWR<Company[]>('/api/plugins/memberships/companies', fetcher);
  const { data: plansData } = useSWR<Plan[]>('/api/plugins/memberships/plans', fetcher);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyForm | undefined>(undefined);
  const [toDelete, setToDelete] = useState<Company | null>(null);

  const companies = data ?? [];
  const plans = plansData ?? [];

  function planCount(companyId: number) {
    return plans.filter((p) => p.companyId === companyId).length;
  }

  function handleNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function handleEdit(c: Company) {
    setEditing({ id: c.id, name: c.name, description: c.description, logoUrl: c.logoUrl ?? '', website: c.website ?? '', email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '', notes: c.notes });
    setFormOpen(true);
  }

  async function handleSave(form: CompanyForm) {
    const payload = {
      name: form.name,
      description: form.description,
      logoUrl: form.logoUrl || null,
      website: form.website || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      notes: form.notes,
    };
    const res = await fetch(
      form.id ? `/api/plugins/memberships/companies/${form.id}` : '/api/plugins/memberships/companies',
      {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      toast.error('No se pudo guardar la empresa');
      return false;
    }
    toast.success(form.id ? 'Empresa actualizada' : 'Empresa creada');
    mutate();
    return true;
  }

  async function handleDelete() {
    if (!toDelete) return;
    const res = await fetch(`/api/plugins/memberships/companies/${toDelete.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('No se pudo eliminar la empresa');
      return;
    }
    toast.success('Empresa eliminada');
    mutate();
    setToDelete(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Agrupa tus planes por empresa (SaaS o productos clásicos).
        </p>
        <Button size="sm" onClick={handleNew} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Nueva empresa
        </Button>
      </div>

      {companies.length === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-10 border border-dashed border-border rounded-lg">
          Todavía no hay empresas. Crea la primera para empezar a definir sus planes.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <div key={c.id} className="border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center overflow-hidden shrink-0">
                    {c.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logoUrl} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className="h-5 w-5 text-white" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{planCount(c.id)} plan(es)</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={() => handleEdit(c)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setToDelete(c)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {c.description && <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>}
              {(c.website || c.email || c.phone || c.address) && <div className="space-y-1 text-xs text-muted-foreground">{c.website && <a className="block truncate text-primary" href={c.website} target="_blank" rel="noreferrer">{c.website}</a>}{c.email && <p>{c.email}</p>}{c.phone && <p>{c.phone}</p>}{c.address && <p>{c.address}</p>}</div>}
              {c.kpis && <div className="grid grid-cols-3 border-t pt-3 text-center"><div><b>{c.kpis.customers}</b><p className="text-[10px] text-muted-foreground">Clientes</p></div><div><b>{c.kpis.activeMemberships}</b><p className="text-[10px] text-muted-foreground">Activas</p></div><div><b>{c.kpis.stores}</b><p className="text-[10px] text-muted-foreground">Tiendas</p></div></div>}
              {c.status === 'archived' && (
                <Badge variant="outline" className="text-xs">Archivada</Badge>
              )}
              <Button asChild variant="outline" size="sm" className="mt-auto w-full justify-between">
                <Link href={`/plugins/memberships/companies/${c.id}`}>
                  {t('view_company_button')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      )}

      <CompanyFormDialog open={formOpen} onOpenChange={setFormOpen} onSave={handleSave} initialData={editing} />

      {toDelete && (
        <Dialog open onOpenChange={(o) => !o && setToDelete(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>¿Eliminar &quot;{toDelete.name}&quot;?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Se eliminarán también sus planes. Esta acción no se puede deshacer.
            </p>
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

function CompanyFormDialog({
  open,
  onOpenChange,
  onSave,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: CompanyForm) => Promise<boolean>;
  initialData?: CompanyForm;
}) {
  const [form, setForm] = useState<CompanyForm>(EMPTY);
  const [isSaving, setIsSaving] = useState(false);

  function set<K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      alert('El nombre de la empresa es requerido');
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
        if (next) setForm(initialData ?? EMPTY);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData?.id ? 'Editar empresa' : 'Nueva empresa'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej: Acme SaaS" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} className="resize-none text-sm" placeholder="Rubro, producto, etc." />
          </div>
          <div className="space-y-1.5">
            <Label>URL del logo</Label>
            <Input value={form.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://..." />
          </div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Sitio web</Label><Input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://..." /></div><div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div><div className="space-y-1.5"><Label>Dirección</Label><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></div></div>
          <div className="space-y-1.5">
            <Label>Notas internas</Label>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="resize-none text-sm" />
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
