'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle,
  Info,
  KeyRound,
  ListChecks,
  Loader2,
  Pause,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { MODELO_GEMINI_POR_DEFECTO } from '@/lib/gemini/models';

/* ---- Tipos --------------------------------------------------------- */

type KeyRow = {
  id: number;
  label: string;
  status: string;
  model: string;
  limitRpm: number;
  limitRpd: number;
  notes: string;
  hint: string;
  lastUsedAt: string | null;
  lastError: string;
  lastErrorAt: string | null;
  usoHoy: number;
  erroresHoy: number;
  erroresDeCuotaHoy: number;
  segundosAudioHoy: number;
  usoMinuto: number;
  disponibleHoy: number;
  porcentajeUsado: number;
};

type Respuesta = {
  keys: KeyRow[];
  capacidad: { keys: number; activas: number; restanteHoy: number; totalDiario: number; porMinuto: number };
  cola: {
    en_cola: number;
    minutos_en_cola: number;
    transcriptos: number;
    fallidos: number;
  };
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/** Verde mientras sobra, ámbar cuando queda poco, rojo cuando se acabó. */
function tonoDeBarra(porcentaje: number) {
  if (porcentaje >= 90) return 'bg-red-500';
  if (porcentaje >= 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function formatearMinutos(segundos: number) {
  if (segundos < 60) return `${segundos}s`;
  return `${Math.round((segundos / 60) * 10) / 10} min`;
}

/* ---- Formulario ----------------------------------------------------- */

type FormState = {
  label: string;
  apiKey: string;
  model: string;
  limitRpm: string;
  limitRpd: string;
  notes: string;
};

const FORM_VACIO: FormState = {
  label: '',
  apiKey: '',
  model: MODELO_GEMINI_POR_DEFECTO,
  limitRpm: '10',
  limitRpd: '20',
  notes: '',
};

export function GeminiKeysDashboard() {
  const { data, isLoading, mutate } = useSWR<Respuesta>('/api/plugins/gemini/keys', fetcher, {
    refreshInterval: 30000,
  });
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const keys = data?.keys ?? [];
  const capacidad = data?.capacidad;
  const cola = data?.cola;

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      const respuesta = await fetch('/api/plugins/gemini/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: form.label,
          apiKey: form.apiKey,
          model: form.model,
          limitRpm: Number(form.limitRpm) || 10,
          limitRpd: Number(form.limitRpd) || 250,
          notes: form.notes,
        }),
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) {
        setError(cuerpo.error ?? 'No se pudo guardar la API key.');
        return;
      }
      setForm(FORM_VACIO);
      setAbierto(false);
      mutate();
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(key: KeyRow) {
    await fetch(`/api/plugins/gemini/keys/${key.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: key.status === 'active' ? 'disabled' : 'active' }),
    });
    mutate();
  }

  async function borrar(key: KeyRow) {
    if (!window.confirm(`¿Borrar la API key "${key.label}"? El consumo registrado se pierde con ella.`)) return;
    await fetch(`/api/plugins/gemini/keys/${key.id}`, { method: 'DELETE' });
    mutate();
  }

  return (
    <div className="h-full space-y-6 overflow-y-auto p-4 md:p-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Sparkles className="h-6 w-6 text-primary" />
            Gemini
          </h1>
          <p className="text-sm text-muted-foreground">
            Banco de API keys para transcribir los audios de WhatsApp. Se usan al azar entre las que tengan cuota libre.
          </p>
        </div>
        <Button onClick={() => setAbierto(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar API key
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">API keys activas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {capacidad ? `${capacidad.activas} / ${capacidad.keys}` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disponible hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{capacidad ? capacidad.restanteHoy : '—'}</p>
            <p className="text-xs text-muted-foreground">
              de {capacidad?.totalDiario ?? 0} audios · {capacidad?.porMinuto ?? 0} por minuto
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">En cola</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{cola?.en_cola ?? 0}</p>
            <p className="text-xs text-muted-foreground">{cola?.minutos_en_cola ?? 0} min de audio esperando</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Transcriptos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{cola?.transcriptos ?? 0}</p>
            {(cola?.fallidos ?? 0) > 0 && (
              <p className="text-xs text-red-500">{cola?.fallidos} fallidos</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* La advertencia va arriba y siempre: si la barra se lee como verdad
          absoluta, el día que la key se use desde otro lado nadie entiende por
          qué Google devuelve 429 con la barra a la mitad. */}
      <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-muted-foreground">
          Google no publica cuánta cuota gratuita queda: no existe forma de consultarla. Estas barras cuentan
          <strong className="text-foreground"> las llamadas que hacemos desde acá</strong>. Si usás la misma API key en otro lado,
          el consumo real va a ser mayor que el que muestra la barra.
        </p>
      </div>

      {/* Listado */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Cargando el banco…
        </div>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <KeyRound className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Todavía no hay ninguna API key</p>
              <p className="text-sm text-muted-foreground">
                Sin keys en el banco, la cola de transcripción no avanza. Se sacan gratis en Google AI Studio.
              </p>
            </div>
            <Button onClick={() => setAbierto(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Agregar la primera
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <Card key={key.id} className={key.status === 'active' ? '' : 'opacity-60'}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{key.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{key.hint}</span>
                    <Badge variant={key.status === 'active' ? 'default' : 'secondary'}>
                      {key.status === 'active' ? 'Activa' : 'Pausada'}
                    </Badge>
                    <Badge variant="outline">{key.model}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => cambiarEstado(key)}>
                      {key.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => borrar(key)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                {/* Barra del día */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Uso de hoy</span>
                    <span className="font-medium">
                      {key.usoHoy} / {key.limitRpd} · quedan {key.disponibleHoy}
                    </span>
                  </div>
                  <Progress
                    value={key.porcentajeUsado}
                    className="h-2"
                    indicatorClassName={tonoDeBarra(key.porcentajeUsado)}
                  />
                </div>

                {/* Barra del minuto: es el límite que frena la cola en caliente */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Este minuto</span>
                    <span className="font-medium">{key.usoMinuto} / {key.limitRpm}</span>
                  </div>
                  <Progress
                    value={key.limitRpm > 0 ? Math.min(100, (key.usoMinuto / key.limitRpm) * 100) : 0}
                    className="h-1.5"
                    indicatorClassName={tonoDeBarra(key.limitRpm > 0 ? (key.usoMinuto / key.limitRpm) * 100 : 0)}
                  />
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{formatearMinutos(key.segundosAudioHoy)} de audio hoy</span>
                  {key.erroresHoy > 0 && <span className="text-red-500">{key.erroresHoy} errores</span>}
                  {key.erroresDeCuotaHoy > 0 && (
                    <span className="text-amber-600">{key.erroresDeCuotaHoy} rechazos por cuota</span>
                  )}
                  {key.lastUsedAt && <span>Última vez: {new Date(key.lastUsedAt).toLocaleString()}</span>}
                </div>

                {key.lastError && (
                  <div className="flex gap-2 rounded-md bg-red-500/10 p-2 text-xs text-red-600">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="line-clamp-2">{key.lastError}</span>
                  </div>
                )}

                {key.notes && <p className="text-xs text-muted-foreground">{key.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Cómo se usa */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" />
            Cómo se usan estas keys
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Los audios entrantes de WhatsApp entran a una cola y se transcriben de a poco, eligiendo cada vez una key
            al azar entre las que tengan cuota libre. Si una devuelve 429, se reintenta con otra.
          </p>
          <p>
            Claude y ChatGPT pueden encolar audios por el conector con <code className="text-foreground">whatspro_audio_queue_add</code>,
            ver el avance con <code className="text-foreground">whatspro_audio_queue_status</code> y pedir el análisis
            (resumen, intención, urgencia) audio por audio con <code className="text-foreground">whatspro_audio_analyze</code>.
          </p>
          <p>
            Este banco es independiente de <strong className="text-foreground">Ajustes → Agente IA</strong>, que sigue siendo
            la configuración del chat.
          </p>
        </CardContent>
      </Card>

      {/* Alta */}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar API key de Gemini</DialogTitle>
            <DialogDescription>
              Se guarda cifrada y no se vuelve a mostrar: sólo vas a ver los últimos cuatro caracteres.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="label">Nombre</Label>
              <Input
                id="label"
                placeholder="Cuenta personal, cuenta del estudio…"
                value={form.label}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apiKey">API key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="AIza…"
                value={form.apiKey}
                onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">Modelo</Label>
              <Input
                id="model"
                value={form.model}
                onChange={(event) => setForm({ ...form, model: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rpm">Límite por minuto</Label>
                <Input
                  id="rpm"
                  inputMode="numeric"
                  value={form.limitRpm}
                  onChange={(event) => setForm({ ...form, limitRpm: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rpd">Límite por día</Label>
                <Input
                  id="rpd"
                  inputMode="numeric"
                  value={form.limitRpd}
                  onChange={(event) => setForm({ ...form, limitRpd: event.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              El free tier de <code>{MODELO_GEMINI_POR_DEFECTO}</code> da <strong className="text-foreground">20 requests por día</strong> por
              cuenta y por modelo (verificado contra la respuesta de Google). Otros modelos tienen otros topes, y Google los cambia
              sin aviso: si el número acá no coincide con el real, las barras mienten.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                rows={2}
                placeholder="De qué cuenta es, para acordarte."
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando || !form.label.trim() || !form.apiKey.trim()}>
              {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
