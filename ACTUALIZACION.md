# ACTUALIZACION - Despliegue de la versión actualizada en producción

Este documento describe **paso a paso** cómo instalar la versión actualizada de WhatSaaS en un servidor de producción y qué cambios incluye esta release.

---

## 1) Checklist previo

Antes de desplegar, confirma lo siguiente:

- Tener acceso SSH al servidor de producción.
- Tener respaldo de la base de datos y del archivo `.env` actual.
- Tener instalado en el servidor:
  - Node.js (versión compatible con Next.js 16)
  - `pnpm`
  - Servicio de base de datos PostgreSQL accesible por `DATABASE_URL`
- Confirmar variables de entorno de pagos:
  - `PAYMENT_PROVIDER`
  - Variables de Stripe (si aplica)
  - Variables de Mercado Pago (si aplica)

---

## 2) Procedimiento de actualización en producción

> Recomendado: ejecutar el despliegue en una ventana de mantenimiento corta.

### Paso 1: Entrar al servidor y al directorio del proyecto

```bash
ssh <usuario>@<servidor>
cd /ruta/a/whatsaas
```

### Paso 2: Respaldar estado actual

```bash
cp .env .env.backup.$(date +%Y%m%d-%H%M%S)
```

Si administras la base de datos localmente, realiza también backup SQL antes de continuar.

### Paso 3: Obtener la versión nueva del repositorio

```bash
git fetch --all --prune
git checkout <rama-de-produccion>
git pull --ff-only origin <rama-de-produccion>
```

### Paso 4: Instalar/actualizar dependencias

```bash
pnpm install --frozen-lockfile
```

### Paso 5: Validar configuración de entorno

Asegúrate de tener las variables necesarias para el proveedor de pago activo:

- `PAYMENT_PROVIDER=stripe` o `PAYMENT_PROVIDER=mercadopago` o `PAYMENT_PROVIDER=manual`
- Credenciales del proveedor elegido
- URLs públicas correctas para callbacks/webhooks

### Paso 6: Aplicar migraciones de base de datos (si existen nuevas)

```bash
pnpm db:migrate
```

### Paso 7: Construir la aplicación

```bash
pnpm build
```

### Paso 8: Reiniciar servicio de producción

Si usas `systemd` (ajusta el nombre del servicio):

```bash
sudo systemctl restart whatsaas
sudo systemctl status whatsaas --no-pager
```

Si usas PM2 (opcional):

```bash
pm2 restart whatsaas
pm2 status
```

### Paso 9: Verificación post-despliegue

- Ingresar al dashboard.
- Validar login y carga de equipos/proyectos.
- Validar flujo de pagos según `PAYMENT_PROVIDER` activo.
- Verificar que webhooks (si aplica) respondan `2xx`.
- Revisar logs por 10–15 minutos.

---

## 3) Rollback rápido (si hay incidente)

1. Volver al commit anterior estable:

```bash
git log --oneline -n 5
git checkout <commit_estable>
```

2. Restaurar `.env` previo (si fue modificado).
3. Reinstalar dependencias si cambió lockfile:

```bash
pnpm install --frozen-lockfile
```

4. Reiniciar servicio.

---

## 4) Changelog (release recientes)

## Release actual

### `feat(payments): add manual and mercadopago plugins configurable from admin`

- Se incorporó arquitectura de plugins para pagos.
- Se agregó soporte para **Manual Payment plugin**.
- Se agregó soporte para **Mercado Pago plugin**.
- Se habilitó configuración del proveedor de pago desde administración.
- Base para selección por variable de entorno `PAYMENT_PROVIDER`.

## Release anterior

### `docs: define payment plugin architecture and contributor skills`

- Se documentó la arquitectura objetivo de plugins para pagos.
- Se agregaron guías/skills de contribución para implementación incremental.

## Release inicial

### `Primera Version subida`

- Publicación inicial del proyecto.

---

## 5) Recomendaciones operativas

- Mantener `PAYMENT_PROVIDER` alineado con credenciales válidas en `.env`.
- No activar un proveedor en producción sin probar webhooks en staging.
- Registrar eventos de auditoría de cambios de estado de pago.
- Mantener despliegues con estrategia incremental para evitar downtime.
