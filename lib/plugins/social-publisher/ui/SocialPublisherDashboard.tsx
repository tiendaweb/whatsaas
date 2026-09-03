'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  Share2,
  Plus,
  Settings,
  Trash2,
  RefreshCw,
  ExternalLink,
  CalendarClock,
  Loader2,
  Facebook,
  Instagram,
  ImageIcon,
  Film,
} from 'lucide-react';
import {
  fetcher,
  POST_STATUS_LABELS,
  FORMAT_LABELS,
  type SocialPostItem,
} from './types';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'draft', label: 'Borradores' },
  { value: 'scheduled', label: 'Programadas' },
  { value: 'publishing', label: 'Publicando' },
  { value: 'published', label: 'Publicadas' },
  { value: 'failed', label: 'Fallidas' },
];

function statusBadgeClass(status: SocialPostItem['status']): string {
  switch (status) {
    case 'draft': return 'bg-muted text-muted-foreground';
    case 'scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
    case 'publishing': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 animate-pulse';
    case 'published': return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    case 'partially_published': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
    case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
  }
}

function PlatformIcon({ platform }: { platform: 'facebook_page' | 'instagram' }) {
  return platform === 'instagram'
    ? <Instagram className="h-3.5 w-3.5" />
    : <Facebook className="h-3.5 w-3.5" />;
}

export function SocialPublisherDashboard() {
  const { data: posts, isLoading, mutate } = useSWR<SocialPostItem[]>('/api/plugins/social-publisher/posts', fetcher, {
    refreshInterval: 15000,
  });
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const list = Array.isArray(posts) ? posts : [];
    if (filter === 'all') return list;
    if (filter === 'failed') return list.filter((p) => p.status === 'failed' || p.status === 'partially_published');
    return list.filter((p) => p.status === filter);
  }, [posts, filter]);

  const handleRetry = async (post: SocialPostItem) => {
    setBusyId(post.id);
    try {
      const res = await fetch(`/api/plugins/social-publisher/posts/${post.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      toast.success('Reintento en cola; se publicará en el próximo minuto');
      mutate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (post: SocialPostItem) => {
    if (!confirm('¿Eliminar esta publicación?')) return;
    setBusyId(post.id);
    try {
      const res = await fetch(`/api/plugins/social-publisher/posts/${post.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      toast.success('Publicación eliminada');
      mutate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Share2 className="h-6 w-6" /> Publicaciones Sociales
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Publica y programa contenido en Facebook e Instagram
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/plugins/social-publisher/settings">
              <Settings className="h-4 w-4 mr-2" /> Cuentas
            </Link>
          </Button>
          <Button asChild>
            <Link href="/plugins/social-publisher/new">
              <Plus className="h-4 w-4 mr-2" /> Nueva publicación
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg">
          <Share2 className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No hay publicaciones {filter !== 'all' ? 'con este estado' : 'todavía'}</p>
          <Button className="mt-4" asChild>
            <Link href="/plugins/social-publisher/new">
              <Plus className="h-4 w-4 mr-2" /> Crear la primera
            </Link>
          </Button>
        </div>
      ) : (
        <TooltipProvider>
          <div className="space-y-3">
            {filtered.map((post) => (
              <div key={post.id} className="border rounded-lg p-4 flex items-start gap-4 bg-card">
                {post.mediaItems.length > 0 ? (
                  post.mediaItems[0].type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.mediaItems[0].url} alt="" className="h-16 w-16 rounded object-cover shrink-0" />
                  ) : (
                    <div className="h-16 w-16 rounded bg-muted flex items-center justify-center shrink-0">
                      <Film className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )
                ) : (
                  <div className="h-16 w-16 rounded bg-muted flex items-center justify-center shrink-0">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={statusBadgeClass(post.status)}>{POST_STATUS_LABELS[post.status]}</Badge>
                    <Badge variant="outline">{FORMAT_LABELS[post.format]}</Badge>
                    {post.scheduledAt && post.status === 'scheduled' && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {new Date(post.scheduledAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-1.5 line-clamp-2">{post.caption || <span className="text-muted-foreground italic">Sin texto</span>}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {post.targets.map((t) => (
                      <Tooltip key={t.id}>
                        <TooltipTrigger asChild>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                            t.status === 'published' ? 'border-green-300 text-green-700 dark:text-green-400'
                            : t.status === 'failed' ? 'border-red-300 text-red-700 dark:text-red-400'
                            : 'border-border text-muted-foreground'
                          }`}>
                            <PlatformIcon platform={t.platform} />
                            {t.account.name}
                            {t.permalink && (
                              <a href={t.permalink} target="_blank" rel="noopener noreferrer" className="hover:opacity-70">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t.status === 'failed' ? (t.errorMessage || 'Falló') : POST_STATUS_LABELS[t.status as keyof typeof POST_STATUS_LABELS] || t.status}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {(post.status === 'failed' || post.status === 'partially_published') && (
                    <Button variant="ghost" size="sm" onClick={() => handleRetry(post)} disabled={busyId === post.id} title="Reintentar">
                      <RefreshCw className={`h-4 w-4 ${busyId === post.id ? 'animate-spin' : ''}`} />
                    </Button>
                  )}
                  {(post.status === 'draft' || post.status === 'scheduled') && (
                    <Button variant="ghost" size="sm" asChild title="Editar">
                      <Link href={`/plugins/social-publisher/edit/${post.id}`}>Editar</Link>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(post)} disabled={busyId === post.id} title="Eliminar">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
