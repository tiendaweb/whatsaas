import 'server-only';

import { resolve4, resolve6 } from 'node:dns/promises';
import { isIP } from 'node:net';

export const DOMAIN_VERIFICATION_PATH = '/api/reseller-domain-verification';

export type DomainVerificationResult =
  | { ok: true; addresses: string[] }
  | { ok: false; code: 'dns' | 'ingress' | 'proxy' | 'token'; message: string };

async function resolveAddresses(hostname: string): Promise<string[]> {
  const [ipv4, ipv6] = await Promise.all([
    resolve4(hostname).catch(() => []),
    resolve6(hostname).catch(() => []),
  ]);
  return [...new Set([...ipv4, ...ipv6])];
}

function configuredIngressAddresses(): string[] {
  return (process.env.RESELLER_INGRESS_IPS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => isIP(value) !== 0);
}

async function expectedIngressAddresses(): Promise<string[]> {
  const configured = configuredIngressAddresses();
  if (configured.length > 0) return configured;

  const baseUrl = process.env.BASE_URL || process.env.APP_URL;
  if (!baseUrl) return [];

  try {
    return resolveAddresses(new URL(baseUrl).hostname);
  } catch {
    return [];
  }
}

export async function verifyResellerDomain(input: {
  hostname: string;
  verificationToken: string;
}): Promise<DomainVerificationResult> {
  const [domainAddresses, ingressAddresses] = await Promise.all([
    resolveAddresses(input.hostname),
    expectedIngressAddresses(),
  ]);

  if (domainAddresses.length === 0) {
    return { ok: false, code: 'dns', message: 'El dominio no tiene registros A o AAAA públicos.' };
  }

  if (ingressAddresses.length === 0) {
    return {
      ok: false,
      code: 'ingress',
      message: 'No se pudo determinar el ingress. Configura RESELLER_INGRESS_IPS.',
    };
  }

  if (!domainAddresses.some((address) => ingressAddresses.includes(address))) {
    return {
      ok: false,
      code: 'ingress',
      message: `El DNS no apunta al ingress de WhatsPro. DNS actual: ${domainAddresses.join(', ')}.`,
    };
  }

  let response: Response;
  try {
    response = await fetch(`https://${input.hostname}${DOMAIN_VERIFICATION_PATH}`, {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(7000),
    });
  } catch {
    return {
      ok: false,
      code: 'proxy',
      message: 'El dominio apunta al ingress, pero HTTPS/Traefik todavía no llega a WhatsPro.',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: 'proxy',
      message: `La verificación HTTPS respondió ${response.status}; revisa Traefik y TLS.`,
    };
  }

  const payload = await response.json().catch(() => null) as { token?: string } | null;
  if (payload?.token !== input.verificationToken) {
    return {
      ok: false,
      code: 'token',
      message: 'El host responde, pero no pertenece a esta instalación de WhatsPro.',
    };
  }

  return { ok: true, addresses: domainAddresses };
}
