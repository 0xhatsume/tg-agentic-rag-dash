'use client';

import { Suspense } from "react";
import { AuthButton } from "@/components/auth-button";
import { NewsSection } from "@/components/news-section";
import { UserSettings } from "@/components/user-settings";
import Link from 'next/link';
import { LineChart, Brain, MessageSquareMore, Twitter, BookOpen, Newspaper } from 'lucide-react';
import { NavLinks } from '@/components/nav-links';
import { MobileNav } from '@/components/mobile-nav';

export default function Home() {
  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-white">
      <header className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6 md:mb-8">
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-4">
            <MobileNav />
            <h1 className="text-2xl font-bold text-primary">Agent Center</h1>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 mb-6 md:mb-8">
          <Link href="/prices" className="bg-white p-6 rounded-lg shadow-sm border border-secondary/20 hover:border-secondary/40 transition-colors">
            <div className="flex items-center space-x-3">
              <LineChart className="w-6 h-6 text-primary" />
              <h2 className="text-lg font-semibold text-primary">Prices</h2>
            </div>
            <p className="mt-2 text-secondary">View real-time price charts</p>
          </Link>

          <Link href="/analytics" className="bg-white p-6 rounded-lg shadow-sm border border-secondary/20 hover:border-secondary/40 transition-colors">
            <div className="flex items-center space-x-3">
              <Brain className="w-6 h-6 text-primary" />
              <h2 className="text-lg font-semibold text-primary">Analytics</h2>
            </div>
            <p className="mt-2 text-secondary">Explore crypto analytics</p>
          </Link>

          <Link href="/agents" className="bg-white p-6 rounded-lg shadow-sm border border-secondary/20 hover:border-secondary/40 transition-colors">
            <div className="flex items-center space-x-3">
              <MessageSquareMore className="w-6 h-6 text-primary" />
              <h2 className="text-lg font-semibold text-primary">Agents</h2>
            </div>
            <p className="mt-2 text-secondary">Chat with AI agents</p>
          </Link>

          <Link href="/tweets" className="bg-white p-6 rounded-lg shadow-sm border border-secondary/20 hover:border-secondary/40 transition-colors">
            <div className="flex items-center space-x-3">
              <Twitter className="w-6 h-6 text-primary" />
              <h2 className="text-lg font-semibold text-primary">Tweets</h2>
            </div>
            <p className="mt-2 text-secondary">Monitor crypto tweets</p>
          </Link>

          <Link href="/diary" className="bg-white p-6 rounded-lg shadow-sm border border-secondary/20 hover:border-secondary/40 transition-colors">
            <div className="flex items-center space-x-3">
              <BookOpen className="w-6 h-6 text-primary" />
              <h2 className="text-lg font-semibold text-primary">Diary</h2>
            </div>
            <p className="mt-2 text-secondary">Track important events</p>
          </Link>

          <Link href="/news" className="bg-white p-6 rounded-lg shadow-sm border border-secondary/20 hover:border-secondary/40 transition-colors">
            <div className="flex items-center space-x-3">
              <Newspaper className="w-6 h-6 text-primary" />
              <h2 className="text-lg font-semibold text-primary">News</h2>
            </div>
            <p className="mt-2 text-secondary">Your personalized news feed</p>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          <Suspense fallback={<div className="text-secondary">Loading news...</div>}>
            <NewsSection />
          </Suspense>
          <Suspense fallback={<div className="text-secondary">Loading settings...</div>}>
            <UserSettings />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
