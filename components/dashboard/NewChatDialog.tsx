'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandInput,
  CommandEmpty
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Search, Check, Loader2, Send, Plus, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

type InstanceData = {
    dbId: number;
    instanceName: string;
    integration: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS';
};

type WabaTemplate = {
  id: number;
  name: string;
  language: string;
  status: string;
  components: any[];
  instanceId: number;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface NewChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  instances: InstanceData[];
}

export function NewChatDialog({ isOpen, onClose, instances }: NewChatDialogProps) {
  const t = useTranslations('Chat');
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data: contacts } = useSWR<any[]>('/api/contacts/list', fetcher);
  const { data: templates } = useSWR<WabaTemplate[]>('/api/templates/list', fetcher);

  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [recipient, setRecipient] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [textMessage, setTextMessage] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  
  const [isSending, setIsSending] = useState(false);
  const [isContactPopoverOpen, setIsContactPopoverOpen] = useState(false);
  
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (instances?.length > 0 && !selectedInstanceId) {
      setSelectedInstanceId(instances[0].dbId.toString());
    }
  }, [instances, selectedInstanceId]);

  useEffect(() => {
    if (!isOpen) setFormError(null);
  }, [isOpen]);

  const selectedInstance = instances?.find(i => i.dbId.toString() === selectedInstanceId);
  const isWaba = selectedInstance?.integration === 'WHATSAPP-BUSINESS';
  const availableTemplates = templates?.filter(t => t.status === 'APPROVED' && t.instanceId.toString() === selectedInstanceId) || [];
  
  const selectedTemplate = availableTemplates.find(t => t.id.toString() === selectedTemplateId);
  
  const templateVariablesList = useMemo<string[]>(() => {
    if (!selectedTemplate) return [] as string[];
    const bodyComp = selectedTemplate.components.find((c: any) => c.type === 'BODY');
    if (!bodyComp || !bodyComp.text) return [] as string[];
    const matches = bodyComp.text.match(/\{\{(\d+)\}\}/g);
    if (!matches) return [] as string[];
    return [...new Set(matches.map((m: string) => m.replace(/[{}]/g, '')))] as string[];
  }, [selectedTemplate]);

  const handleSendMessage = async () => {
    setFormError(null);

    if (!selectedInstanceId) {
        toast.error(t('select_instance_toast_error'));
        return;
    }
    if (!recipient) {
        toast.error(t('enter_phone_number_toast_error'));
        return;
    }

    setIsSending(true);
    let remoteJid = recipient.replace(/\D/g, ''); 
    
    if (remoteJid.length < 10) {
        setFormError(t('invalid_phone_number_form_error'));
        setIsSending(false);
        return;
    }
    if (!remoteJid.includes('@')) remoteJid += '@s.whatsapp.net';

    try {
        let response;
        let endpoint = '';
        let payload = {};

        if (isWaba) {
            if (!selectedTemplateId) {
                setFormError(t('select_template_form_error'));
                setIsSending(false);
                return;
            }
            endpoint = '/api/messages/send-template';
            payload = {
                recipientJid: remoteJid,
                templateId: selectedTemplateId,
                instanceId: selectedInstanceId,
                variables: templateVars
            };
        } else {
            if (!textMessage.trim()) {
                setFormError(t('empty_message_form_error'));
                setIsSending(false);
                return;
            }
            endpoint = '/api/messages/send';
            payload = {
                recipientJid: remoteJid,
                text: textMessage,
                instanceId: selectedInstanceId
            };
        }

        response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        let data;
        try {
            data = await response.json();
        } catch (e) {
            throw new Error(t('server_communication_error', { status: response.status }));
        }

        if (!response.ok) {
            const errorMsg = data.error || data.message || t('unknown_error');
            if (data.details) {
                console.error("Detalhes do erro:", data.details);
            }
            throw new Error(errorMsg);
        }

        toast.success(isWaba ? t('template_sent_success_toast') : t('message_sent_success_toast'));
        mutate('/api/chats');
        onClose();
        
        const chatNumber = remoteJid.split('@')[0];
        router.push(`/dashboard/chat/${chatNumber}`);
        
        setTextMessage('');
        setRecipient('');
        setSearchQuery('');
        setSelectedTemplateId('');
        setTemplateVars({});

    } catch (error: any) {
        setFormError(error.message);
        toast.error(t('send_failed_toast'));
    } finally {
        setIsSending(false);
    }
  };

  const isQueryNumber = !isNaN(Number(searchQuery)) && searchQuery.length > 6;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
                <DialogTitle>{t('new_chat_dialog_title')}</DialogTitle>
                <DialogDescription>{t('new_chat_dialog_desc')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
                {formError && (
                    <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>{t('send_error_alert_title')}</AlertTitle>
                        <AlertDescription>{formError}</AlertDescription>
                    </Alert>
                )}

                <div className="space-y-2">
                    <Label>{t('from_instance_label')}</Label>
                    <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
                        <SelectTrigger>
                            <SelectValue placeholder={t('select_instance_placeholder')} />
                        </SelectTrigger>
                        <SelectContent>
                            {instances?.map((instance) => (
                                <SelectItem key={instance.dbId} value={instance.dbId.toString()}>
                                    {instance.instanceName} ({instance.integration === 'WHATSAPP-BUSINESS' ? 'WABA' : 'Web'})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>{t('to_contact_label')}</Label>
                    <Popover open={isContactPopoverOpen} onOpenChange={setIsContactPopoverOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={isContactPopoverOpen}
                                className="w-full justify-between font-normal text-left"
                            >
                                {recipient ? recipient : t('search_or_type_number_placeholder')}
                                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[450px] p-0" align="start">
                            <Command shouldFilter={false}>
                                <CommandInput 
                                    placeholder={t('name_or_number_placeholder')}
                                    value={searchQuery}
                                    onValueChange={setSearchQuery}
                                />
                                <CommandList>
                                    <CommandEmpty>
                                        {isQueryNumber ? (
                                            <div 
                                                className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-gray-100 rounded-sm"
                                                onClick={() => {
                                                    setRecipient(searchQuery);
                                                    setIsContactPopoverOpen(false);
                                                }}
                                            >
                                                <Plus className="h-4 w-4 text-green-600"/>
                                                <span>{t('use_number_text')} <strong>{searchQuery}</strong></span>
                                            </div>
                                        ) : (
                                            <span className="p-2 text-sm text-gray-500">
                                                {t('type_full_number_hint')}
                                            </span>
                                        )}
                                    </CommandEmpty>
                                    
                                    {isQueryNumber && (
                                         <CommandItem
                                            onSelect={() => {
                                                setRecipient(searchQuery);
                                                setIsContactPopoverOpen(false);
                                            }}
                                            className="text-green-700 bg-green-50"
                                        >
                                            <Plus className="mr-2 h-4 w-4" />
                                            {t('use_number_text')} {searchQuery}
                                        </CommandItem>
                                    )}

                                    <CommandGroup heading={t('saved_contacts_heading')}>
                                        {(Array.isArray(contacts) ? contacts : []).filter(c =>
                                            c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                            c.phone?.includes(searchQuery)
                                        ).map((contact) => (
                                            <CommandItem
                                                key={contact.id}
                                                onSelect={() => {
                                                    setRecipient(contact.phone || contact.chat?.remoteJid?.split('@')[0] || "");
                                                    setIsContactPopoverOpen(false);
                                                }}
                                            >
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{contact.name}</span>
                                                    <span className="text-xs text-gray-500">{contact.phone}</span>
                                                </div>
                                                {recipient === contact.phone && <Check className="ml-auto h-4 w-4" />}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {isWaba ? (
                    <div className="space-y-4 border-t pt-4">
                        <div className="space-y-2">
                            <Label>{t('select_template_label')}</Label>
                            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t('choose_template_placeholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableTemplates.map((t) => (
                                        <SelectItem key={t.id} value={t.id.toString()}>
                                            {t.name} ({t.language})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {templateVariablesList.length > 0 && (
                            <div className="space-y-3 bg-muted/50 dark:bg-muted/30 p-3 rounded-md border border-border">
                                <Label className="text-xs text-muted-foreground uppercase font-bold">{t('template_variables_label')}</Label>
                                {templateVariablesList.map((variable) => (
                                    <div key={variable} className="grid gap-1">
                                        <Label className="text-xs">{t('variable_label')} {'{{' + variable + '}}'}</Label>
                                        <Input 
                                            className="bg-background dark:bg-black/20"
                                            placeholder={t('value_for_variable_placeholder', {variable: variable})}
                                            value={templateVars[variable] || ''}
                                            onChange={(e) => setTemplateVars({...templateVars, [variable]: e.target.value})}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2 border-t pt-4">
                        <Label>{t('message_label')}</Label>
                        <Textarea 
                            placeholder={t('type_your_message_placeholder')}
                            value={textMessage}
                            onChange={(e) => setTextMessage(e.target.value)}
                            rows={4}
                        />
                    </div>
                )}
            </div>

            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={isSending}>{t('cancel_btn')}</Button>
                <Button onClick={handleSendMessage} disabled={isSending}>
                    {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {t('send_message_btn')}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}