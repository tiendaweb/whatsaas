'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { Menu, MessageCircle, Settings, X } from 'lucide-react';
import Logo from '@/components/interface/Logo';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type PublicHeaderUser = {
  email?: string | null;
  name?: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => (res.ok ? res.json() : null));

function PublicHeaderActions() {
  const { data: user } = useSWR<PublicHeaderUser | null>('/api/user', fetcher);

  if (!user?.email) {
    return (
      <>
        <Button asChild variant="ghost" className="rounded-full">
          <Link href="/sign-in">Ingresar</Link>
        </Button>
        <Button asChild className="rounded-full">
          <Link href="/sign-up">Crear cuenta</Link>
        </Button>
      </>
    );
  }

  const initials = (user.name || user.email || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <>
      <Button asChild variant="ghost" className="rounded-full">
        <Link href="/dashboard">Escritorio</Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Avatar className="size-9 border border-border">
              <AvatarImage alt={user.name || user.email || ''} />
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                {initials || 'U'}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href="/dashboard" className="flex items-center">
              <MessageCircle className="mr-2 h-4 w-4" />
              Escritorio
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings" className="flex items-center">
              <Settings className="mr-2 h-4 w-4" />
              Configuracion
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export function PublicHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center" aria-label="Inicio">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          <Link href="/#features" className="transition-colors hover:text-foreground">
            Funciones
          </Link>
          <Link href="/#pricing" className="transition-colors hover:text-foreground">
            Precios
          </Link>
          <Link href="/contact" className="transition-colors hover:text-foreground">
            Contacto
          </Link>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeSwitcher />
          <Suspense fallback={<div className="h-9 w-28 rounded-full bg-muted" />}>
            <PublicHeaderActions />
          </Suspense>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeSwitcher />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            aria-label={isMobileMenuOpen ? 'Cerrar menu' : 'Abrir menu'}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {isMobileMenuOpen ? (
        <div className="border-t border-border bg-background px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3 text-sm font-medium text-muted-foreground">
            <Link href="/#features" className="py-1 transition-colors hover:text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
              Funciones
            </Link>
            <Link href="/#pricing" className="py-1 transition-colors hover:text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
              Precios
            </Link>
            <Link href="/contact" className="py-1 transition-colors hover:text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
              Contacto
            </Link>
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            <Suspense fallback={<div className="h-9 rounded-full bg-muted" />}>
              <PublicHeaderActions />
            </Suspense>
          </div>
        </div>
      ) : null}
    </header>
  );
}
