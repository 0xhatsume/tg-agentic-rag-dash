'use client';

import { NavLinks } from '@/components/nav-links';
import { AuthButton } from '@/components/auth-button';

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-8">
          <h1 className="text-2xl font-bold text-primary">Crypto Analytics</h1>
          <NavLinks />
        </div>
        <AuthButton />
      </header>
      <div className="bg-white rounded-lg p-6 shadow-sm border border-secondary/20">
        <p className="text-secondary">Analytics dashboard coming soon...</p>
      </div>
    </div>
  );
} 