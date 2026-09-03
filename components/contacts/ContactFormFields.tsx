import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Props {
  customData: Record<string, any>;
  setCustomData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}

export function CustomFieldsInputs({ customData, setCustomData }: Props) {
  const t = useTranslations('ContactsPage');
  const { data: customFields } = useSWR<any[]>('/api/custom-fields', fetcher);

  if (!customFields || customFields.length === 0) return null;

  return (
    <div className="grid gap-3 mt-4">
      <Label className="text-xs font-semibold text-muted-foreground uppercase">{t('custom_fields.extra_info')}</Label>
      {customFields.map(cf => (
        <div key={cf.id} className="grid gap-1.5">
          <Label className="text-sm font-normal">{cf.name}</Label>
          {cf.type === 'boolean' ? (
             <div className="flex items-center space-x-2">
                <Switch 
                    checked={!!customData[cf.key]} 
                    onCheckedChange={(checked) => setCustomData(prev => ({ ...prev, [cf.key]: checked }))} 
                />
                <span className="text-sm text-muted-foreground">{customData[cf.key] ? t('yes') : t('no')}</span>
             </div>
          ) : (
             <Input 
                value={customData[cf.key] || ''} 
                onChange={e => setCustomData(prev => ({ ...prev, [cf.key]: e.target.value }))}
                className="h-8"
             />
          )}
        </div>
      ))}
    </div>
  );
}
