'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import useSWR, { mutate } from 'swr';
import * as XLSX from 'xlsx';
import {
    Search, User as UserIcon, Users, Filter, MoreVertical,
    Edit, Trash2, Phone, Save, X, Loader2, Plus, Settings2, FileSpreadsheet, Upload, Download, ArrowRightLeft, GripVertical, Pencil, Check
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
    DropdownMenuCheckboxItem
} from '@/components/ui/dropdown-menu';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import '@/components/maqueta/maqueta.css';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type CustomField = {
    id: number;
    name: string;
    key: string;
    type: 'text' | 'boolean';
    position: number;
};

type Contact = {
    id: number;
    name: string;
    phone?: string;
    profilePicUrl?: string;
    notes?: string;
    assignedUser?: { id: number; name: string; email: string };
    assignedDepartment?: { id: number; name: string };
    funnelStage?: { id: number; name: string; emoji?: string };
    tags: { id: number; name: string; color: string }[];
    customData?: Record<string, any>;
    instanceId?: number | null;
    instanceName?: string | null;
};

type InstanceOption = {
    id: number;
    instanceName: string;
};

type ColumnDef = {
    id: string;
    label: string;
    visible: boolean;
    width: number; 
    isCustom?: boolean;
    fieldKey?: string;
    type?: 'text' | 'boolean' | 'system';
};

export default function ContactsPage() {
    const t = useTranslations('ContactsPage');
    const { data: _contacts, isLoading: loadingContacts } = useSWR<Contact[]>('/api/contacts/list', fetcher);
    const { data: teamData } = useSWR('/api/team', fetcher);
    const { data: _funnelStages } = useSWR<any[]>('/api/funnel-stages', fetcher);
    const { data: _allTags } = useSWR<any[]>('/api/tags', fetcher);
    const { data: _customFields, isLoading: loadingFields } = useSWR<CustomField[]>('/api/custom-fields', fetcher);
    const { data: _instances } = useSWR<InstanceOption[]>('/api/instance/list', fetcher);
    const { data: _departments } = useSWR<any[]>('/api/departments', fetcher);
    const contacts = useMemo(() => Array.isArray(_contacts) ? _contacts : [], [_contacts]);
    const funnelStages = useMemo(() => Array.isArray(_funnelStages) ? _funnelStages : [], [_funnelStages]);
    const allTags = useMemo(() => Array.isArray(_allTags) ? _allTags : [], [_allTags]);
    const customFields = useMemo(() => Array.isArray(_customFields) ? _customFields : [], [_customFields]);
    const instances = useMemo(() => Array.isArray(_instances) ? _instances : [], [_instances]);
    const departmentsList = useMemo(() => Array.isArray(_departments) ? _departments : [], [_departments]);

    const agents = teamData?.teamMembers?.map((tm: any) => tm.user) || [];

    const [searchQuery, setSearchQuery] = useState('');
    const [filterAgent, setFilterAgent] = useState<string>('all');
    const [filterStage, setFilterStage] = useState<string>('all');
    const [filterTag, setFilterTag] = useState<string>('all');
    const [filterInstance, setFilterInstance] = useState<string>('all');
    const [filterDepartment, setFilterDepartment] = useState<string>('all');
    
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
    const [isBulkMoveOpen, setIsBulkMoveOpen] = useState(false);
    const [bulkMoveTargetInstance, setBulkMoveTargetInstance] = useState<string>('');
    const [isFieldsManagerOpen, setIsFieldsManagerOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [editName, setEditName] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [editAgentId, setEditAgentId] = useState<string>('null');
    const [editDepartmentId, setEditDepartmentId] = useState<string>('null');
    const [editStageId, setEditStageId] = useState<string>('null');
    const [editTagIds, setEditTagIds] = useState<Set<number>>(new Set());
    const [editCustomData, setEditCustomData] = useState<Record<string, any>>({});

    const [newFieldName, setNewFieldName] = useState('');
    const [newFieldType, setNewFieldType] = useState<'text' | 'boolean'>('text');
    const [orderedFields, setOrderedFields] = useState<CustomField[]>([]);
    const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
    const [editingFieldName, setEditingFieldName] = useState('');
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importInstanceId, setImportInstanceId] = useState<string>('');

    const [columns, setColumns] = useState<ColumnDef[]>([
        { id: 'contact', label: 'Contact', visible: true, width: 300, type: 'system' },
        { id: 'instance', label: 'Instance', visible: true, width: 150, type: 'system' },
        { id: 'stage', label: 'Stage', visible: true, width: 150, type: 'system' },
        { id: 'agent', label: 'Agent', visible: true, width: 150, type: 'system' },
        { id: 'department', label: 'Department', visible: true, width: 150, type: 'system' },
        { id: 'tags', label: 'Tags', visible: true, width: 200, type: 'system' },
    ]);

    useEffect(() => {
        setOrderedFields([...customFields].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    }, [customFields]);

    useEffect(() => {
        if (customFields) {
            setColumns(prev => {
                const systemCols = prev.filter(c => !c.isCustom);
                const customCols = customFields.map(cf => {
                    const existing = prev.find(c => c.fieldKey === cf.key);
                    return {
                        id: `cf_${cf.id}`,
                        label: cf.name,
                        visible: existing ? existing.visible : true,
                        width: existing ? existing.width : 150,
                        isCustom: true,
                        fieldKey: cf.key,
                        type: cf.type
                    };
                });
                return [...systemCols, ...customCols];
            });
        }
    }, [customFields]);

    const filteredContacts = useMemo(() => {
        if (!Array.isArray(contacts)) return [];
        let result = contacts;

        if (filterAgent !== 'all') {
            if (filterAgent === 'unassigned') {
                result = result.filter(c => !c.assignedUser);
            } else {
                result = result.filter(c => c.assignedUser?.id.toString() === filterAgent);
            }
        }

        if (filterStage !== 'all') {
            if (filterStage === 'no_stage') {
                result = result.filter(c => !c.funnelStage);
            } else {
                result = result.filter(c => c.funnelStage?.id.toString() === filterStage);
            }
        }

        if (filterTag !== 'all') {
            result = result.filter(c => c.tags.some(tag => tag.id.toString() === filterTag));
        }

        if (filterInstance !== 'all') {
            if (filterInstance === 'no_instance') {
                result = result.filter(c => !c.instanceId);
            } else {
                result = result.filter(c => c.instanceId?.toString() === filterInstance);
            }
        }

        if (filterDepartment !== 'all') {
            if (filterDepartment === 'no_department') {
                result = result.filter(c => !c.assignedDepartment);
            } else {
                result = result.filter(c => c.assignedDepartment?.id.toString() === filterDepartment);
            }
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(c => {
                const basicMatch = c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q));
                if (basicMatch) return true;
                if (c.customData) {
                    return Object.values(c.customData).some(val => 
                        String(val).toLowerCase().includes(q)
                    );
                }
                return false;
            });
        }

        return result;
    }, [contacts, searchQuery, filterAgent, filterStage, filterTag, filterInstance, filterDepartment]);

    const handleSelectAll = () => {
        if (selectedIds.size === filteredContacts.length && filteredContacts.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredContacts.map(c => c.id)));
        }
    };

    const toggleSelection = (id: number) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleExport = () => {
        const contactsToExport = selectedIds.size > 0 
            ? filteredContacts.filter(c => selectedIds.has(c.id)) 
            : filteredContacts;

        if (contactsToExport.length === 0) {
            toast.error(t('no_contacts_to_export'));
            return;
        }

        const data = contactsToExport.map(c => {
            const row: any = {
                'Name': c.name,
                'Phone': c.phone || '',
                'Stage': c.funnelStage?.name || '',
                'Agent': c.assignedUser?.name || '',
                'Department': c.assignedDepartment?.name || '',
                'Tags': c.tags.map(t => t.name).join(', '),
                'Notes': c.notes || ''
            };

            if (customFields) {
                customFields.forEach(cf => {
                    let val = c.customData?.[cf.key];
                    if (cf.type === 'boolean') val = val ? t('yes') : t('no');
                    row[cf.name] = val || '';
                });
            }
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Contacts");
        XLSX.writeFile(wb, `contacts_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleDownloadTemplate = () => {
        const headers: any = {
            'Name': 'John Doe',
            'Phone': '5511999998888',
            'Stage': 'Lead',
            'Agent Email': 'agent@example.com',
            'Department': 'Sales',
            'Notes': 'Example note',
            'Tags': 'VIP, Lead'
        };

        if (customFields) {
            customFields.forEach(cf => {
                headers[cf.name] = cf.type === 'boolean' ? t('yes') : t('example_value');
            });
        }

        const ws = XLSX.utils.json_to_sheet([headers]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "import_template.xlsx");
    };

    const handleImportSubmit = async () => {
        if (!importFile || !teamData?.id) return;
        setIsSaving(true);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet);

                if (jsonData.length === 0) {
                    toast.error(t('import_dialog.empty_file'));
                    setIsSaving(false);
                    return;
                }

                const processedContacts = jsonData.map((row: any) => {
                    const contact: any = {
                        name: row['Name'],
                        phone: row['Phone'] ? String(row['Phone']) : undefined,
                        stage: row['Stage'],
                        agentEmail: row['Agent Email'],
                        department: row['Department'],
                        notes: row['Notes'],
                        tags: row['Tags'] ? String(row['Tags']).split(',').map(s => s.trim()) : [],
                        customData: {}
                    };

                    if (customFields) {
                        customFields.forEach(cf => {
                            if (row[cf.name] !== undefined) {
                                contact.customData[cf.key] = row[cf.name];
                            }
                        });
                    }
                    return contact;
                });

                const res = await fetch('/api/contacts/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        teamId: teamData.id,
                        contacts: processedContacts,
                        instanceId: importInstanceId ? parseInt(importInstanceId) : undefined
                    })
                });

                const result = await res.json();

                if (!res.ok) throw new Error(result.error || 'Failed');

                toast.success(t('import_dialog.success', { 
                    imported: result.imported, 
                    failed: result.failed 
                }));
                
                mutate('/api/contacts/list');
                setIsImportOpen(false);
                setImportFile(null);
                setImportInstanceId('');
            } catch (error) {
                console.error(error);
                toast.error(t('import_dialog.error'));
            } finally {
                setIsSaving(false);
            }
        };
        reader.readAsBinaryString(importFile);
    };

    const handleEditClick = (contact: Contact) => {
        setSelectedContact(contact);
        setEditName(contact.name);
        setEditNotes(contact.notes || '');
        setEditAgentId(contact.assignedUser?.id.toString() || 'null');
        setEditDepartmentId(contact.assignedDepartment?.id.toString() || 'null');
        setEditStageId(contact.funnelStage?.id.toString() || 'null');
        setEditTagIds(new Set(contact.tags.map(t => t.id)));
        setEditCustomData(contact.customData || {});
        setIsEditOpen(true);
    };

    const handleDeleteClick = (contact: Contact) => {
        setSelectedContact(contact);
        setIsDeleteOpen(true);
    };

    const handleSaveContact = async () => {
        if (!selectedContact) return;
        setIsSaving(true);
        try {
            const body = {
                name: editName,
                notes: editNotes,
                assignedUserId: editAgentId === 'null' ? null : editAgentId,
                assignedDepartmentId: editDepartmentId === 'null' ? null : editDepartmentId,
                funnelStageId: editStageId === 'null' ? null : editStageId,
                tagIds: Array.from(editTagIds),
                customData: editCustomData
            };

            const res = await fetch(`/api/contacts/${selectedContact.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!res.ok) throw new Error('Failed to update');
            
            mutate('/api/contacts/list');
            toast.success(t('toasts.update_success'));
            setIsEditOpen(false);
        } catch (error) {
            toast.error(t('toasts.update_error'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!selectedContact) return;
        setIsSaving(true);
        try {
            const res = await fetch(`/api/contacts/${selectedContact.id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to delete');
            mutate('/api/contacts/list');
            toast.success(t('toasts.delete_success'));
            setIsDeleteOpen(false);
        } catch (error) {
            toast.error(t('toasts.delete_error'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleBulkDelete = async () => {
        setIsSaving(true);
        try {
            const deletePromises = Array.from(selectedIds).map(id => 
                fetch(`/api/contacts/${id}`, { method: 'DELETE' })
            );
            
            await Promise.all(deletePromises);
            
            mutate('/api/contacts/list');
            toast.success(t('toasts.delete_success'));
            setSelectedIds(new Set());
            setIsBulkDeleteOpen(false);
        } catch (error) {
            toast.error(t('toasts.delete_error'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleBulkMove = async () => {
        if (!bulkMoveTargetInstance) return;
        setIsSaving(true);
        try {
            const res = await fetch('/api/contacts/move-instance', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contactIds: Array.from(selectedIds),
                    targetInstanceId: parseInt(bulkMoveTargetInstance)
                })
            });
            if (!res.ok) throw new Error('Failed to move');
            mutate('/api/contacts/list');
            toast.success(t('toasts.move_success'));
            setSelectedIds(new Set());
            setIsBulkMoveOpen(false);
            setBulkMoveTargetInstance('');
        } catch (error) {
            toast.error(t('toasts.move_error'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateField = async () => {
        if(!newFieldName) return;
        setIsSaving(true);
        try {
            const res = await fetch('/api/custom-fields', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newFieldName, type: newFieldType })
            });
            const data = await res.json().catch(() => null);
            if(!res.ok) throw new Error(data?.error || "Err");
            await mutate('/api/custom-fields');
            setNewFieldName('');
            toast.success("Field created");
        } catch(e) {
            toast.error(e instanceof Error ? e.message : "Error creating field");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteField = async (id: number) => {
        try {
            await fetch(`/api/custom-fields?id=${id}`, { method: 'DELETE' });
            mutate('/api/custom-fields');
            toast.success("Field deleted");
        } catch(e) { toast.error("Error"); }
    };

    const handleDragStart = (index: number) => setDraggingIndex(index);

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    };

    const handleDrop = async (dropIndex: number) => {
        if (draggingIndex === null || draggingIndex === dropIndex) {
            setDraggingIndex(null);
            setDragOverIndex(null);
            return;
        }
        const reordered = Array.from(orderedFields);
        const [moved] = reordered.splice(draggingIndex, 1);
        reordered.splice(dropIndex, 0, moved);
        setOrderedFields(reordered);
        setDraggingIndex(null);
        setDragOverIndex(null);
        try {
            await fetch('/api/custom-fields', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reorder: reordered.map((f, i) => ({ id: f.id, position: i })) })
            });
            mutate('/api/custom-fields');
        } catch {
            toast.error(t('toasts.field_reorder_error'));
            setOrderedFields([...customFields]);
        }
    };

    const handleDragEnd = () => { setDraggingIndex(null); setDragOverIndex(null); };

    const handleRenameField = async (id: number) => {
        const original = orderedFields.find(f => f.id === id)?.name ?? '';
        const trimmed = editingFieldName.trim();
        setEditingFieldId(null);
        if (!trimmed || trimmed === original) return;
        try {
            const res = await fetch('/api/custom-fields', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name: trimmed })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || 'Error');
            mutate('/api/custom-fields');
            toast.success(t('toasts.field_renamed'));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : t('toasts.field_rename_error'));
        }
    };

    const handleMouseDown = (e: React.MouseEvent, colId: string) => {
        const startX = e.pageX;
        const currentWidth = columns.find(c => c.id === colId)?.width || 150;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const diff = moveEvent.pageX - startX;
            setColumns(prev => prev.map(c => 
                c.id === colId ? { ...c, width: Math.max(50, currentWidth + diff) } : c
            ));
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div className="maqueta pane h-full">
            {/*
              * La barra única de la maqueta: título, cuántos se están viendo y
              * las acciones. Reemplaza al encabezado con margen que había antes;
              * con 900 contactos, cada renglón que no es tabla es un renglón
              * menos de lista.
              */}
            <div className="topbar">
                <Users className="h-4 w-4 shrink-0" aria-hidden />
                <h1>{t('header_title')}</h1>
                <span className="sub">
                    {filteredContacts.length === contacts.length
                        ? `${filteredContacts.length}`
                        : `${filteredContacts.length} de ${contacts.length}`}
                </span>
                <div className="sp" />

                <div className="search">
                    <Search />
                    <input
                        placeholder={t('search_placeholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        aria-label={t('search_placeholder')}
                    />
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button type="button" className="btn"><Filter className="h-3.5 w-3.5" /> {t('columns_btn')}</button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>{t('toggle_columns')}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {columns.map(col => (
                            <DropdownMenuCheckboxItem
                                key={col.id}
                                checked={col.visible}
                                onCheckedChange={(checked) => {
                                    setColumns(prev => prev.map(c => c.id === col.id ? { ...c, visible: checked } : c));
                                }}
                            >
                                {col.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                <button type="button" className="btn" onClick={handleExport}>
                    <FileSpreadsheet className="h-3.5 w-3.5" /> {t('export_btn')}
                </button>
                <button type="button" className="btn" onClick={() => setIsFieldsManagerOpen(true)}>
                    <Settings2 className="h-3.5 w-3.5" /> {t('custom_fields.button')}
                </button>
                <button type="button" className="btn g" onClick={() => setIsImportOpen(true)}>
                    <Upload className="h-3.5 w-3.5" /> {t('import_btn')}
                </button>
            </div>

            {/* El renglón de filtros: los mismos cinco de siempre, ahora
                rotulados, y las acciones de la selección al final. */}
            <div className="filtros">
                <label className="selcampo">
                    <span className="rot">{t('filter_agent')}</span>
                    <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}>
                        <option value="all">{t('all_agents')}</option>
                        <option value="unassigned">{t('unassigned')}</option>
                        {agents.map((a: any) => (
                            <option key={a.id} value={a.id.toString()}>{a.name || a.email}</option>
                        ))}
                    </select>
                </label>

                <label className="selcampo">
                    <span className="rot">{t('filter_stage')}</span>
                    <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
                        <option value="all">{t('all_stages')}</option>
                        <option value="no_stage">{t('no_stage')}</option>
                        {funnelStages?.map((s: any) => (
                            <option key={s.id} value={s.id.toString()}>{s.name}</option>
                        ))}
                    </select>
                </label>

                <label className="selcampo">
                    <span className="rot">{t('filter_tag')}</span>
                    <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
                        <option value="all">{t('all_tags')}</option>
                        {allTags?.map((tag: any) => (
                            <option key={tag.id} value={tag.id.toString()}>{tag.name}</option>
                        ))}
                    </select>
                </label>

                <label className="selcampo">
                    <span className="rot">{t('filter_instance')}</span>
                    <select value={filterInstance} onChange={(e) => setFilterInstance(e.target.value)}>
                        <option value="all">{t('all_instances')}</option>
                        <option value="no_instance">{t('no_instance')}</option>
                        {instances.map((inst) => (
                            <option key={inst.id} value={inst.id.toString()}>{inst.instanceName}</option>
                        ))}
                    </select>
                </label>

                <label className="selcampo">
                    <span className="rot">{t('filter_department')}</span>
                    <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)}>
                        <option value="all">{t('all_departments')}</option>
                        <option value="no_department">{t('no_department')}</option>
                        {departmentsList.map((dept) => (
                            <option key={dept.id} value={dept.id.toString()}>{dept.name}</option>
                        ))}
                    </select>
                </label>

                {selectedIds.size > 0 && (
                    <div className="ml-auto flex items-center gap-2">
                        <span className="chip" style={{ background: 'color-mix(in srgb, var(--mq-green) 14%, transparent)', color: 'var(--mq-green)' }}>
                            {selectedIds.size} {t('selected_count')}
                        </span>
                        <button type="button" className="btn sm" onClick={() => setIsBulkMoveOpen(true)}>
                            <ArrowRightLeft className="h-3 w-3" /> {t('move_btn')}
                        </button>
                        <button type="button" className="btn sm peligro" onClick={() => setIsBulkDeleteOpen(true)}>
                            <Trash2 className="h-3 w-3" /> {t('delete_btn')}
                        </button>
                        <button type="button" className="btn sm ghost" onClick={() => setSelectedIds(new Set())}>
                            <X className="h-3 w-3" /> {t('clear_selection')}
                        </button>
                    </div>
                )}
            </div>

            <div className="tbl-wrap">
                {loadingContacts || loadingFields ? (
                    <div className="flex h-40 w-full items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : filteredContacts.length === 0 ? (
                    <div className="vacio">
                        <UserIcon className="mx-auto mb-2 h-10 w-10 opacity-20" />
                        <p>{t('no_contacts_found')}</p>
                    </div>
                ) : (
                    <table className="tbl">
                        <thead>
                            <tr>
                                <th style={{ width: 44 }}>
                                    <Checkbox
                                        checked={filteredContacts.length > 0 && filteredContacts.every(c => selectedIds.has(c.id))}
                                        onCheckedChange={handleSelectAll}
                                        aria-label={t('toggle_columns')}
                                    />
                                </th>
                                {columns.filter(c => c.visible).map(col => (
                                    <th key={col.id} style={{ width: col.width, minWidth: col.width, position: 'relative' }}>
                                        {col.label}
                                        {/* El agarre para cambiar el ancho: sigue siendo el mismo
                                            arrastre de antes, ahora sobre el borde de la celda. */}
                                        <span
                                            role="presentation"
                                            className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-primary/50"
                                            onMouseDown={(e) => handleMouseDown(e, col.id)}
                                        />
                                    </th>
                                ))}
                                <th style={{ width: 52 }} />
                            </tr>
                        </thead>
                        <tbody>
                            {filteredContacts.map(contact => (
                                <tr
                                    key={contact.id}
                                    className={selectedIds.has(contact.id) ? 'sel' : ''}
                                    onClick={() => toggleSelection(contact.id)}
                                >
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <Checkbox
                                            checked={selectedIds.has(contact.id)}
                                            onCheckedChange={() => toggleSelection(contact.id)}
                                            aria-label={contact.name}
                                        />
                                    </td>
                                    {columns.filter(c => c.visible).map(col => (
                                        <td key={col.id} style={{ width: col.width, minWidth: col.width, maxWidth: col.width }}>
                                            {col.id === 'contact' && (
                                                <div className="cell-name">
                                                    <Avatar className="h-8 w-8 shrink-0 border border-border">
                                                        <AvatarImage src={contact.profilePicUrl} />
                                                        <AvatarFallback className="bg-primary/10 text-[11px] text-primary">
                                                            {contact.name.substring(0, 2).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0">
                                                        <div className="nm">{contact.name}</div>
                                                        <div className="mono" style={{ fontSize: 11, color: 'var(--mq-muted)' }}>
                                                            {contact.phone || '—'}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {col.id === 'instance' && (
                                                contact.instanceName
                                                    ? <span className="chip" style={{ background: 'var(--mq-card3)', color: 'var(--mq-muted)' }}>{contact.instanceName}</span>
                                                    : <span style={{ color: 'var(--mq-muted2)' }}>—</span>
                                            )}
                                            {col.id === 'stage' && (
                                                contact.funnelStage
                                                    ? <span className="chip" style={{ background: 'var(--mq-card3)', color: 'var(--mq-text)' }}>
                                                        {contact.funnelStage.emoji} {contact.funnelStage.name}
                                                      </span>
                                                    : <span style={{ color: 'var(--mq-muted2)' }}>—</span>
                                            )}
                                            {col.id === 'agent' && (
                                                contact.assignedUser ? (
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <Avatar className="h-5 w-5 shrink-0">
                                                            <AvatarFallback className="bg-primary/10 text-[9px] text-primary">
                                                                {(contact.assignedUser.name || contact.assignedUser.email || '??').substring(0, 2).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="truncate">{contact.assignedUser.name || contact.assignedUser.email}</span>
                                                    </div>
                                                ) : <span style={{ color: 'var(--mq-muted2)' }}>{t('unassigned')}</span>
                                            )}
                                            {col.id === 'department' && (
                                                contact.assignedDepartment
                                                    ? <span className="chip" style={{ background: 'var(--mq-card3)', color: 'var(--mq-muted)' }}>{contact.assignedDepartment.name}</span>
                                                    : <span style={{ color: 'var(--mq-muted2)' }}>—</span>
                                            )}
                                            {col.id === 'tags' && (
                                                <div className="flex flex-nowrap gap-1 overflow-hidden">
                                                    {contact.tags.slice(0, 2).map(tag => (
                                                        <span
                                                            key={tag.id}
                                                            className="chip"
                                                            style={{ color: tag.color, background: `${tag.color}22`, border: `1px solid ${tag.color}33` }}
                                                        >
                                                            {tag.name}
                                                        </span>
                                                    ))}
                                                    {contact.tags.length > 2 && (
                                                        <span className="chip" style={{ background: 'var(--mq-card3)', color: 'var(--mq-muted)' }}>
                                                            +{contact.tags.length - 2}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {col.isCustom && (
                                                <span className="truncate">
                                                    {col.type === 'boolean'
                                                        ? (contact.customData?.[col.fieldKey!] ? t('yes') : t('no'))
                                                        : (contact.customData?.[col.fieldKey!] ?? '')}
                                                </span>
                                            )}
                                        </td>
                                    ))}
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button type="button" className="btn sm ghost" aria-label={t('edit_menu')}>
                                                    <MoreVertical className="h-4 w-4" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleEditClick(contact)}>
                                                    <Edit className="mr-2 h-4 w-4" /> {t('edit_menu')}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteClick(contact)}>
                                                    <Trash2 className="mr-2 h-4 w-4" /> {t('delete_menu')}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <Dialog open={isFieldsManagerOpen} onOpenChange={(open) => { setIsFieldsManagerOpen(open); if (!open) setEditingFieldId(null); }}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>{t('custom_fields.title')}</DialogTitle>
                        <DialogDescription>{t('custom_fields.description')}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="flex gap-2 items-end">
                            <div className="grid gap-2 flex-1">
                                <Label>{t('custom_fields.field_name')}</Label>
                                <Input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} placeholder={t('custom_fields.field_placeholder')}
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreateField(); }} />
                            </div>
                            <div className="grid gap-2 w-[140px]">
                                <Label>{t('custom_fields.type')}</Label>
                                <Select value={newFieldType} onValueChange={(v: any) => setNewFieldType(v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">{t('custom_fields.type_text')}</SelectItem>
                                        <SelectItem value="boolean">{t('custom_fields.type_boolean')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={handleCreateField} disabled={isSaving || !newFieldName}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="border rounded-md mt-4">
                            <div className="bg-muted p-2 text-xs font-semibold grid grid-cols-12 gap-2">
                                <div className="col-span-1"></div>
                                <div className="col-span-5">{t('custom_fields.col_name')}</div>
                                <div className="col-span-4">{t('custom_fields.col_type')}</div>
                                <div className="col-span-2 text-right">{t('custom_fields.col_action')}</div>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                                {orderedFields.map((field, index) => (
                                    <div
                                        key={field.id}
                                        draggable
                                        onDragStart={() => handleDragStart(index)}
                                        onDragOver={(e) => handleDragOver(e, index)}
                                        onDrop={() => handleDrop(index)}
                                        onDragEnd={handleDragEnd}
                                        className={`p-2 border-t grid grid-cols-12 gap-2 items-center text-sm transition-colors
                                            ${draggingIndex === index ? 'opacity-40' : ''}
                                            ${dragOverIndex === index && draggingIndex !== index ? 'bg-primary/10 border-t-2 border-t-primary' : ''}
                                        `}
                                    >
                                        <div className="col-span-1 flex items-center cursor-grab">
                                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="col-span-5">
                                            {editingFieldId === field.id ? (
                                                <div className="flex items-center gap-1">
                                                    <Input
                                                        value={editingFieldName}
                                                        onChange={e => setEditingFieldName(e.target.value)}
                                                        onBlur={() => handleRenameField(field.id)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') handleRenameField(field.id);
                                                            if (e.key === 'Escape') setEditingFieldId(null);
                                                        }}
                                                        className="h-6 text-sm px-1"
                                                        autoFocus
                                                    />
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleRenameField(field.id)}>
                                                        <Check className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1 group">
                                                    <span className="font-medium truncate">{field.name}</span>
                                                    <Button
                                                        variant="ghost" size="icon"
                                                        className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                                                        onClick={() => { setEditingFieldId(field.id); setEditingFieldName(field.name); }}
                                                    >
                                                        <Pencil className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="col-span-4 text-muted-foreground capitalize">{field.type === 'boolean' ? t('custom_fields.type_boolean') : t('custom_fields.type_text')}</div>
                                        <div className="col-span-2 text-right">
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteField(field.id)}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                {orderedFields.length === 0 && (
                                    <div className="p-4 text-center text-muted-foreground text-sm">{t('custom_fields.empty')}</div>
                                )}
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('import_dialog.title')}</DialogTitle>
                        <DialogDescription>{t('import_dialog.description')}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        {instances.length > 0 && (
                            <div className="grid gap-2">
                                <Label>{t('import_dialog.instance_label')}</Label>
                                <Select value={importInstanceId} onValueChange={setImportInstanceId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('import_dialog.instance_placeholder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {instances.map((inst) => (
                                            <SelectItem key={inst.id} value={inst.id.toString()}>{inst.instanceName}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">{t('import_dialog.instance_hint')}</p>
                            </div>
                        )}
                        <div className="p-4 border border-dashed rounded-lg bg-muted/50 flex flex-col items-center justify-center gap-2 text-center">
                            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">{t('import_dialog.drag_text')}</p>
                            <Input 
                                ref={fileInputRef}
                                type="file" 
                                accept=".xlsx, .xls"
                                className="hidden"
                                onChange={(e) => {
                                    if(e.target.files && e.target.files[0]) setImportFile(e.target.files[0]);
                                }}
                            />
                            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                                {t('import_dialog.select_file')}
                            </Button>
                            {importFile && (
                                <div className="mt-2 flex items-center gap-2 text-sm font-medium text-foreground">
                                    <FileSpreadsheet className="h-4 w-4" />
                                    {importFile.name}
                                    <X className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); setImportFile(null); }} />
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between p-4 bg-muted rounded-md">
                            <div className="space-y-1">
                                <h4 className="text-sm font-medium">{t('import_dialog.template_title')}</h4>
                                <p className="text-xs text-muted-foreground">{t('import_dialog.template_desc')}</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                                <Download className="h-4 w-4 mr-2" />
                                {t('import_dialog.download_btn')}
                            </Button>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => { setIsImportOpen(false); setImportFile(null); setImportInstanceId(''); }}>
                            {t('import_dialog.cancel_btn')}
                        </Button>
                        <Button onClick={handleImportSubmit} disabled={!importFile || isSaving}>
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {t('import_dialog.upload_btn')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t('edit_dialog.title')}</DialogTitle>
                        <DialogDescription>{t('edit_dialog.description')}</DialogDescription>
                    </DialogHeader>
                    
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="c-name">{t('edit_dialog.name_label')}</Label>
                            <Input id="c-name" value={editName} onChange={e => setEditName(e.target.value)} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                             <div className="grid gap-2">
                                <Label>{t('edit_dialog.stage_label')}</Label>
                                <Select value={editStageId} onValueChange={setEditStageId}>
                                    <SelectTrigger><SelectValue placeholder={t('edit_dialog.select_stage')} /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="null">{t('edit_dialog.no_stage_option')}</SelectItem>
                                        {funnelStages?.map((s: any) => (
                                            <SelectItem key={s.id} value={s.id.toString()}>{s.emoji} {s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>{t('edit_dialog.agent_label')}</Label>
                                <Select value={editAgentId} onValueChange={setEditAgentId}>
                                    <SelectTrigger><SelectValue placeholder={t('edit_dialog.assign_to_placeholder')} /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="null">{t('edit_dialog.unassigned_option')}</SelectItem>
                                        {agents.map((a: any) => (
                                            <SelectItem key={a.id} value={a.id.toString()}>{a.name || a.email}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label>{t('edit_dialog.department_label')}</Label>
                            <Select value={editDepartmentId} onValueChange={setEditDepartmentId}>
                                <SelectTrigger><SelectValue placeholder={t('edit_dialog.select_department')} /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="null">{t('edit_dialog.no_department_option')}</SelectItem>
                                    {departmentsList.map((d) => (
                                        <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        {customFields && customFields.length > 0 && (
                            <>
                                <div className="border-t my-2" />
                                <Label className="text-xs font-semibold text-muted-foreground uppercase">{t('custom_fields.button')}</Label>
                                <div className="grid gap-3">
                                    {customFields.map(cf => (
                                        <div key={cf.id} className="grid gap-1.5">
                                            <Label className="text-sm font-normal">{cf.name}</Label>
                                            {cf.type === 'boolean' ? (
                                                <div className="flex items-center space-x-2">
                                                    <Switch 
                                                        checked={!!editCustomData[cf.key]} 
                                                        onCheckedChange={(checked) => setEditCustomData(prev => ({ ...prev, [cf.key]: checked }))} 
                                                    />
                                                    <span className="text-sm text-muted-foreground">{editCustomData[cf.key] ? t('yes') : t('no')}</span>
                                                </div>
                                            ) : (
                                                <Input 
                                                    value={editCustomData[cf.key] || ''} 
                                                    onChange={e => setEditCustomData(prev => ({ ...prev, [cf.key]: e.target.value }))}
                                                    className="h-9"
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t my-2" />
                            </>
                        )}

                        <div className="grid gap-2">
                            <Label>{t('edit_dialog.tags_label')}</Label>
                            <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[60px] bg-muted/50">
                                {allTags?.map((tag: any) => {
                                    const isSelected = editTagIds.has(tag.id);
                                    return (
                                        <Badge 
                                            key={tag.id} 
                                            variant={isSelected ? "default" : "outline"}
                                            className={`cursor-pointer select-none ${!isSelected ? 'bg-background text-foreground hover:bg-muted' : ''}`}
                                            onClick={() => {
                                                const newSet = new Set(editTagIds);
                                                if (newSet.has(tag.id)) newSet.delete(tag.id);
                                                else newSet.add(tag.id);
                                                setEditTagIds(newSet);
                                            }}
                                        >
                                            {tag.name}
                                            {isSelected && <X className="h-3 w-3 ml-1" />}
                                        </Badge>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="c-notes">{t('edit_dialog.notes_label')}</Label>
                            <Textarea id="c-notes" value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsEditOpen(false)}>{t('edit_dialog.cancel_btn')}</Button>
                        <Button onClick={handleSaveContact} disabled={isSaving}>
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                            {t('edit_dialog.save_btn')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('delete_dialog.title')}</DialogTitle>
                        <DialogDescription dangerouslySetInnerHTML={{ __html: t.raw('delete_dialog.description').replace('{name}', selectedContact?.name || '') }} />
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>{t('delete_dialog.cancel_btn')}</Button>
                        <Button variant="destructive" onClick={handleConfirmDelete} disabled={isSaving}>
                            {isSaving ? t('delete_dialog.deleting_btn') : t('delete_dialog.confirm_btn')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isBulkMoveOpen} onOpenChange={(open) => { setIsBulkMoveOpen(open); if (!open) setBulkMoveTargetInstance(''); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('bulk_move_dialog.title')}</DialogTitle>
                        <DialogDescription>
                            {t('bulk_move_dialog.description', { count: selectedIds.size })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label>{t('bulk_move_dialog.target_instance')}</Label>
                        <Select value={bulkMoveTargetInstance} onValueChange={setBulkMoveTargetInstance}>
                            <SelectTrigger className="mt-2">
                                <SelectValue placeholder={t('bulk_move_dialog.select_instance')} />
                            </SelectTrigger>
                            <SelectContent>
                                {instances.map((inst) => (
                                    <SelectItem key={inst.id} value={inst.id.toString()}>{inst.instanceName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setIsBulkMoveOpen(false); setBulkMoveTargetInstance(''); }}>{t('bulk_move_dialog.cancel_btn')}</Button>
                        <Button onClick={handleBulkMove} disabled={isSaving || !bulkMoveTargetInstance}>
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                            {t('bulk_move_dialog.confirm_btn')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('bulk_delete_dialog.title')}</DialogTitle>
                        <DialogDescription>
                            {t('bulk_delete_dialog.description', { count: selectedIds.size })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsBulkDeleteOpen(false)}>{t('bulk_delete_dialog.cancel_btn')}</Button>
                        <Button variant="destructive" onClick={handleBulkDelete} disabled={isSaving}>
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('bulk_delete_dialog.confirm_btn')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
