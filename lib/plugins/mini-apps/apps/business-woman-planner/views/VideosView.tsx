'use client';

import React, { useState } from 'react';
import { ExternalLink, PlayCircle } from 'lucide-react';
import { Panel, SectionHeader } from '../components/shared';

type VideoItem = {
  _recordId: string;
  url: string;
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  authorName?: string;
  notes?: string;
  tags?: string;
  createdAt: string;
};

interface VideosViewProps {
  videos: VideoItem[];
  query: string;
  selectedVideoId: string;
  onQueryChange: (query: string) => void;
  onSelectVideo: (id: string) => void;
  onAddVideo: (video: VideoItem) => void;
  onUpdateVideo: (id: string, patch: Partial<VideoItem>) => void;
  onDeleteVideo: (id: string) => void;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function getPlayableVideoId(video?: VideoItem) {
  if (!video) return '';
  if (/^[A-Za-z0-9_-]{6,20}$/.test(video.videoId)) return video.videoId;
  try {
    const parsed = new URL(video.url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (host.endsWith('youtube.com')) {
      if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || '';
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live'].includes(parts[0])) return parts[1] || '';
    }
  } catch {}
  return '';
}

export function VideosView({
  videos,
  query,
  selectedVideoId,
  onQueryChange,
  onSelectVideo,
  onAddVideo,
  onUpdateVideo,
  onDeleteVideo,
}: VideosViewProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const filtered = videos.filter((video) => `${video.title} ${video.authorName} ${video.tags}`.toLowerCase().includes(query.toLowerCase()));
  const selected = videos.find((video) => video.videoId === selectedVideoId) ?? filtered[0];
  const playableVideoId = getPlayableVideoId(selected);

  async function addVideo() {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    try {
      // Note: relies on the mini-app youtube route in main app
      const response = await fetch(`/api/mini-apps/business-woman-planner/youtube?url=${encodeURIComponent(url.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo leer el video');
      onAddVideo({
        _recordId: makeId(),
        url: data.url,
        videoId: data.videoId,
        title: data.title,
        thumbnailUrl: data.thumbnailUrl,
        authorName: data.authorName,
        notes: '',
        tags: '',
        createdAt: new Date().toISOString(),
      });
      onSelectVideo(data.videoId);
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el video');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Panel className="p-4">
        <SectionHeader title="Mis Videos" />
        <div className="mb-3 flex gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL de YouTube" className="flex-1 rounded-2xl border border-white/60 bg-white/90 px-3 py-2 text-sm" />
          <button onClick={addVideo} disabled={loading || !url.trim()} className="rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-4 text-sm font-bold text-white disabled:opacity-50">+ Agregar</button>
        </div>
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        <input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Buscar videos..." className="w-full mb-3 rounded-2xl border px-3 py-2 text-sm bg-white/80" />
        <div className="max-h-[420px] overflow-auto space-y-2">
          {filtered.map((v) => (
            <div key={v._recordId} onClick={() => onSelectVideo(v.videoId)} className={`cursor-pointer rounded-2xl p-2 flex gap-2 border transition ${selected?.videoId === v.videoId ? 'border-rose-300 bg-rose-50/30' : 'border-white/40 hover:bg-white/60'}`}>
              <div className="relative flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-900 text-white">
                {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <PlayCircle className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold line-clamp-1">{v.title}</div>
                <div className="text-xs text-zinc-500">{v.authorName}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onDeleteVideo(v._recordId); }} className="ml-auto text-xs text-red-400">×</button>
            </div>
          ))}
          {!filtered.length && <div className="px-3 py-8 text-center text-sm text-zinc-500">Todavía no hay videos guardados. Pega una URL de YouTube arriba para agregar el primero.</div>}
        </div>
      </Panel>

      <Panel className="p-4 min-h-[420px]">
        {selected ? (
          <div>
            <div className="mb-3 aspect-video overflow-hidden rounded-2xl bg-black">
              {playableVideoId ? (
                <iframe
                  key={playableVideoId}
                  src={`https://www.youtube-nocookie.com/embed/${playableVideoId}?playsinline=1&rel=0`}
                  title={selected.title || 'Video de YouTube'}
                  className="h-full w-full"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center text-white">
                  <PlayCircle className="h-8 w-8" />
                  <span className="text-sm">No se pudo identificar este enlace de YouTube.</span>
                </div>
              )}
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-bold">{selected.title}</div>
                <div className="mb-2 text-sm text-zinc-500">{selected.authorName}</div>
              </div>
              <a href={selected.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir
              </a>
            </div>
            <textarea value={selected.notes || ''} onChange={(e) => onUpdateVideo(selected._recordId, { notes: e.target.value })} placeholder="Notas sobre el video..." className="w-full min-h-[120px] rounded-2xl border p-3 text-sm bg-white/80" />
            <input value={selected.tags || ''} onChange={(e) => onUpdateVideo(selected._recordId, { tags: e.target.value })} placeholder="Etiquetas (separadas por coma)" className="mt-2 w-full rounded-2xl border p-2 text-sm bg-white/80" />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500">Selecciona un video para reproducir.</div>
        )}
      </Panel>
    </div>
  );
}
