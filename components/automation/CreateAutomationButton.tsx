'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { NewAutomationDialog } from './NewAutomationDialog';
import { useTranslations } from 'next-intl';

export function CreateAutomationButton() {
    const t = useTranslations('Automation');
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button onClick={() => setOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" /> {t('new_automation_btn')}
            </Button>
            <NewAutomationDialog open={open} onOpenChange={setOpen} />
        </>
    );
}