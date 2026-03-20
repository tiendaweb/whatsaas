'use client';

import { useState, useCallback, useMemo, useTransition } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RoleSelector } from './role-selector';
import { UserActions } from './user-actions';
import { Search, ChevronLeft, ChevronRight, X, Plus, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { assignPlanToUserTeam, createUserFromAdmin } from '../../admin-actions';
import { useSWRConfig } from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function UsersClient() {
  const t = useTranslations('AdminUsers');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [teamId, setTeamId] = useState('');
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false);
  const [showAssignPlanDialog, setShowAssignPlanDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: number; name: string | null } | null>(null);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'member',
    planId: '',
  });
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const { mutate } = useSWRConfig();

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      if (debounceTimer) clearTimeout(debounceTimer);
      const timer = setTimeout(() => {
        setDebouncedSearch(value);
        setPage(1);
      }, 400);
      setDebounceTimer(timer);
    },
    [debounceTimer]
  );

  const params = new URLSearchParams();
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (role) params.set('role', role);
  if (teamId) params.set('teamId', teamId);
  params.set('page', String(page));

  const { data, isLoading } = useSWR(
    `/api/admin/users?${params.toString()}`,
    fetcher,
    { keepPreviousData: true }
  );

  const users = data?.users || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const teams = data?.teams || [];
  const plans = data?.plans || [];

  const resetCreateUserState = useCallback(() => {
    setNewUser({ name: '', email: '', password: '', role: 'member', planId: '' });
  }, []);

  const handleCreateUser = () => {
    if (!newUser.planId) {
      toast.error(t('plan_required'));
      return;
    }

    startTransition(async () => {
      const result = await createUserFromAdmin({
        ...newUser,
        planId: Number(newUser.planId),
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(result.success || t('create_user_success'));
      setShowCreateUserDialog(false);
      resetCreateUserState();
      mutate((key: string) => typeof key === 'string' && key.startsWith('/api/admin/users'));
    });
  };

  const openAssignPlanModal = (userId: number, userName: string | null) => {
    setSelectedUser({ id: userId, name: userName });
    setSelectedPlanId('');
    setShowAssignPlanDialog(true);
  };

  const handleAssignPlan = () => {
    if (!selectedUser || !selectedPlanId) {
      toast.error(t('plan_required'));
      return;
    }

    startTransition(async () => {
      const result = await assignPlanToUserTeam(selectedUser.id, Number(selectedPlanId));
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(result.success || t('assign_plan_success'));
      setShowAssignPlanDialog(false);
      setSelectedUser(null);
      mutate((key: string) => typeof key === 'string' && key.startsWith('/api/admin/users'));
    });
  };

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setRole('');
    setTeamId('');
    setPage(1);
  };

  const hasFilters = debouncedSearch || role || teamId;
  const isCreateDisabled = useMemo(
    () => !newUser.name || !newUser.email || newUser.password.length < 8 || !newUser.planId,
    [newUser]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {total} {t('users_count')}
          </Badge>
          <Button onClick={() => setShowCreateUserDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('create_user')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('all_users')}</CardTitle>
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('search_placeholder')}
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={role}
              onValueChange={(v) => {
                setRole(v === 'all' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder={t('filter_role')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_roles')}</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={teamId}
              onValueChange={(v) => {
                setTeamId(v === 'all' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder={t('filter_team')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_teams')}</SelectItem>
                {teams.map((team: { id: number; name: string }) => (
                  <SelectItem key={team.id} value={String(team.id)}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="icon" onClick={clearFilters} title={t('clear_filters')}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('col_name')}</TableHead>
                <TableHead>{t('col_email')}</TableHead>
                <TableHead>{t('col_team')}</TableHead>
                <TableHead>{t('col_role')}</TableHead>
                <TableHead>{t('col_joined')}</TableHead>
                <TableHead className="text-right">{t('col_actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {t('loading')}
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {t('no_users')}
                  </TableCell>
                </TableRow>
              ) : (
                users.map(
                  (user: {
                    id: number;
                    name: string | null;
                    email: string;
                    role: string;
                    createdAt: string;
                    teamName: string | null;
                  }) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.name || 'N/A'}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.teamName ? (
                          <Badge variant="outline">{user.teamName}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <RoleSelector userId={user.id} currentRole={user.role} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="mr-2"
                          onClick={() => openAssignPlanModal(user.id, user.name)}
                        >
                          {t('assign_plan')}
                        </Button>
                        <UserActions userId={user.id} userName={user.name} />
                      </TableCell>
                    </TableRow>
                  )
                )
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <span className="text-sm text-muted-foreground">
                {t('page_info', { page, totalPages, total })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={showCreateUserDialog}
        onOpenChange={(open) => {
          setShowCreateUserDialog(open);
          if (!open) resetCreateUserState();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('create_user_title')}</DialogTitle>
            <DialogDescription>{t('create_user_desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="admin-create-name">{t('col_name')}</Label>
              <Input
                id="admin-create-name"
                value={newUser.name}
                onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-create-email">{t('col_email')}</Label>
              <Input
                id="admin-create-email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-create-password">{t('new_password')}</Label>
              <Input
                id="admin-create-password"
                type="password"
                minLength={8}
                value={newUser.password}
                onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('col_role')}</Label>
              <Select value={newUser.role} onValueChange={(value) => setNewUser((prev) => ({ ...prev, role: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('plan')}</Label>
              <Select value={newUser.planId} onValueChange={(value) => setNewUser((prev) => ({ ...prev, planId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('select_plan')} />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan: { id: number; name: string }) => (
                    <SelectItem key={plan.id} value={String(plan.id)}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateUserDialog(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleCreateUser} disabled={isPending || isCreateDisabled}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('create_user')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAssignPlanDialog}
        onOpenChange={(open) => {
          setShowAssignPlanDialog(open);
          if (!open) {
            setSelectedUser(null);
            setSelectedPlanId('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assign_plan_title')}</DialogTitle>
            <DialogDescription>
              {t('assign_plan_desc', { name: selectedUser?.name || 'N/A' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{t('plan')}</Label>
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
              <SelectTrigger>
                <SelectValue placeholder={t('select_plan')} />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan: { id: number; name: string }) => (
                  <SelectItem key={plan.id} value={String(plan.id)}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignPlanDialog(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleAssignPlan} disabled={isPending || !selectedPlanId}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('save_plan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
