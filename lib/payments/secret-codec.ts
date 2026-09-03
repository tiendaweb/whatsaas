import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const PREFIX = 'enc:v1:';

function encryptionKey(): Buffer {
  const source = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!source) throw new Error('Falta PAYMENT_CONFIG_ENCRYPTION_KEY (o AUTH_SECRET).');
  return createHash('sha256').update(source).digest();
}

export function encryptPaymentSecret(value: string): string {
  if (!value || value.startsWith(PREFIX)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptPaymentSecret(value: string | undefined): string | undefined {
  if (!value || !value.startsWith(PREFIX)) return value;
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Credencial de pago cifrada con formato inválido.');
  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function encryptProviderConfig(
  provider: string,
  config: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const secretKeys = provider === 'stripe'
    ? new Set(['secretKey', 'webhookSecret'])
    : provider === 'mercadopago'
      ? new Set(['accessToken', 'webhookSecret'])
      : provider === 'lemonsqueezy'
        ? new Set(['apiKey', 'webhookSecret'])
        : new Set<string>();
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [
    key,
    value && secretKeys.has(key) ? encryptPaymentSecret(value) : value,
  ]));
}

export function decryptProviderConfig<T extends Record<string, string | undefined>>(config: T): T {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, decryptPaymentSecret(value)]),
  ) as T;
}
