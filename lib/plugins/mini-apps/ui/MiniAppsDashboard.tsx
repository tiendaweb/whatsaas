'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import {
  Sparkles,
  LayoutGrid,
  ChevronLeft,
  Download,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { MINI_APPS_CATALOG, type MiniAppMeta } from '../catalog';
import { BusinessWomanPlanner } from '../apps/business-woman-planner';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type InstalledApp = { slug: string; installedAt: string };

function AppIcon({ icon, color }: { icon: string; color: string }) {
  // We only have Sparkles in the catalog for now
  return (
    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0`}>
      <Sparkles className="w-6 h-6 text-white" />
    </div>
  );
}

function AppRenderer({ slug }: { slug: string }) {
  if (slug === 'business-woman-planner') {
    return <BusinessWomanPlanner />;
  }
  return (
    <div className="flex items-center justify-center h-64 text-zinc-400">
      App &quot;{slug}&quot; no encontrada.
    </div>
  );
}

export function MiniAppsDashboard() {
  const { data: installedRaw, isLoading } = useSWR<InstalledApp[]>('/api/mini-apps', fetcher);
  const installed = installedRaw ?? [];

  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);

  const installedSlugs = new Set(installed.map((a) => a.slug));

  async function installApp(slug: string) {
    setInstalling(slug);
    try {
      await fetch('/api/mini-apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      await mutate('/api/mini-apps');
    } finally {
      setInstalling(null);
    }
  }

  async function uninstallApp(slug: string) {
    if (!confirm('¿Desinstalar esta app? Los datos se conservarán.')) return;
    setUninstalling(slug);
    try {
      await fetch(`/api/mini-apps/${slug}`, { method: 'DELETE' });
      if (openSlug === slug) setOpenSlug(null);
      await mutate('/api/mini-apps');
    } finally {
      setUninstalling(null);
    }
  }

  // If an app is open, render it full-screen (within the plugin page)
  if (openSlug) {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        {/* Back bar */}
        <div className="flex-shrink-0 bg-white border-b border-pink-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setOpenSlug(null)}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-rose-500 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Mis Apps
          </button>
          <span className="text-zinc-300">/</span>
          <span className="text-sm font-medium text-zinc-700">
            {MINI_APPS_CATALOG.find((a) => a.slug === openSlug)?.name ?? openSlug}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          <AppRenderer slug={openSlug} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6 space-y-8">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center">
          <LayoutGrid className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Mis Apps</h1>
          <p className="text-sm text-zinc-500">Instala y gestiona tus mini aplicaciones personalizadas</p>
        </div>
      </div>

      {/* Installed apps section */}
      {installed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Apps instaladas
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {installed.map((inst) => {
              const meta = MINI_APPS_CATALOG.find((a) => a.slug === inst.slug);
              if (!meta) return null;
              return (
                <InstalledCard
                  key={inst.slug}
                  meta={meta}
                  onOpen={() => {
                    if (inst.slug === 'business-woman-planner') {
                      document.documentElement.requestFullscreen().catch(() => {});
                    }
                    setOpenSlug(inst.slug);
                  }}
                  onUninstall={() => uninstallApp(inst.slug)}
                  isUninstalling={uninstalling === inst.slug}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Catalog section */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Catálogo de apps
        </h2>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-fuchsia-400 border-t-transparent" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MINI_APPS_CATALOG.map((meta) => (
              <CatalogCard
                key={meta.slug}
                meta={meta}
                isInstalled={installedSlugs.has(meta.slug)}
                isInstalling={installing === meta.slug}
                onInstall={() => installApp(meta.slug)}
                onOpen={() => {
                  if (meta.slug === 'business-woman-planner') {
                    document.documentElement.requestFullscreen().catch(() => {});
                  }
                  setOpenSlug(meta.slug);
                }}
                onUninstall={() => uninstallApp(meta.slug)}
                isUninstalling={uninstalling === meta.slug}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Installed card ───────────────────────────────────────────────────────────

function InstalledCard({
  meta,
  onOpen,
  onUninstall,
  isUninstalling,
}: {
  meta: MiniAppMeta;
  onOpen: () => void;
  onUninstall: () => void;
  isUninstalling: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <AppIcon icon={meta.icon} color={meta.color} />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-zinc-900 text-sm leading-tight">{meta.name}</h3>
          <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{meta.description}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-auto">
        <button
          onClick={onOpen}
          className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:from-fuchsia-600 hover:to-pink-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Abrir
        </button>
        <button
          onClick={onUninstall}
          disabled={isUninstalling}
          className="flex items-center justify-center gap-1.5 border border-zinc-200 hover:border-red-300 hover:bg-red-50 text-zinc-400 hover:text-red-500 text-sm px-3 py-2 rounded-lg transition-all disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Catalog card ─────────────────────────────────────────────────────────────

function CatalogCard({
  meta,
  isInstalled,
  isInstalling,
  onInstall,
  onOpen,
  onUninstall,
  isUninstalling,
}: {
  meta: MiniAppMeta;
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: () => void;
  onOpen: () => void;
  onUninstall: () => void;
  isUninstalling: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <AppIcon icon={meta.icon} color={meta.color} />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-zinc-900 text-sm leading-tight">{meta.name}</h3>
          <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{meta.description}</p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {meta.tags.map((tag) => (
          <span
            key={tag}
            className="text-xs px-2 py-0.5 rounded-full bg-pink-50 text-rose-500 font-medium"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        {isInstalled ? (
          <>
            <button
              onClick={onOpen}
              className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:from-fuchsia-600 hover:to-pink-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir
            </button>
            <button
              onClick={onUninstall}
              disabled={isUninstalling}
              className="flex items-center justify-center gap-1.5 border border-zinc-200 hover:border-red-300 hover:bg-red-50 text-zinc-400 hover:text-red-500 text-sm px-3 py-2 rounded-lg transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={onInstall}
            disabled={isInstalling}
            className="flex-1 flex items-center justify-center gap-1.5 border border-zinc-200 hover:border-fuchsia-400 hover:bg-fuchsia-50 text-zinc-600 hover:text-fuchsia-600 text-sm font-medium px-3 py-2 rounded-lg transition-all disabled:opacity-50"
          >
            {isInstalling ? (
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-fuchsia-400 border-t-transparent" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {isInstalling ? 'Instalando...' : 'Instalar'}
          </button>
        )}
      </div>
    </div>
  );
}
