'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MenuTarjeta } from './MenuTarjeta';
import { SeccionEtapa } from './SeccionEtapa';
import { Toolbar } from './Toolbar';
import {
  GRUPO_SIN,
  GRUPO_TODAS,
  LS_DENSIDAD,
  LS_GRUPO,
  LS_PLEGADAS,
  type ContactoCard,
  type Densidad,
  type Etapa,
  type Orden,
  type Seccion,
  type Segmento,
} from './tipos';
import { useSeguimientoData } from './use-seguimiento-data';
import { guardarLS, leerLS, ordenar, plano } from './utils';

function segmentoDe(v: string | null): Segmento {
  return v === 'leads' || v === 'clientes' ? v : 'todos';
}

function ordenDe(v: string | null): Orden {
  return v === 'nombre' || v === 'sinContestar' || v === 'temperatura' ? v : 'ultimo';
}

function tagsDe(v: string | null): number[] {
  if (!v) return [];
  return v
    .split(',')
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x > 0);
}

export function SeguimientoApp() {
  const t = useTranslations('Seguimiento');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);

  const { contactos, etapas, grupos, etiquetas, puede, isLoading, error, recargar, mutateChats } = useSeguimientoData();

  // La URL manda; localStorage sólo recuerda grupo, densidad y secciones plegadas.
  const q = searchParams.get('q') ?? '';
  const segmento = segmentoDe(searchParams.get('seg'));
  const orden = ordenDe(searchParams.get('orden'));
  const tagsSel = useMemo(() => tagsDe(searchParams.get('tags')), [searchParams]);
  const grupoUrl = searchParams.get('grupo');

  const [grupoLocal, setGrupoLocal] = useState<string | null>(null);
  const [densidad, setDensidad] = useState<Densidad>('tarjetas');
  const [plegadas, setPlegadas] = useState<string[]>([]);
  const [seleccionadoJid, setSeleccionadoJid] = useState<string | null>(null);
  const [esMovil, setEsMovil] = useState(false);
  const [moviendoChatId, setMoviendoChatId] = useState<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setEsMovil(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    setGrupoLocal(leerLS<string | null>(LS_GRUPO, null));
    setDensidad(leerLS<Densidad>(LS_DENSIDAD, 'tarjetas'));
    setPlegadas(leerLS<string[]>(LS_PLEGADAS, ['sinFicha']));
  }, []);

  const grupo = useMemo(() => {
    const candidato = grupoUrl ?? grupoLocal;
    if (candidato === GRUPO_TODAS || candidato === GRUPO_SIN) return candidato;
    if (candidato && grupos.some((g) => String(g.id) === candidato)) return candidato;
    return grupos[0] ? String(grupos[0].id) : GRUPO_TODAS;
  }, [grupoUrl, grupoLocal, grupos]);

  const setParam = useCallback(
    (cambios: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(cambios)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const onGrupo = (v: string) => {
    setGrupoLocal(v);
    guardarLS(LS_GRUPO, v);
    setParam({ grupo: v });
  };
  const onDensidad = (v: Densidad) => {
    setDensidad(v);
    guardarLS(LS_DENSIDAD, v);
  };
  const onTogglePlegada = (key: string) => {
    setPlegadas((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      guardarLS(LS_PLEGADAS, next);
      return next;
    });
  };

  // Atajos: "/" enfoca la búsqueda, Esc la limpia.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const escribiendo = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '/' && !escribiendo) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && target === searchRef.current && q) {
        setParam({ q: null });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [q, setParam]);

  // Segmento → conteos sobre el universo completo (para las pills).
  const porSegmento = useMemo<Record<Segmento, ContactoCard[]>>(() => {
    const leads = contactos.filter((c) => c.contactId !== null && c.etapaId !== null && !c.esCliente);
    const clientes = contactos.filter((c) => c.esCliente);
    return { todos: contactos, leads, clientes };
  }, [contactos]);

  const conteos = useMemo<Record<Segmento, number>>(
    () => ({ todos: porSegmento.todos.length, leads: porSegmento.leads.length, clientes: porSegmento.clientes.length }),
    [porSegmento],
  );

  // Filtro por texto y etiquetas.
  const filtrados = useMemo(() => {
    const base = porSegmento[segmento];
    const texto = plano(q.trim());
    const digitos = texto.replace(/\D/g, '');
    const tags = new Set(tagsSel);
    return base.filter((c) => {
      if (tags.size > 0 && !c.etiquetas.some((e) => tags.has(e.id))) return false;
      if (texto) {
        const porNombre = plano(c.nombre).includes(texto);
        const porNumero = digitos.length >= 3 && c.numero.includes(digitos);
        if (!porNombre && !porNumero) return false;
      }
      return true;
    });
  }, [porSegmento, segmento, q, tagsSel]);

  const etapasGrupo = useMemo<Etapa[]>(
    () =>
      grupo === GRUPO_TODAS
        ? etapas
        : grupo === GRUPO_SIN
          ? etapas.filter((e) => e.groupId === null)
          : etapas.filter((e) => String(e.groupId) === grupo),
    [etapas, grupo],
  );

  // Secciones por etapa del grupo elegido.
  const secciones = useMemo<Seccion[]>(() => {
    const idsGrupo = new Set(etapasGrupo.map((e) => e.id));
    const ordenados = ordenar(filtrados, orden);

    const porEtapa = new Map<number, ContactoCard[]>();
    const sinEtapa: ContactoCard[] = [];
    const sinFicha: ContactoCard[] = [];
    for (const c of ordenados) {
      if (c.contactId === null) {
        sinFicha.push(c);
      } else if (c.etapaId === null) {
        sinEtapa.push(c);
      } else if (idsGrupo.has(c.etapaId)) {
        const arr = porEtapa.get(c.etapaId) ?? [];
        arr.push(c);
        porEtapa.set(c.etapaId, arr);
      }
    }

    const out: Seccion[] = etapasGrupo.map((etapa) => ({
      key: String(etapa.id),
      tipo: 'etapa',
      etapa,
      contactos: porEtapa.get(etapa.id) ?? [],
    }));
    if (segmento !== 'clientes' || sinEtapa.length > 0) {
      out.push({ key: 'sinEtapa', tipo: 'sinEtapa', etapa: null, contactos: sinEtapa });
    }
    if (segmento === 'todos' && sinFicha.length > 0) {
      out.push({ key: 'sinFicha', tipo: 'sinFicha', etapa: null, contactos: sinFicha });
    }
    return out;
  }, [etapasGrupo, filtrados, orden, segmento]);

  const totalVisible = secciones.reduce((acc, s) => acc + s.contactos.length, 0);
  const hayFiltros = Boolean(q) || tagsSel.length > 0;

  const onAbrirChat = useCallback(
    (c: ContactoCard) => {
      setSeleccionadoJid(c.remoteJid);
      const query = c.instanceId ? `?instanceId=${c.instanceId}` : '';
      router.push(`/dashboard/chat/${c.numero}${query}`);
    },
    [router],
  );

  /**
   * Cambia la etapa del contacto: primero en pantalla, después en el servidor.
   *
   * La lista se pinta desde `/api/chats?scope=kanban`, así que el optimismo se
   * escribe sobre esa caché; si el PUT falla se revalida y la tarjeta vuelve
   * sola a su sección, que es más honesto que dejarla donde el usuario la soltó.
   *
   * Un chat sin ficha en `contacts` no tiene a quién moverle la etapa: se le
   * crea la ficha con la etapa ya puesta (un solo POST) y por eso es la única
   * forma de sacarlo de "Sin ficha".
   */
  const moverContacto = useCallback(
    async (c: ContactoCard, etapaId: number | null) => {
      if (c.etapaId === etapaId && c.contactId !== null) return;
      const etapa = etapaId === null ? null : etapas.find((e) => e.id === etapaId) ?? null;
      const nombreEtapa = etapa ? `${etapa.emoji ?? ''} ${etapa.name}`.trim() : t('section.unassigned');

      setMoviendoChatId(c.chatId);
      await mutateChats(
        (actual) =>
          actual?.map((chat) =>
            chat.id === c.chatId && chat.contact
              ? { ...chat, contact: { ...chat.contact, funnelStage: etapaId === null ? null : { id: etapaId } } }
              : chat,
          ),
        { revalidate: false },
      );

      try {
        const res = c.contactId
          ? await fetch(`/api/contacts/${c.contactId}/funnel-stage`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ stageId: etapaId }),
            })
          : await fetch('/api/contacts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jid: c.remoteJid, name: c.nombre, funnelStageId: etapaId }),
            });
        if (!res.ok) throw new Error(String(res.status));
        toast.success(t('toast.moved', { stage: nombreEtapa }));
      } catch {
        toast.error(t('toast.moveError'));
      } finally {
        setMoviendoChatId(null);
        void mutateChats();
      }
    },
    [etapas, mutateChats, t],
  );

  // Soltar en otra sección = cambiar de etapa. Dentro de la misma no hay orden
  // que guardar, así que no hace nada.
  const onDragEnd = useCallback(
    (result: DropResult) => {
      const destino = result.destination?.droppableId;
      if (!destino || destino === result.source.droppableId) return;
      const chatId = Number(result.draggableId.slice(1));
      const contacto = contactos.find((c) => c.chatId === chatId);
      if (!contacto) return;
      if (destino === 'sinFicha') return;
      const etapaId = destino === 'sinEtapa' ? null : Number(destino);
      if (destino !== 'sinEtapa' && !Number.isInteger(etapaId)) return;
      void moverContacto(contacto, etapaId);
    },
    [contactos, moverContacto],
  );

  // En móvil el arrastre pelea con el scroll y con la barra inferior: ahí la
  // etapa se cambia desde el menú de la tarjeta.
  const puedeArrastrar = puede.contactos && !esMovil;

  const renderMenu = useCallback(
    (c: ContactoCard) =>
      puede.contactos ? (
        <MenuTarjeta
          contacto={c}
          etapas={etapasGrupo}
          moviendo={moviendoChatId === c.chatId}
          onAbrirChat={onAbrirChat}
          onMover={(contacto, etapaId) => void moverContacto(contacto, etapaId)}
        />
      ) : null,
    [puede.contactos, etapasGrupo, moviendoChatId, onAbrirChat, moverContacto],
  );

  return (
    <div className="flex h-full min-h-0 w-full bg-background">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Toolbar
          ref={searchRef}
          q={q}
          onQ={(v) => setParam({ q: v })}
          segmento={segmento}
          onSegmento={(v) => setParam({ seg: v === 'todos' ? null : v })}
          conteos={conteos}
          grupo={grupo}
          onGrupo={onGrupo}
          grupos={grupos}
          etiquetas={etiquetas}
          tagsSel={tagsSel}
          onTagsSel={(ids) => setParam({ tags: ids.length ? ids.join(',') : null })}
          densidad={densidad}
          onDensidad={onDensidad}
          orden={orden}
          onOrden={(v) => setParam({ orden: v === 'ultimo' ? null : v })}
        />

        {error && (
          <div className="mx-4 mt-3 flex items-center justify-between rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
            <span>{t('error.load')}</span>
            <Button variant="ghost" size="sm" onClick={recargar}>
              {t('error.retry')}
            </Button>
          </div>
        )}

        {isLoading && contactos.length === 0 ? (
          <div className="space-y-4 px-4 py-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                  {Array.from({ length: i === 0 ? 5 : 3 }).map((_, j) => (
                    <Skeleton key={j} className="h-[84px] rounded-xl" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : contactos.length === 0 && !error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <Users className="size-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">{t('empty.title')}</p>
            <p className="text-xs text-muted-foreground">{t('empty.body')}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => router.push('/dashboard')}>
              {t('empty.cta')}
            </Button>
          </div>
        ) : totalVisible === 0 && hayFiltros ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <p className="text-sm font-medium">{t('noResults.title')}</p>
            <Button variant="outline" size="sm" onClick={() => setParam({ q: null, tags: null })}>
              {t('noResults.cta')}
            </Button>
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="pb-8">
              {secciones.map((s) => (
                <SeccionEtapa
                  key={s.key}
                  seccion={s}
                  densidad={esMovil ? 'lista' : densidad}
                  plegada={plegadas.includes(s.key)}
                  onTogglePlegada={onTogglePlegada}
                  seleccionadoJid={seleccionadoJid}
                  onAbrirChat={onAbrirChat}
                  renderMenu={renderMenu}
                  arrastrable={puedeArrastrar}
                />
              ))}
            </div>
          </DragDropContext>
        )}
      </div>
    </div>
  );
}
