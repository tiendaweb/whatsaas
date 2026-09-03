'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Percent, UserCog, Users } from 'lucide-react';

type MemberRow = {
  teamMemberId: number;
  userId: number;
  role: string;
  name: string | null;
  email: string;
  profileId: number | null;
  jobTitle: string | null;
  employmentStatus: 'active' | 'on_leave' | 'terminated' | null;
  hireDate: string | null;
  notes: string | null;
};

type CommissionRule = {
  id: number;
  name: string;
  rateBps: number;
  appliesTo: 'all_sales' | 'article' | 'user';
  isActive: boolean;
};

type Commission = {
  id: number;
  saleId: number;
  userId: number;
  userName: string | null;
  userEmail: string;
  basisAmount: number;
  commissionAmount: number;
  currency: string;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  createdAt: string;
};

type OverviewData = {
  teamMembers: number;
  activeEmployeeProfiles: number;
  pendingCommissions: { count: number; total: number };
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const EMPLOYMENT_LABEL: Record<string, string> = { active: 'Activo', on_leave: 'Licencia', terminated: 'Baja' };
const COMMISSION_STATUS_LABEL: Record<string, string> = { pending: 'Pendiente', approved: 'Aprobada', paid: 'Pagada', cancelled: 'Cancelada' };

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount / 100);
}

export function HrDashboard() {
  const { data: overview } = useSWR<OverviewData>('/api/plugins/hr/overview', fetcher);
  const { data: membersData, mutate: mutateMembers } = useSWR<MemberRow[]>('/api/plugins/hr/profiles', fetcher);
  const { data: rulesData, mutate: mutateRules } = useSWR<CommissionRule[]>('/api/plugins/hr/commission-rules', fetcher);
  const { data: commissionsData, mutate: mutateCommissions } = useSWR<Commission[]>('/api/plugins/hr/commissions', fetcher);

  const members = Array.isArray(membersData) ? membersData : [];
  const rules = Array.isArray(rulesData) ? rulesData : [];
  const commissions = Array.isArray(commissionsData) ? commissionsData : [];

  const [editingProfile, setEditingProfile] = useState<number | null>(null);
  const [profileForm, setProfileForm] = useState({ jobTitle: '', employmentStatus: 'active' as MemberRow['employmentStatus'] });
  const [savingProfile, setSavingProfile] = useState(false);

  const [ruleForm, setRuleForm] = useState({ name: '', ratePercent: '', appliesTo: 'all_sales' as CommissionRule['appliesTo'] });
  const [savingRule, setSavingRule] = useState(false);

  const [commissionForm, setCommissionForm] = useState({ saleId: '', userId: '', basisAmount: '', ratePercent: '' });
  const [savingCommission, setSavingCommission] = useState(false);

  const computedCommissionAmount = useMemo(() => {
    const basis = Number(commissionForm.basisAmount) * 100;
    const rate = Number(commissionForm.ratePercent);
    if (!basis || !rate) return 0;
    return Math.round((basis * rate) / 100);
  }, [commissionForm.basisAmount, commissionForm.ratePercent]);

  const startEditProfile = (member: MemberRow) => {
    setEditingProfile(member.userId);
    setProfileForm({ jobTitle: member.jobTitle ?? '', employmentStatus: member.employmentStatus ?? 'active' });
  };

  const saveProfile = async (userId: number) => {
    setSavingProfile(true);
    try {
      const response = await fetch('/api/plugins/hr/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, jobTitle: profileForm.jobTitle || null, employmentStatus: profileForm.employmentStatus }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.formErrors?.[0] || json.error || 'No se pudo guardar el perfil.');
      toast.success('Perfil actualizado.');
      setEditingProfile(null);
      mutateMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al guardar el perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const createRule = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingRule(true);
    try {
      const rateBps = Math.round(Number(ruleForm.ratePercent) * 100);
      const response = await fetch('/api/plugins/hr/commission-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ruleForm.name, rateBps, appliesTo: ruleForm.appliesTo }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.formErrors?.[0] || json.error || 'No se pudo crear la regla.');
      toast.success('Regla de comisión creada.');
      setRuleForm({ name: '', ratePercent: '', appliesTo: 'all_sales' });
      mutateRules();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear la regla.');
    } finally {
      setSavingRule(false);
    }
  };

  const createCommission = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!computedCommissionAmount) {
      toast.error('Completá monto base y porcentaje.');
      return;
    }
    setSavingCommission(true);
    try {
      const response = await fetch('/api/plugins/hr/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: Number(commissionForm.saleId),
          userId: Number(commissionForm.userId),
          basisAmount: Math.round(Number(commissionForm.basisAmount) * 100),
          commissionAmount: computedCommissionAmount,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.formErrors?.[0] || json.error || 'No se pudo crear la comisión.');
      toast.success('Comisión registrada.');
      setCommissionForm({ saleId: '', userId: '', basisAmount: '', ratePercent: '' });
      mutateCommissions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear la comisión.');
    } finally {
      setSavingCommission(false);
    }
  };

  const advanceCommission = async (commission: Commission) => {
    const next = commission.status === 'pending' ? 'approved' : commission.status === 'approved' ? 'paid' : null;
    if (!next) return;
    try {
      const response = await fetch(`/api/plugins/hr/commissions/${commission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'No se pudo actualizar la comisión.');
      toast.success(next === 'paid' ? 'Comisión marcada como pagada.' : 'Comisión aprobada.');
      mutateCommissions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar.');
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto">
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-sky-600 to-blue-700 flex items-center justify-center">
          <UserCog className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">RRHH</h1>
          <p className="text-sm text-muted-foreground">Directorio del equipo y comisiones sobre ventas.</p>
        </div>
      </div>

      {overview ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Miembros del equipo</p>
            <p className="text-xl font-semibold">{overview.teamMembers}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Perfiles activos</p>
            <p className="text-xl font-semibold">{overview.activeEmployeeProfiles}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Comisiones pendientes</p>
            <p className="text-xl font-semibold">{overview.pendingCommissions.count}</p>
            <p className="text-xs text-muted-foreground">{formatMoney(overview.pendingCommissions.total, 'ARS')}</p>
          </CardContent></Card>
        </div>
      ) : null}

      <Tabs defaultValue="directory">
        <TabsList>
          <TabsTrigger value="directory">Directorio</TabsTrigger>
          <TabsTrigger value="commissions">Comisiones</TabsTrigger>
          <TabsTrigger value="rules">Reglas</TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="space-y-2 mt-4">
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
              Todavía no hay miembros en el equipo.
            </p>
          ) : (
            members.map((member) => (
              <div key={member.userId} className="border rounded-lg p-4 bg-card">
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium flex items-center gap-2">
                      {member.name || member.email}
                      <Badge variant="secondary">{EMPLOYMENT_LABEL[member.employmentStatus ?? 'active']}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.jobTitle || 'Sin cargo asignado'} · {member.email}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => startEditProfile(member)}>
                    Editar
                  </Button>
                </div>
                {editingProfile === member.userId ? (
                  <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Cargo</Label>
                      <Input
                        value={profileForm.jobTitle}
                        onChange={(event) => setProfileForm({ ...profileForm, jobTitle: event.target.value })}
                        className="w-48"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Estado</Label>
                      <Select
                        value={profileForm.employmentStatus ?? 'active'}
                        onValueChange={(value) => setProfileForm({ ...profileForm, employmentStatus: value as MemberRow['employmentStatus'] })}
                      >
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Activo</SelectItem>
                          <SelectItem value="on_leave">Licencia</SelectItem>
                          <SelectItem value="terminated">Baja</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" onClick={() => saveProfile(member.userId)} disabled={savingProfile}>
                      {savingProfile ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Guardar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingProfile(null)}>Cancelar</Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="commissions" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Percent className="h-4 w-4" /> Registrar comisión</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createCommission} className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-2">
                    <Label>Vendedor</Label>
                    <Select value={commissionForm.userId} onValueChange={(value) => setCommissionForm({ ...commissionForm, userId: value })}>
                      <SelectTrigger><SelectValue placeholder="Elegí" /></SelectTrigger>
                      <SelectContent>
                        {members.map((member) => (
                          <SelectItem key={member.userId} value={String(member.userId)}>{member.name || member.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>ID de venta</Label>
                    <Input type="number" min={1} value={commissionForm.saleId} onChange={(event) => setCommissionForm({ ...commissionForm, saleId: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Monto base</Label>
                    <Input type="number" min={0} step="0.01" value={commissionForm.basisAmount} onChange={(event) => setCommissionForm({ ...commissionForm, basisAmount: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>% comisión</Label>
                    <Input type="number" min={0} max={100} step="0.1" value={commissionForm.ratePercent} onChange={(event) => setCommissionForm({ ...commissionForm, ratePercent: event.target.value })} />
                  </div>
                </div>
                {computedCommissionAmount > 0 ? (
                  <p className="text-xs text-muted-foreground">Comisión calculada: {formatMoney(computedCommissionAmount, 'ARS')}</p>
                ) : null}
                <Button type="submit" disabled={savingCommission || !commissionForm.saleId || !commissionForm.userId}>
                  {savingCommission ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Registrar
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {commissions.length === 0 ? (
              <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
                Todavía no hay comisiones registradas.
              </p>
            ) : (
              commissions.map((commission) => (
                <div key={commission.id} className="border rounded-lg p-4 bg-card flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium flex items-center gap-2">
                      Venta #{commission.saleId} — {commission.userName || commission.userEmail}
                      <Badge variant="secondary">{COMMISSION_STATUS_LABEL[commission.status]}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">{formatMoney(commission.commissionAmount, commission.currency)}</p>
                  </div>
                  {commission.status !== 'paid' && commission.status !== 'cancelled' ? (
                    <Button size="sm" variant="outline" onClick={() => advanceCommission(commission)}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {commission.status === 'pending' ? 'Aprobar' : 'Marcar pagada'}
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Nueva regla</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createRule} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input value={ruleForm.name} onChange={(event) => setRuleForm({ ...ruleForm, name: event.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>% comisión</Label>
                    <Input type="number" min={0} max={100} step="0.1" value={ruleForm.ratePercent} onChange={(event) => setRuleForm({ ...ruleForm, ratePercent: event.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Aplica a</Label>
                    <Select value={ruleForm.appliesTo} onValueChange={(value) => setRuleForm({ ...ruleForm, appliesTo: value as CommissionRule['appliesTo'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_sales">Todas las ventas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" disabled={savingRule || !ruleForm.name.trim() || !ruleForm.ratePercent}>
                  {savingRule ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Crear regla
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
                Todavía no hay reglas de comisión.
              </p>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} className="border rounded-lg p-4 bg-card">
                  <p className="text-sm font-medium">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">{(rule.rateBps / 100).toFixed(1)}% · {rule.appliesTo === 'all_sales' ? 'Todas las ventas' : rule.appliesTo}</p>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </div>
  );
}
