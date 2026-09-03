'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Copy, Plus, Key, Terminal, Loader2, Check, Eye, EyeOff, Smartphone, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { getApiKeys, createApiKey, deleteApiKey } from './actions';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';

type InstanceItem = {
    dbId: number;
    instanceName: string;
    profileName: string | null;
    status: string;
};

const fetcher = (url: string) => fetch(url).then(r => r.json());

type ApiKeyData = {
    id: number;
    name: string;
    key: string;
    createdAt: Date;
    lastUsedAt: Date | null;
};

type CurrentUser = { email: string };

export default function DevelopersPage() {
    const t = useTranslations('Settings');
    const [keys, setKeys] = useState<ApiKeyData[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
    const [visibleKeys, setVisibleKeys] = useState<Record<number, boolean>>({});
    const [selectedInstanceName, setSelectedInstanceName] = useState<string>('');

    const { data: instanceList } = useSWR<InstanceItem[]>('/api/instance/details', fetcher);
    const { data: currentUser } = useSWR<CurrentUser>('/api/user', fetcher);

    useEffect(() => {
        if (instanceList && instanceList.length > 0 && !selectedInstanceName) {
            setSelectedInstanceName(instanceList[0].instanceName);
        }
    }, [instanceList, selectedInstanceName]);

    const displayInstanceName = selectedInstanceName || 'my-instance-name';

    useEffect(() => {
        loadKeys();
    }, []);

    const loadKeys = async () => {
        setLoading(true);
        try {
            const data = await getApiKeys();
            setKeys(data);
        } catch (error) {
            toast.error(t('failed_to_load_api_keys_toast'));
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newKeyName.trim()) return;
        setIsCreating(true);
        try {
            const result = await createApiKey(newKeyName);
            if (result.success && result.key) {
                setNewlyCreatedKey(result.key);
                setNewKeyName('');
                loadKeys();
            }
        } catch (error) {
            toast.error(t('failed_to_create_api_key_toast'));
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm(t('confirm_revoke_key'))) return;
        try {
            await deleteApiKey(id);
            toast.success(t('api_key_revoked_toast'));
            loadKeys();
        } catch (error) {
            toast.error(t('failed_to_revoke_key_toast'));
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success(t('copied_to_clipboard_toast'));
    };

    const toggleVisibility = (id: number) => {
        setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const maskKey = (key: string) => {
        return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
    };

    return (
        <section className="flex-1 p-4 lg:p-8 max-w-6xl mx-auto">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{t('developer_api_title')}</h1>
                    <p className="text-muted-foreground">{t('developer_api_desc')}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {currentUser?.email?.toLowerCase() === 'noelia@whatspro.uno' && (
                        <Button asChild variant="outline">
                            <a href="/settings/developers/read-only">
                                <BookOpen className="mr-2 h-4 w-4" /> {t('open_readonly_docs')}
                            </a>
                        </Button>
                    )}
                    <Button onClick={() => setIsCreateOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" /> {t('create_new_key_btn')}
                    </Button>
                </div>
            </div>

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> {t('api_keys_card_title')}</CardTitle>
                        <CardDescription>{t('api_keys_card_desc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                        ) : keys.length === 0 ? (
                            <div className="text-center p-6 text-muted-foreground">{t('no_api_keys_generated_yet')}</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t('name_table_header')}</TableHead>
                                        <TableHead>{t('token_table_header')}</TableHead>
                                        <TableHead>{t('created_table_header')}</TableHead>
                                        <TableHead>{t('last_used_table_header')}</TableHead>
                                        <TableHead className="text-right">{t('actions_table_header')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {keys.map(key => (
                                        <TableRow key={key.id}>
                                            <TableCell className="font-medium">{key.name}</TableCell>
                                            <TableCell className="font-mono text-xs">
                                                <div className="flex items-center gap-2">
                                                    <span>{visibleKeys[key.id] ? key.key : maskKey(key.key)}</span>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleVisibility(key.id)}>
                                                        {visibleKeys[key.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(key.key)}>
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell>{new Date(key.createdAt).toLocaleDateString()}</TableCell>
                                            <TableCell>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : t('never_text')}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(key.id)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Terminal className="h-5 w-5" /> {t('documentation_card_title')}</CardTitle>
                        <CardDescription>{t('documentation_card_desc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {instanceList && instanceList.length > 0 && (
                            <div className="flex items-center gap-3 mb-4 p-3 bg-muted rounded-lg">
                                <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                                <Label className="text-sm shrink-0">instanceName:</Label>
                                <Select value={selectedInstanceName} onValueChange={setSelectedInstanceName}>
                                    <SelectTrigger className="h-8 font-mono text-sm">
                                        <SelectValue placeholder="Seleccionar instancia" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {instanceList.map(inst => (
                                            <SelectItem key={inst.dbId} value={inst.instanceName}>
                                                <span className="font-mono">{inst.instanceName}</span>
                                                {inst.profileName && <span className="text-muted-foreground ml-2 text-xs">({inst.profileName})</span>}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { navigator.clipboard.writeText(selectedInstanceName); toast.success(t('copied_to_clipboard_toast')); }}>
                                    <Copy className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}
                        <Tabs defaultValue="text">
                            <TabsList className="mb-4">
                                <TabsTrigger value="text">{t('send_text_tab')}</TabsTrigger>
                                <TabsTrigger value="media">{t('send_media_tab')}</TabsTrigger>
                                <TabsTrigger value="audio">{t('send_audio_tab')}</TabsTrigger>
                            </TabsList>

                            <TabsContent value="text" className="space-y-4">
                                <div className="space-y-2">
                                    <Label>{t('endpoint_label')}</Label>
                                    <div className="bg-muted p-2 rounded-md font-mono text-sm">POST /api/v1/send</div>
                                </div>
                                <div className="space-y-2">
                                    <Label>{t('example_request_curl_label')}</Label>
                                    <pre className="bg-zinc-950 text-zinc-50 p-4 rounded-md overflow-x-auto text-xs font-mono">
                                        {`curl -X POST "${typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/api/v1/send" \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "instanceName": "${displayInstanceName}",
    "number": "5511999999999",
    "type": "text",
    "message": "Hello from API!"
  }'`}
                                    </pre>
                                </div>
                            </TabsContent>

                            <TabsContent value="media" className="space-y-4">
                                <div className="space-y-2">
                                    <Label>{t('endpoint_label')}</Label>
                                    <div className="bg-muted p-2 rounded-md font-mono text-sm">POST /api/v1/send</div>
                                </div>
                                <div className="space-y-2">
                                    <Label>{t('example_request_label')}</Label>
                                    <pre className="bg-zinc-950 text-zinc-50 p-4 rounded-md overflow-x-auto text-xs font-mono">
                                        {`curl -X POST "${typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/api/v1/send" \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "instanceName": "${displayInstanceName}",
    "number": "5511999999999",
    "type": "image",  // other types: video, document
    "mediaUrl": "https://example.com/image.png",
    "message": "Caption for image (optional)"
  }'`}
                                    </pre>
                                </div>
                            </TabsContent>

                            <TabsContent value="audio" className="space-y-4">
                                <div className="space-y-2">
                                    <Label>{t('endpoint_label')}</Label>
                                    <div className="bg-muted p-2 rounded-md font-mono text-sm">POST /api/v1/send</div>
                                </div>
                                <div className="space-y-2">
                                    <Label>{t('example_request_label')}</Label>
                                    <pre className="bg-zinc-950 text-zinc-50 p-4 rounded-md overflow-x-auto text-xs font-mono">
                                        {`curl -X POST "${typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/api/v1/send" \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "instanceName": "${displayInstanceName}",
    "number": "5511999999999",
    "type": "audio",
    "mediaUrl": "https://example.com/audio.mp3"
  }'`}
                                    </pre>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    {!newlyCreatedKey ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>{t('create_api_key_dialog_title')}</DialogTitle>
                                <DialogDescription>{t('create_api_key_dialog_desc')}</DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <Label>{t('key_name_label')}</Label>
                                <Input
                                    placeholder={t('zapier_integration_placeholder')}
                                    value={newKeyName}
                                    onChange={(e) => setNewKeyName(e.target.value)}
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t('cancel_btn')}</Button>
                                <Button onClick={handleCreate} disabled={isCreating || !newKeyName}>
                                    {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t('create_btn')}
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-green-600">{t('key_created_successfully_dialog_title')}</DialogTitle>
                                <DialogDescription>
                                    {t('key_created_successfully_dialog_desc')}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-6">
                                <div className="flex items-center gap-2 p-3 bg-muted rounded border border-primary/20">
                                    <code className="flex-1 font-mono text-sm break-all text-primary">{newlyCreatedKey}</code>
                                    <Button size="icon" variant="ghost" onClick={() => copyToClipboard(newlyCreatedKey)}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={() => { setIsCreateOpen(false); setNewlyCreatedKey(null); }}>{t('done_btn')}</Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </section>
    );
}
