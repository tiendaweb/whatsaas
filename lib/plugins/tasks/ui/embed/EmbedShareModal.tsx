'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import {
  taskOsBtn,
  taskOsBtnActive,
  taskOsInput,
  taskOsMuted,
  taskOsPanel,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

type EmbedAccess = 'read' | 'manage';
type EmbedState = { enabled: boolean; token: string | null; access: EmbedAccess };

export type EmbedShareModalProps = {
  entityType: 'project' | 'workspace';
  entityId: number;
  entityName: string;
  onClose: () => void;
};

function useEmbedBaseUrl() {
  const [base, setBase] = useState('');
  useEffect(() => {
    const locale = window.location.pathname.split('/').filter(Boolean)[0] || 'es';
    setBase(`${window.location.origin}/${locale}/task-embed`);
  }, []);
  return base;
}

export function EmbedShareModal({ entityType, entityId, entityName, onClose }: EmbedShareModalProps) {
  const apiBase = `/api/plugins/tasks/${entityType === 'project' ? 'projects' : 'workspaces'}/${entityId}/embed`;
  const baseUrl = useEmbedBaseUrl();
  const [state, setState] = useState<EmbedState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'url' | 'iframe' | null>(null);

  useEffect(() => {
    let active = true;
    fetch(apiBase)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((data: EmbedState) => active && setState(data))
      .catch(() => active && setState({ enabled: false, token: null, access: 'manage' }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [apiBase]);

  const post = async (action: 'enable' | 'disable' | 'regenerate', access?: EmbedAccess) => {
    setBusy(true);
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(access ? { access } : {}) }),
      });
      if (res.ok) setState(await res.json());
    } finally {
      setBusy(false);
    }
  };

  const publicUrl = state?.token ? `${baseUrl}/${state.token}` : '';
  const iframeCode = publicUrl
    ? `<iframe src="${publicUrl}" width="100%" height="720" style="border:0;" loading="lazy"></iframe>`
    : '';

  const copy = async (text: string, which: 'url' | 'iframe') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className={cn('w-full max-w-lg rounded-xl border p-5 shadow-2xl', taskOsPanel)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={cn('text-base font-semibold', taskOsText)}>Compartir / Embeber</h2>
            <p className={cn('mt-0.5 truncate text-xs', taskOsMuted)}>
              {entityType === 'project' ? 'Proyecto' : 'Workspace'}: {entityName}
            </p>
          </div>
          <button type="button" onClick={onClose} className={cn('flex h-8 w-8 items-center justify-center', taskOsBtn)}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className={cn('h-5 w-5 animate-spin', taskOsMuted)} />
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-3">
              <span className={cn('text-sm', taskOsText)}>Publicar embed</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => post(state?.enabled ? 'disable' : 'enable')}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors disabled:opacity-50',
                  state?.enabled ? 'bg-[#2563eb]' : 'bg-[#2a2a30]',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                    state?.enabled ? 'translate-x-[22px]' : 'translate-x-0.5',
                  )}
                />
              </button>
            </label>

            {state?.enabled && (
              <>
                <div className="space-y-1.5">
                  <span className={cn('text-xs font-medium', taskOsMuted)}>Nivel de acceso</span>
                  <div className="flex gap-2">
                    {(['read', 'manage'] as EmbedAccess[]).map((level) => (
                      <button
                        key={level}
                        type="button"
                        disabled={busy}
                        onClick={() => post('enable', level)}
                        className={cn(
                          'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50',
                          state.access === level ? taskOsBtnActive : taskOsBtn,
                        )}
                      >
                        {level === 'read' ? 'Solo lectura' : 'Gestión completa'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className={cn('text-xs font-medium', taskOsMuted)}>Enlace público</span>
                  <div className="flex gap-2">
                    <input readOnly value={publicUrl} className={cn('min-w-0 flex-1 px-3 py-2 text-xs', taskOsInput)} />
                    <button
                      type="button"
                      onClick={() => copy(publicUrl, 'url')}
                      title="Copiar enlace"
                      className={cn('flex h-9 w-9 shrink-0 items-center justify-center', taskOsBtn)}
                    >
                      {copied === 'url' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir en nueva pestaña"
                      className={cn('flex h-9 w-9 shrink-0 items-center justify-center', taskOsBtn)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className={cn('text-xs font-medium', taskOsMuted)}>Código para insertar</span>
                  <textarea
                    readOnly
                    value={iframeCode}
                    rows={3}
                    className={cn('w-full resize-none px-3 py-2 font-mono text-[11px] leading-relaxed', taskOsInput)}
                  />
                  <button
                    type="button"
                    onClick={() => copy(iframeCode, 'iframe')}
                    className={cn('flex w-full items-center justify-center gap-2 px-3 py-2 text-xs font-medium', taskOsBtn)}
                  >
                    {copied === 'iframe' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copiar código
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-[#2a2a30] pt-3">
                  <p className={cn('max-w-[60%] text-[11px]', taskOsMuted)}>
                    Regenerar invalida el enlace anterior.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => post('regenerate')}
                    className={cn('flex items-center gap-2 px-3 py-2 text-xs', taskOsBtn)}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} /> Regenerar token
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
