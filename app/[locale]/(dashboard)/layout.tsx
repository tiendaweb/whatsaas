'use client';

import Link from 'next/link';
import { useState, Suspense, useEffect, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut, Settings, MessageCircle, Menu, X, ShieldAlert } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { signOut } from '@/app/[locale]/(login)/actions';
import { User } from '@/lib/db/schema';
import useSWR, { mutate } from 'swr';
import { Sidebar } from '@/components/interface/Sidebar';
import Logo from '@/components/interface/Logo';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { adminStopImpersonation } from '@/app/[locale]/(admin)/admin-actions';

const fetcher = (url: string) => fetch(url).then((res) => res.json());
type UserWithImpersonation = User & {
  impersonation?: {
    isImpersonating: boolean;
    impersonatorId: number | null;
  };
};

function UserMenu() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isStoppingImpersonation, startStopImpersonation] = useTransition();
  const { data: user } = useSWR<UserWithImpersonation>('/api/user', fetcher);
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    mutate('/api/user');
    router.push('/');
  }

  if (!user) {
    return (
      <>
        <Link
          href="/#pricing"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Pricing
        </Link>
        <Button asChild className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground">
          <Link href="/sign-up">Sign Up</Link>
        </Button>
      </>
    );
  }

  async function handleStopImpersonation() {
    startStopImpersonation(async () => {
      const result = await adminStopImpersonation();
      if (result.error) return;
      mutate('/api/user');
      mutate('/api/team');
      router.push('/admin/users');
      router.refresh();
    });
  }

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <DropdownMenuTrigger>
        <Avatar className="cursor-pointer size-9 border border-border">
          <AvatarImage alt={user.name || ''} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {user.email
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex flex-col gap-1 w-48">
        {user.impersonation?.isImpersonating && (
          <DropdownMenuItem className="cursor-pointer" onClick={handleStopImpersonation} disabled={isStoppingImpersonation}>
            <ShieldAlert className="mr-2 h-4 w-4" />
            <span>{isStoppingImpersonation ? 'Leaving...' : 'Stop impersonation'}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="cursor-pointer">
          <Link href="/dashboard" className="flex w-full items-center">
            <MessageCircle className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer">
          <Link href="/settings" className="flex w-full items-center">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <form action={handleSignOut} className="w-full">
          <button type="submit" className="flex w-full">
            <DropdownMenuItem className="w-full flex-1 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="border-b border-border bg-background sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center">
          <Logo />
        </Link>
        
        <div className="hidden md:flex items-center space-x-4">
          <ThemeSwitcher />
          <Suspense fallback={<div className="h-9 w-9 bg-muted rounded-full animate-pulse" />}>
            <UserMenu />
          </Suspense>
        </div>


        <div className="md:hidden flex items-center gap-4">
            <ThemeSwitcher />
            <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
        </div>
      </div>

      {isMobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background p-4 flex flex-col gap-4">
             <Suspense>
                <UserMenu />
             </Suspense>
          </div>
      )}
    </header>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isHomePage = pathname === '/' || /^\/[a-z]{2}$/.test(pathname);
  
  const { data: team } = useSWR('/api/team', fetcher);

  useEffect(() => {
    if (team && typeof team === 'object' && 'id' in team && !team.planId) {
      if (!isHomePage && !pathname.startsWith('/pricing')) {
        router.push('/pricing');
      }
    }
  }, [team, pathname, isHomePage, router]);

  if (isHomePage) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <main className="flex-1">
            {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-muted overflow-hidden">
      <Sidebar />
      <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
