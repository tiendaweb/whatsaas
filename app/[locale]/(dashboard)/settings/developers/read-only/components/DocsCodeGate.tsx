'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { KeyRound, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { unlockDocumentation } from '../actions';

export function DocsCodeGate({ configured }: { configured: boolean }) {
  const t = useTranslations('ReadOnlyApi');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!configured || !code.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await unlockDocumentation(code);
      if (!result.ok) {
        setError(t(result.error === 'invalid_code' ? 'invalid_code' : 'forbidden'));
        return;
      }
      setCode('');
      router.refresh();
    });
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-lg border-border bg-card">
        <CardHeader className="space-y-4">
          <div className="flex size-12 items-center justify-center rounded-xl border bg-muted text-primary">
            <LockKeyhole className="size-5" />
          </div>
          <div>
            <CardTitle className="text-2xl">{t('gate_title')}</CardTitle>
            <CardDescription className="mt-2 leading-6">{t('gate_description')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {!configured ? (
            <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p>{t('not_configured')}</p>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="readonly-docs-code">{t('access_code_label')}</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="readonly-docs-code"
                    type="password"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    className="h-12 pl-10 font-mono"
                    placeholder={t('access_code_placeholder')}
                    aria-invalid={Boolean(error)}
                  />
                </div>
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              </div>
              <Button className="h-11 w-full" disabled={pending || !code.trim()} type="submit">
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t('unlock_button')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
