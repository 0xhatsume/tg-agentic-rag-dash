import { Suspense } from "react";
import { AuthButton } from "@/components/auth-button";
import { NewsSection } from "@/components/news-section";
import { UserSettings } from "@/components/user-settings";
import Link from 'next/link';
import { LineChart, Brain, MessageSquareMore, Twitter } from 'lucide-react';
import { NavLinks } from '@/components/nav-links';

export default function Home() {
  return (
    <div className="min-h-screen p-8 bg-white">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-8">
          <h1 className="text-2xl font-bold text-primary">Agent Center</h1>
          <NavLinks />
        </div>
        <AuthButton />
      </header>

      <main className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Link href="/prices" className="bg-white p-6 rounded-lg shadow-sm border border-secondary/20 hover:border-secondary/40 transition-colors">
            <div className="flex items-center space-x-3">
              <LineChart className="w-6 h-6 text-primary" />
              <h2 className="text-lg font-semibold text-primary">Prices</h2>
            </div>
            <p className="mt-2 text-secondary">View real-time price charts and market data</p>
          </Link>

          <Link href="/analytics" className="bg-white p-6 rounded-lg shadow-sm border border-secondary/20 hover:border-secondary/40 transition-colors">
            <div className="flex items-center space-x-3">
              <Brain className="w-6 h-6 text-primary" />
              <h2 className="text-lg font-semibold text-primary">Analytics</h2>
            </div>
            <p className="mt-2 text-secondary">Explore crypto market analytics</p>
          </Link>

          <Link href="/agents" className="bg-white p-6 rounded-lg shadow-sm border border-secondary/20 hover:border-secondary/40 transition-colors">
            <div className="flex items-center space-x-3">
              <MessageSquareMore className="w-6 h-6 text-primary" />
              <h2 className="text-lg font-semibold text-primary">Agents</h2>
            </div>
            <p className="mt-2 text-secondary">Chat with AI trading agents</p>
          </Link>

          <Link href="/tweets" className="bg-white p-6 rounded-lg shadow-sm border border-secondary/20 hover:border-secondary/40 transition-colors">
            <div className="flex items-center space-x-3">
              <Twitter className="w-6 h-6 text-primary" />
              <h2 className="text-lg font-semibold text-primary">Tweets</h2>
            </div>
            <p className="mt-2 text-secondary">Monitor crypto-related tweets</p>
          </Link>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
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
