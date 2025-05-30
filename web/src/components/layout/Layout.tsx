'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';

interface LayoutProps {
  children: React.ReactNode;
  fullWidth?: boolean;
}

export default function Layout({ children, fullWidth = false }: LayoutProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header activePath={pathname} />
      <main className={`py-6 ${fullWidth ? 'px-4' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}`}>
        {children}
      </main>
    </div>
  );
} 