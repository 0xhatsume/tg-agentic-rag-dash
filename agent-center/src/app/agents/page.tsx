'use client';

import { NavLinks } from '@/components/nav-links';
import { AuthButton } from '@/components/auth-button';
import { MobileNav } from '@/components/mobile-nav';

export default function AgentsPage() {
  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-8">
      <header className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6 md:mb-8">
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-4">
            <MobileNav />
            <h1 className="text-2xl font-bold text-primary">AI Agents</h1>
          </div>
          <div className="md:hidden">
            <AuthButton />
          </div>
        </div>
        <div className="hidden md:flex items-center gap-8 w-full md:w-auto">
          <NavLinks />
          <AuthButton />
        </div>
      </header>
      <main className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-secondary/20">
          <p className="text-secondary">Agent chat interface coming soon...</p>
        </div>
      </main>
    </div>
  );
} 