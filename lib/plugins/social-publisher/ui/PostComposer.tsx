'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Facebook,
  Instagram,
  ImagePlus,
  Loader2,
  Send,
  CalendarClock,
  Save,
  X,
  Film,
  AlertTriangle,
} from 'lucide-react';
import { validatePostForPlatform, type SocialPlatform } from '@/lib/social/validation';
import { PlatformPreview } from './PlatformPreview';
import { fetcher, type MediaItem, type SocialAccountItem, type SocialPostItem } from './types';

type Mode = 'now' | 'scheduled' | 'draft';

export function PostComposer({ postId }: { postId?: number }) {
  const router = useRouter();
  const { data: accounts } = useSWR<SocialAccountItem[]>('/api/plugins/social-publisher/accounts', fetcher);
  const { data: existing } = useSWR<SocialPostItem>(
    postId ? `/api/plugins/social-publisher/posts/${postId}` : null,
    fetcher,
  );

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [format, setFormat] = useState<'post' | 'reel' | 'story'>('post');
  const [caption, setCaption] = useState('');
  const [link, setLink] = useState('');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mode, setMode] = useState<Mode>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);

  // Cargar datos en modo edición
  useEffect(() => {
    if (!existing || loadedRef.current || (existing as any).error) return;
    loadedRef.current = true;
    setSelectedIds(existing.targets.map((t) => t.account.id));
    setFormat(existing.format);
    setCaption(existing.caption || '');
    setLink(existing.link || '');
    setMediaItems(existing.mediaItems || []);
    if (existing.status === 'scheduled' && existing.scheduledAt) {
      setMode('scheduled');
      const d = new Date(existing.scheduledAt);
      const pad = (n: number) => String(n).padStart(2, '0');
      setScheduledAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else {
      setMode('draft');
    }
  }, [existing]);

  const accountList = Array.isArray(accounts) ? accounts.filter((a) => a.status === 'active') : [];
  const selectedAccounts = accountList.filter((a) => selectedIds.includes(a.id));
  const hasInstagram = selectedAccounts.some((a) => a.platform === 'instagram');

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    for (const account of selectedAccounts) {
      const errs = validatePostForPlatform({
        platform: account.platform as SocialPlatform,
        format,
        caption,
        link: link || null,
        mediaItems,
      });
      errors.push(...errs.map((e) => `${account.name}: ${e}`));
    }
    return errors;
  }, [selectedAccounts, format, caption, link, mediaItems]);

  const toggleAccount = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/plugins/social-publisher/upload', { method: 'POST', body: formData });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error al subir');
        setMediaItems((prev) => [...prev, { url: json.url, type: json.type, order: prev.length }]);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeMedia = (index: number) => {
    setMediaItems((prev) => prev.filter((_, i) => i !== index).map((m, i) => ({ ...m, order: i })));
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) {
      toast.error('Selecciona al menos una cuenta destino');
      return;
    }
    if (mode !== 'draft' && validationErrors.length > 0) {
      toast.error('Corrige los errores de validación antes de publicar');
      return;
    }
    if (mode === 'scheduled' && !scheduledAt) {
      toast.error('Selecciona fecha y hora');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        caption: caption || null,
        link: link || null,
        format,
        mediaItems,
        accountIds: selectedIds,
        mode,
        scheduledAt: mode === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      const res = await fetch(
        postId ? `/api/plugins/social-publisher/posts/${postId}` : '/api/plugins/social-publisher/posts',
        {
          method: postId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        const message = typeof json.error === 'string' ? json.error : 'Datos inválidos';
        throw new Error(message);
      }
      toast.success(
        mode === 'now' ? 'Publicación en cola; se publicará en el próximo minuto'
        : mode === 'scheduled' ? 'Publicación programada'
        : 'Borrador guardado',
      );
      router.push('/plugins/social-publisher');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/plugins/social-publisher"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-2xl font-semibold">{postId ? 'Editar publicación' : 'Nueva publicación'}</h1>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          {/* Cuentas destino */}
          <div className="space-y-2">
            <Label>Publicar en</Label>
            {accountList.length === 0 ? (
              <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4">
                No hay cuentas conectadas.{' '}
                <Link href="/plugins/social-publisher/settings" className="underline">Conecta una cuenta</Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {accountList.map((account) => {
                  const selected = selectedIds.includes(account.id);
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => toggleAccount(account.id)}
                      className={`flex items-center gap-2 border rounded-full pl-1 pr-3 py-1 text-sm transition-colors ${
                        selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                      }`}
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={account.pictureUrl || undefined} />
                        <AvatarFallback className="text-[10px]">{account.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {account.platform === 'instagram'
                        ? <Instagram className="h-3.5 w-3.5 text-pink-600" />
                        : <Facebook className="h-3.5 w-3.5 text-blue-600" />}
                      {account.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Formato */}
          <div className="space-y-2">
            <Label>Formato</Label>
            <Tabs value={format} onValueChange={(v) => setFormat(v as typeof format)}>
              <TabsList>
                <TabsTrigger value="post">Publicación</TabsTrigger>
                <TabsTrigger value="reel">Reel</TabsTrigger>
                <TabsTrigger value="story">Historia</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Texto */}
          {format !== 'story' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="caption">Texto</Label>
                <span className={`text-xs ${hasInstagram && caption.length > 2200 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {caption.length}{hasInstagram ? ' / 2200' : ''}
                </span>
              </div>
              <Textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Escribe el contenido de la publicación..."
                rows={5}
              />
            </div>
          )}

          {/* Link (solo FB, formato post) */}
          {format === 'post' && !hasInstagram && (
            <div className="space-y-2">
              <Label htmlFor="link">Enlace (opcional, solo Facebook)</Label>
              <Input id="link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
            </div>
          )}

          {/* Media */}
          <div className="space-y-2">
            <Label>Archivos</Label>
            <div className="flex flex-wrap gap-3">
              {mediaItems.map((item, i) => (
                <div key={item.url} className="relative h-24 w-24 rounded border overflow-hidden group">
                  {item.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-muted flex items-center justify-center">
                      <Film className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(i)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="h-24 w-24 rounded border border-dashed flex flex-col items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
              >
                {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                <span className="text-[10px] mt-1">{isUploading ? 'Subiendo...' : 'Agregar'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Imágenes (JPG, PNG, WebP) o video (MP4, MOV). Las imágenes se convierten a JPEG para Instagram.
            </p>
          </div>

          {/* Programación */}
          <div className="space-y-3">
            <Label>¿Cuándo publicar?</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="space-y-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="now" id="mode-now" />
                <Label htmlFor="mode-now" className="font-normal cursor-pointer flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5" /> Publicar ahora
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="scheduled" id="mode-scheduled" />
                <Label htmlFor="mode-scheduled" className="font-normal cursor-pointer flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" /> Programar
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="draft" id="mode-draft" />
                <Label htmlFor="mode-draft" className="font-normal cursor-pointer flex items-center gap-1.5">
                  <Save className="h-3.5 w-3.5" /> Guardar como borrador
                </Label>
              </div>
            </RadioGroup>
            {mode === 'scheduled' && (
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                className="max-w-xs"
              />
            )}
          </div>

          {/* Errores de validación */}
          {validationErrors.length > 0 && selectedAccounts.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 rounded-lg p-3 space-y-1">
              {validationErrors.map((err, i) => (
                <p key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" /> {err}
                </p>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" asChild>
              <Link href="/plugins/social-publisher">Cancelar</Link>
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving || selectedIds.length === 0 || (mode !== 'draft' && validationErrors.length > 0)}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {mode === 'now' ? 'Publicar' : mode === 'scheduled' ? 'Programar' : 'Guardar borrador'}
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-4">
          <Label>Vista previa</Label>
          {selectedAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4">
              Selecciona una cuenta para ver la vista previa
            </p>
          ) : (
            selectedAccounts.map((account) => (
              <PlatformPreview
                key={account.id}
                platform={account.platform}
                format={format}
                accountName={account.name}
                caption={caption}
                link={link || undefined}
                mediaItems={mediaItems}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
