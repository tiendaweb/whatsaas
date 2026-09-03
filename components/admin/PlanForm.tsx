'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { upsertPlan, ActionState } from '@/app/[locale]/(admin)/admin-actions';
import { Loader2, Save, DollarSign } from 'lucide-react';
import { useTranslations } from 'next-intl';

type PlanData = {
  id?: number;
  name: string;
  description?: string | null;
  amount: number;
  interval: string;
  trialDays: number;
  maxUsers: number;
  maxContacts: number;
  maxInstances: number;
  isAiEnabled: boolean;
  isFlowBuilderEnabled: boolean;
  isCampaignsEnabled: boolean;
  isTemplatesEnabled: boolean;
  isSocialPublisherEnabled: boolean;
  isHidden: boolean;
};

const initialState: ActionState = {};

export function PlanForm({ initialData }: { initialData?: PlanData }) {
  const t = useTranslations('Admin');
  const [state, formAction, isPending] = useActionState(upsertPlan, initialState);

  const [isAiEnabled, setIsAiEnabled] = useState(initialData?.isAiEnabled ?? false);
  const [isFlowBuilderEnabled, setIsFlowBuilderEnabled] = useState(initialData?.isFlowBuilderEnabled ?? false);
  const [isCampaignsEnabled, setIsCampaignsEnabled] = useState(initialData?.isCampaignsEnabled ?? false);
  const [isTemplatesEnabled, setIsTemplatesEnabled] = useState(initialData?.isTemplatesEnabled ?? false);
  const [isSocialPublisherEnabled, setIsSocialPublisherEnabled] = useState(initialData?.isSocialPublisherEnabled ?? false);
  const [isHidden, setIsHidden] = useState(initialData?.isHidden ?? false);

  const defaultPrice = initialData ? (initialData.amount / 100).toFixed(2) : '';

  return (
    <form action={formAction}>
      {initialData?.id && <input type="hidden" name="id" value={initialData.id} />}
      
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('plan_name_label')}</Label>
                <Input id="name" name="name" defaultValue={initialData?.name} required placeholder={t('plan_name_placeholder')} />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">{t('description_label')}</Label>
                <Textarea id="description" name="description" defaultValue={initialData?.description || ''} placeholder={t('internal_details_placeholder')} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">{t('price_usd_label')}</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="amount" 
                      name="amount" 
                      defaultValue={defaultPrice} 
                      placeholder={t('price_placeholder')}
                      className="pl-9" 
                      required 
                      type="number" 
                      step="0.01" 
                      min="0"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interval">{t('billing_period_label')}</Label>
                  <Select name="interval" defaultValue={initialData?.interval || 'month'}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('select_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">{t('monthly_select_item')}</SelectItem>
                      <SelectItem value="year">{t('yearly_select_item')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="trialDays">{t('trial_period_days_label')}</Label>
                  <Input 
                    type="number" 
                    id="trialDays" 
                    name="trialDays" 
                    defaultValue={initialData?.trialDays ?? 0} 
                    required 
                    min={0} 
                    placeholder={t('trial_period_placeholder')}
                  />
                  <p className="text-[0.8rem] text-muted-foreground">
                    {t('trial_period_desc')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground">{t('limits_title')}</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxUsers">{t('max_users_label')}</Label>
                  <Input type="number" id="maxUsers" name="maxUsers" defaultValue={initialData?.maxUsers ?? 1} required min={1} />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="maxInstances">{t('max_instances_label')}</Label>
                  <Input type="number" id="maxInstances" name="maxInstances" defaultValue={initialData?.maxInstances ?? 1} required min={0} />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="maxContacts">{t('max_contacts_label')}</Label>
                  <Input type="number" id="maxContacts" name="maxContacts" defaultValue={initialData?.maxContacts ?? 1000} required min={0} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-6">
              <h3 className="font-semibold text-sm text-muted-foreground">{t('features_enabled_title')}</h3>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isAiEnabled">{t('ai_agent_label')}</Label>
                  <p className="text-xs text-muted-foreground">{t('ai_agent_desc')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="hidden" name="isAiEnabled" value={isAiEnabled ? 'on' : 'off'} />
                  <Switch id="isAiEnabled" checked={isAiEnabled} onCheckedChange={setIsAiEnabled} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isFlowBuilderEnabled">{t('flow_builder_label')}</Label>
                  <p className="text-xs text-muted-foreground">{t('flow_builder_desc')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="hidden" name="isFlowBuilderEnabled" value={isFlowBuilderEnabled ? 'on' : 'off'} />
                  <Switch id="isFlowBuilderEnabled" checked={isFlowBuilderEnabled} onCheckedChange={setIsFlowBuilderEnabled} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isCampaignsEnabled">{t('campaigns_label')}</Label>
                  <p className="text-xs text-muted-foreground">{t('campaigns_desc')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="hidden" name="isCampaignsEnabled" value={isCampaignsEnabled ? 'on' : 'off'} />
                  <Switch id="isCampaignsEnabled" checked={isCampaignsEnabled} onCheckedChange={setIsCampaignsEnabled} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isTemplatesEnabled">{t('templates_label')}</Label>
                  <p className="text-xs text-muted-foreground">{t('templates_desc')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="hidden" name="isTemplatesEnabled" value={isTemplatesEnabled ? 'on' : 'off'} />
                  <Switch id="isTemplatesEnabled" checked={isTemplatesEnabled} onCheckedChange={setIsTemplatesEnabled} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isSocialPublisherEnabled">Publicaciones Sociales</Label>
                  <p className="text-xs text-muted-foreground">Publicar y programar contenido en Facebook e Instagram</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="hidden" name="isSocialPublisherEnabled" value={isSocialPublisherEnabled ? 'on' : 'off'} />
                  <Switch id="isSocialPublisherEnabled" checked={isSocialPublisherEnabled} onCheckedChange={setIsSocialPublisherEnabled} />
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isHidden">Ocultar plan</Label>
                    <p className="text-xs text-muted-foreground">No aparecerá en la landing ni para contratarse</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="hidden" name="isHidden" value={isHidden ? 'on' : 'off'} />
                    <Switch id="isHidden" checked={isHidden} onCheckedChange={setIsHidden} />
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="border-t bg-muted/50 px-6 py-4">
              <Button type="submit" disabled={isPending} className="ml-auto">
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {t('save_plan_btn')}
              </Button>
            </CardFooter>
          </Card>
          
          {state.error && <p className="text-destructive text-sm text-right">{state.error}</p>}
        </div>
      </div>
    </form>
  );
}