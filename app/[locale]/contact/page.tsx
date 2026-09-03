'use client';

import Link from 'next/link';
import { ArrowLeft, Mail, MapPin, MessageSquare, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useActionState } from 'react';
import { sendContactMessage } from './actions';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useBranding } from '@/providers/branding-provider';
import { useTranslations } from 'next-intl';

export default function ContactPage() {
  const t = useTranslations('ContactPage');
  const { identity } = useBranding();

  const [state, formAction, isPending] = useActionState(sendContactMessage, {});

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <main className="min-h-screen bg-background">
      <div className="w-full h-full lg:grid lg:grid-cols-2">
        
        <div className="relative flex flex-col justify-center p-8 md:p-12 lg:p-20 bg-muted/30 border-r border-border min-h-[50vh] lg:min-h-screen">
          <Link href="/">
            <Button variant="ghost" className="absolute top-6 left-6 pl-0 hover:bg-transparent hover:text-primary">
              <ArrowLeft className="mr-2 h-4 w-4" /> {t('back_home')}
            </Button>
          </Link>

          <div className="max-w-md mx-auto lg:mx-0 mt-10 lg:mt-0">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              {t('title')}
            </h1>
            <p className="text-lg text-muted-foreground mb-12">
              {t('subtitle')}
            </p>

            <div className="space-y-8">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-background border border-border flex items-center justify-center shrink-0 shadow-sm">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{t('email_title')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{identity.supportEmail}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-background border border-border flex items-center justify-center shrink-0 shadow-sm">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{t('live_chat_title')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{t('live_chat_hours')}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-background border border-border flex items-center justify-center shrink-0 shadow-sm">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{t('office_title')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    456 University Ave.<br />
                    Palo Alto, CA 94301
                    </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center p-8 md:p-12 lg:p-20 bg-background">
          <Card className="w-full max-w-lg border-none shadow-none lg:border lg:shadow-sm">
            <CardContent className="p-0 lg:p-8">
              <div className="mb-8">
                <h2 className="text-2xl font-bold">{t('form_title')}</h2>
                <p className="text-muted-foreground text-sm mt-2">
                  {t('form_subtitle')}
                </p>
              </div>

              <form action={formAction} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t('first_name')}</Label>
                    <Input id="firstName" name="firstName" placeholder={t('first_name_placeholder')} required disabled={isPending} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t('last_name')}</Label>
                    <Input id="lastName" name="lastName" placeholder={t('last_name_placeholder')} required disabled={isPending} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t('email_label')}</Label>
                  <Input id="email" name="email" type="email" placeholder={t('email_placeholder')} required disabled={isPending} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">{t('subject')}</Label>
                  <Input id="subject" name="subject" placeholder={t('subject_placeholder')} required disabled={isPending} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">{t('message')}</Label>
                  <Textarea 
                    id="message"
                    name="message" 
                    placeholder={t('message_placeholder')} 
                    className="min-h-[150px] resize-none"
                    required
                    disabled={isPending}
                  />
                </div>

                <Button type="submit" className="w-full h-11" disabled={isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('sending')}
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" /> {t('send_message')}
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

      </div>
    </main>
  );
}
