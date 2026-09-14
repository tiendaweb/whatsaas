# Desplegar WhatsPro en otro dominio

Todo lo que hace falta para levantar el sistema completo —con las funciones que
hoy tiene whatspro.uno— en un dominio nuevo.

Verificado el 2026-09-14 instalando la base desde cero: 125 migraciones, 186
tablas y cero columnas faltantes respecto de lo que el código espera.

---

## 1. Primero decidí cuál de las dos cosas necesitás

Son caminos muy distintos y conviene no equivocarse, porque el segundo cuesta un
servidor entero y el primero son diez minutos.

### A. Otro dominio sobre ESTA instalación (marca blanca)

El sistema ya resuelve el inquilino por el dominio con el que entra la visita
(`lib/tenant/resolve.ts` + tabla `reseller_domains`). Otro dominio con su propia
marca, su logo, sus precios y su landing **no necesita otra instalación**:
comparte base, aplicación y tareas automáticas.

Conviene cuando: le vendés la plataforma a alguien con su marca, o querés una
segunda puerta de entrada al mismo negocio.

Pasos:

1. **DNS**: un registro `A` del dominio nuevo a la IP de este servidor.
2. **Traefik**: agregar el dominio a la regla del router en `docker-compose.yml`
   (línea `traefik.http.routers.whatspro.rule`), sumando
   `` || Host(`elnuevo.com`) ``, y `docker compose up -d app`.
3. **Alta en el sistema**: `/admin/resellers` → dominios. El dominio queda en
   `pending` hasta que se verifica; sólo los `active` resuelven marca
   (`reseller_domains.status`).

Lo que **no** se puede con este camino: separar los datos. Todos los equipos
viven en la misma base. Si lo que buscás es una instalación independiente —otro
cliente, otro país, otro respaldo—, seguí con la opción B.

### B. Instalación nueva e independiente

Su propia base de datos, sus propias claves, su propio WhatsApp. Es el resto de
este documento.

---

## 2. Qué hace falta en el servidor

| Requisito | Por qué |
|---|---|
| Ubuntu/Debian con Docker y Docker Compose | la app y Postgres corren en contenedores |
| **8 GB de RAM como mínimo** | el build de Next se lleva ~6 GB; con menos, muere por falta de memoria |
| 20 GB de disco | repo, node_modules, imágenes y adjuntos |
| Node 20 + pnpm en el host | para instalar dependencias y compilar |
| PM2 en el host (`npm i -g pm2`) | las tareas periódicas |
| Traefik (o un proxy con TLS) | certificados y enrutado por dominio |
| Un dominio apuntando por DNS a la IP | Let's Encrypt valida por HTTP: si el DNS no resuelve, no hay certificado |

Si el servidor tiene 8 GB justos, compilá con el resto de las cosas apagadas: el
build es el único momento que pide memoria de verdad.

---

## 3. Paso a paso

### 3.1 Traer el código

```bash
git clone git@github.com:tiendaweb/whatsaas.git /root/whatsaas
cd /root/whatsaas
pnpm install
```

### 3.2 Las claves de la aplicación (`.env`)

```bash
cp .env.example .env
```

Lo que **no puede faltar**:

| Variable | Qué poner |
|---|---|
| `POSTGRES_URL` | `postgres://postgres:TUCLAVE@localhost:54322/postgres` |
| `BASE_URL` | `https://tudominio.com` — con https y sin barra final |
| `APP_URL` | `http://localhost:3000` — por acá entran las tareas automáticas |
| `AUTH_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `EVOLUTION_API_URL` | la URL de tu Evolution (paso 3.6) |
| `AUTHENTICATION_API_KEY` | la clave de esa Evolution |
| `NEXT_PUBLIC_WEBHOOK_URL` | `https://tudominio.com/api/webhook/evolution` |

`BASE_URL` y `NEXT_PUBLIC_WEBHOOK_URL` son las dos que más se olvidan y las dos
que más molestan después: la primera manda los enlaces que reciben los clientes
por correo y por WhatsApp, la segunda es la que le dice a Evolution a dónde
entregar los mensajes entrantes. Con cualquiera de las dos apuntando al dominio
viejo, el sistema "anda" pero los mensajes no llegan y los enlaces son ajenos.

### 3.3 La infraestructura (`deploy/.env`)

```bash
cd deploy
cp .env.deploy.example .env
```

Completá `APP_DOMAIN` y `POSTGRES_PASSWORD` (que tiene que coincidir con la de
`POSTGRES_URL`). Si en el mismo servidor ya corre otra instalación, cambiá
también `APP_CONTAINER`, `POSTGRES_CONTAINER`, `APP_HOST_PORT`,
`POSTGRES_HOST_PORT` y `TRAEFIK_ROUTER`: dos routers con el mismo nombre se
pisan dentro de Traefik y el segundo dominio queda sirviendo el primero.

```bash
docker compose up -d postgres    # la base primero: las migraciones la necesitan
```

### 3.4 La base de datos

```bash
cd /root/whatsaas
node scripts/instalar.mjs --admin=vos@tudominio.com --password=UnaClaveLarga --equipo="Tu Empresa"
```

Aplica las 125 migraciones en orden y deja creado el primer usuario
administrador con su equipo. Es idempotente: si lo volvés a correr no repite
nada, y si una migración falla las anteriores quedan aplicadas y el reintento
sigue donde se cortó.

> **No uses `drizzle-kit migrate`.** El `meta/_journal.json` del repo está
> desincronizado desde hace tiempo: 16 migraciones existen como archivo y nunca
> se registraron. drizzle-kit las saltearía y la instalación quedaría sin tablas
> y sin columnas que el código da por sentadas; el error no aparece al instalar
> sino después, como un 500 sin explicación en una pantalla cualquiera.

### 3.5 Compilar y levantar

```bash
NEXT_SKIP_TYPECHECK=1 pnpm run deploy:saasfy
```

Compila en una carpeta aparte, intercambia el bundle de forma atómica, reinicia
el contenedor y verifica que responda. El chequeo de tipos se corre por separado
(`npx tsc --noEmit -p tsconfig.json`) porque hacerlo dentro del build se lleva
la memoria del servidor.

Si es la primera vez y el contenedor `app` todavía no existe:

```bash
cd deploy && docker compose up -d
```

### 3.6 WhatsApp (Evolution API)

Sin esto la aplicación funciona pero no manda ni recibe un solo mensaje: es el
puente con WhatsApp y se despliega **aparte**.

Podés reusar la Evolution que ya tenés (apuntando `EVOLUTION_API_URL` a ella) o
levantar una propia con su compose (`postgres` + `redis` + `evolution-api`,
detrás de un subdominio tipo `evolution.tudominio.com`). Después, desde la
aplicación: `/settings/connect` → crear la instancia y escanear el QR.

El webhook que Evolution llama es `https://tudominio.com/api/webhook/evolution`.
Tiene que ser alcanzable desde donde corra Evolution.

### 3.7 Las tareas automáticas

```bash
cd /root/whatsaas/deploy && ./crons.sh
pm2 startup    # y ejecutar la línea que imprime, para que sobrevivan al reinicio
```

Registra las once tareas: mensajes programados y notificaciones (cada minuto),
radar de respuestas y publicaciones (cada 2), audios y comentarios (cada 10),
clasificación (cada 15), sincronía con aapp.space (cada 12 h) y las tres
diarias. **Si no las registrás, nada automático ocurre**: la aplicación se ve
perfecta y no manda un solo recordatorio.

### 3.8 Verificar

```bash
curl -I https://tudominio.com/es                 # 200 o redirección esperada
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
pm2 list                                          # las once tareas registradas
docker logs <APP_CONTAINER> --tail 30             # sin errores de arranque
```

Y entrando: iniciar sesión con el administrador del paso 3.4.

---

## 4. Lo que se configura después, desde la interfaz

Nada de esto va en archivos: vive en la base y se carga por pantalla.

| Qué | Dónde | Sin esto… |
|---|---|---|
| Claves de Gemini (el banco de claves del equipo) | app IA → `/plugins/ia` | no funciona nada de IA: ni redacción, ni clasificación, ni audios |
| Instancia de WhatsApp (el QR) | `/settings/connect` | no hay mensajería |
| Apps (Empresa, Finanzas, Tareas, Membresías…) | `/admin/plugins` | las apps son opt-in por equipo: una instalación nueva arranca con casi todo apagado |
| Marca, logo y colores | `/admin/branding` | todo sale con la marca por defecto |
| Correo saliente (Resend) | `.env` (`RESEND_API_KEY`) | no salen invitaciones ni recuperación de contraseña |
| Notificaciones push | `.env` (VAPID, `npx web-push generate-vapid-keys`) | no hay avisos en el navegador |

Las claves de Gemini se cargan por equipo a propósito: el sistema rota entre
varias y apaga por el día la que llega al tope, así que una sola clave en un
archivo no alcanzaría.

---

## 5. Trampas conocidas

- **El build se queda sin memoria.** Es lo primero que pasa en un servidor
  chico. Corré el chequeo de tipos aparte y compilá con
  `NEXT_SKIP_TYPECHECK=1`; si aun así muere, revisá que no haya procesos
  huérfanos de un build anterior comiendo RAM.
- **`drizzle-kit migrate` saltea migraciones.** Ver 3.4. Para agregar una
  migración nueva: escribí el `.sql`, registrala en `meta/_journal.json` y
  aplicala con `scripts/instalar.mjs`.
- **El dominio viejo queda pegado en los enlaces.** Si copiaste un `.env` de
  otra instalación, revisá `BASE_URL`, `APP_URL`, `NEXT_PUBLIC_WEBHOOK_URL` y
  `SITES_BASE_DOMAIN`.
- **Dos instalaciones en el mismo servidor.** Cambiá nombres de contenedor,
  puertos y `TRAEFIK_ROUTER`. Si dos routers se llaman igual, Traefik sirve una
  sola de las dos y no avisa.
- **El certificado no sale.** Casi siempre es el DNS: Let's Encrypt valida por
  HTTP y necesita que el dominio ya resuelva a la IP de este servidor.
- **Los sitios por subdominio** (`*.tudominio.com`) piden DNS y certificado
  comodín; el camino `/s/{slug}` funciona sin configurar nada.

---

## 6. Resumen para tener a mano

```bash
git clone git@github.com:tiendaweb/whatsaas.git /root/whatsaas && cd /root/whatsaas
pnpm install
cp .env.example .env                      # BASE_URL, AUTH_SECRET, CRON_SECRET, Evolution
cd deploy && cp .env.deploy.example .env  # APP_DOMAIN, POSTGRES_PASSWORD
docker compose up -d postgres
cd .. && node scripts/instalar.mjs --admin=vos@tudominio.com --password=UnaClaveLarga
NEXT_SKIP_TYPECHECK=1 pnpm run deploy:saasfy
cd deploy && ./crons.sh && pm2 startup
curl -I https://tudominio.com/es
```
