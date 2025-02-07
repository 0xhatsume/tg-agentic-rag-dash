import { Suspense } from "react";
import { AuthButton } from "@/components/auth-button";
import { NewsSection } from "@/components/news-section";
import { UserSettings } from "@/components/user-settings";

export default function Home() {
  return (
    <div className="min-h-screen p-8 bg-white">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-primary">Agent Center</h1>
        <AuthButton />
      </header>

      <main className="max-w-6xl mx-auto">
        <Suspense fallback={<div className="text-secondary">Loading...</div>}>
          <NewsSection />
        </Suspense>
        
        <Suspense fallback={<div className="text-secondary">Loading settings...</div>}>
          <UserSettings />
        </Suspense>
      </main>
    </div>
  );
}
