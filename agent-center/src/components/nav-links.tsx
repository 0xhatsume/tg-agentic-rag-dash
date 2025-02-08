'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LineChart, Brain, MessageSquareMore, Twitter } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NavLinks() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/prices', label: 'Prices', icon: LineChart },
    { href: '/analytics', label: 'Analytics', icon: Brain },
    { href: '/agents', label: 'Agents', icon: MessageSquareMore },
    { href: '/tweets', label: 'Tweets', icon: Twitter },
  ];

  return (
    <nav className="flex gap-4">
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md transition-colors",
            pathname === href
              ? "bg-secondary/10 text-secondary"
              : "hover:bg-secondary/5 text-secondary/80"
          )}
        >
          <Icon className="w-4 h-4" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
} 