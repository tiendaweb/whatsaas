'use client';

import Image from 'next/image';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { Branding, BrandingTheme } from '@/lib/db/schema';
import { updateResellerBranding } from '../reseller-actions';

// Mismo formato que acepta buildThemeCss; si no valida ahí, el color se descarta.
const COLOR = /^(#[0-9a-fA-F]{3,8}|(oklch|rgb|rgba|hsl|hsla)\([0-9a-zA-Z.,%\s/-]+\))$/;

const schema = z.object({
  name: z.string().min(2, { message: 'El nombre debe tener al menos 2 caracteres.' }),
  primaryLight: z
    .string()
    .refine((value) => !value || COLOR.test(value.trim()), {
      message: 'Usa un color válido: #2563eb, rgb(...) u oklch(...).',
    }),
  primaryDark: z
    .string()
    .refine((value) => !value || COLOR.test(value.trim()), {
      message: 'Usa un color válido: #2563eb, rgb(...) u oklch(...).',
    }),
  logo: z.any(),
  favicon: z.any(),
});

type FormValues = z.infer<typeof schema>;

export function ResellerBrandingForm({
  branding,
  fallbackName,
}: {
  branding: Branding | null;
  fallbackName: string;
}) {
  const theme = (branding?.theme ?? {}) as BrandingTheme;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: branding?.name || fallbackName,
      primaryLight: theme.light?.primary ?? '',
      primaryDark: theme.dark?.primary ?? '',
      logo: null,
      favicon: null,
    },
  });

  async function onSubmit(data: FormValues) {
    const formData = new FormData();
    formData.append('name', data.name);
    formData.append('primaryLight', data.primaryLight ?? '');
    formData.append('primaryDark', data.primaryDark ?? '');
    if (data.logo?.[0]) formData.append('logo', data.logo[0]);
    if (data.favicon?.[0]) formData.append('favicon', data.favicon[0]);

    const result = await updateResellerBranding(formData);

    if (result.success) {
      toast.success('Marca actualizada', {
        description: 'Tus clientes ya la verán aplicada.',
      });
    } else {
      toast.error('Error', { description: result.message });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre de tu marca</FormLabel>
              <FormControl>
                <Input placeholder="ChatPro" {...field} />
              </FormControl>
              <FormDescription>
                Reemplaza el nombre de la plataforma en toda la aplicación.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="primaryLight"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color principal (modo claro)</FormLabel>
                <FormControl>
                  <Input placeholder="#2563eb" {...field} />
                </FormControl>
                <FormDescription>Botones, enlaces y acentos.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="primaryDark"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color principal (modo oscuro)</FormLabel>
                <FormControl>
                  <Input placeholder="#60a5fa" {...field} />
                </FormControl>
                <FormDescription>Suele ser una versión más clara.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="logo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Logo</FormLabel>
              {branding?.logoUrl ? (
                <div className="my-4">
                  <Image
                    src={branding.logoUrl}
                    alt="Logo actual"
                    width={100}
                    height={100}
                    className="rounded-md"
                  />
                </div>
              ) : null}
              <FormControl>
                <Input type="file" onChange={(e) => field.onChange(e.target.files)} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="favicon"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Favicon</FormLabel>
              {branding?.faviconUrl ? (
                <div className="my-4">
                  <Image
                    src={branding.faviconUrl}
                    alt="Favicon actual"
                    width={32}
                    height={32}
                    className="rounded-md"
                  />
                </div>
              ) : null}
              <FormControl>
                <Input type="file" onChange={(e) => field.onChange(e.target.files)} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Guardando...' : 'Actualizar marca'}
        </Button>
      </form>
    </Form>
  );
}
