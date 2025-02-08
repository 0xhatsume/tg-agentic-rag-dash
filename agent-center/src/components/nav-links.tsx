'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LineChart, Brain, MessageSquareMore, Twitter, BookOpen, Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavLinksProps {
  mobile?: boolean;
}

export function NavLinks({ mobile }: NavLinksProps) {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/prices', label: 'Prices', icon: LineChart },
    { href: '/analytics', label: 'Analytics', icon: Brain },
    { href: '/agents', label: 'Agents', icon: MessageSquareMore },
    { href: '/tweets', label: 'Tweets', icon: Twitter },
    { href: '/diary', label: 'Diary', icon: BookOpen },
    { href: '/news', label: 'News', icon: Newspaper },
  ];

  return (
    <nav className={cn(
      mobile 
        ? "flex flex-col gap-2" 
        : "hidden md:flex gap-2 sm:gap-4 min-w-full sm:min-w-0"
    )}>
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md transition-colors",
            mobile ? "text-base" : "text-sm sm:text-base",
            pathname === href
              ? "bg-secondary/10 text-secondary"
              : "hover:bg-secondary/5 text-secondary/80"
          )}
        >
          <Icon className="h-4 w-4" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
} 