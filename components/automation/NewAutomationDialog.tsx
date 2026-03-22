'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation'; 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from 'lucide-react';
import useSWR from 'swr';
import { createAutomation } from '@/app/[locale]/(dashboard)/automation/actions';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface NewAutomationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function NewAutomationDialog({ open, onOpenChange }: NewAutomationDialogProps) {
    const router = useRouter(); 
    const t = useTranslations('Automation');
    const { data: instances, isLoading } = useSWR<any[]>('/api/instance/details', fetcher);
    
    const [name, setName] = useState('');
    const [instanceId, setInstanceId] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const handleCreate = async () => {
        if (!name || !instanceId) {
            toast.error(t('fill_all_fields_toast_error'));
            return;
        }

        setIsCreating(true);
        try {
            const result = await createAutomation(name, parseInt(instanceId));
            if (result && result.id) {
                toast.success(t('automation_created_toast'));
                onOpenChange(false);
                router.push(`/automation/${result.id}`);
            }
        } catch (error) {
            toast.error(t('error_creating_automation_toast'));
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('new_automation_dialog_title')}</DialogTitle>
                    <DialogDescription>{t('new_automation_dialog_desc')}</DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>{t('flow_name_label')}</Label>
                        <Input 
                            placeholder={t('flow_name_placeholder')}
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>{t('connected_instance_label')}</Label>
                        <Select value={instanceId} onValueChange={setInstanceId} disabled={isLoading}>
                            <SelectTrigger>
                                <SelectValue placeholder={isLoading ? t('loading_instances_placeholder') : t('select_instance_placeholder')} />
                            </SelectTrigger>
                            <SelectContent>
                                {instances?.map((inst) => (
                                    <SelectItem key={inst.dbId} value={inst.dbId.toString()}>
                                        {inst.instanceName} ({inst.integration === 'WHATSAPP-BUSINESS' ? t('waba_integration_text') : t('web_integration_text')})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancel_btn')}</Button>
                    <Button onClick={handleCreate} disabled={isCreating || !name || !instanceId}>
                        {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : t('create_automation_btn')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}