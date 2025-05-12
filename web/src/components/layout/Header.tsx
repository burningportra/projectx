'use client';

import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  activePath: string;
}

export default function Header({ activePath }: HeaderProps) {
  const navigation = [
    { name: 'Dashboard', href: '/' },
    { name: 'Strategies', href: '/strategies' },
    { name: 'Positions', href: '/positions' },
    { name: 'Trends', href: '/trends' },
    { name: 'Performance', href: '/performance' },
  ];

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">ProjectX Trading</h1>
            </div>
            <nav className="ml-6 flex space-x-8">
              {navigation.map((item) => (
                <Link 
                  key={item.name}
                  href={item.href} 
                  className={`${
                    activePath === item.href
                      ? 'border-indigo-500 text-gray-900 dark:text-white' 
                      : 'border-transparent text-gray-500 dark:text-gray-300 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="rounded-full">
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="sr-only">View notifications</span>
            </Button>
            <div className="ml-3 relative">
              <Button variant="ghost" size="icon" className="rounded-full p-0">
                <Avatar>
                  <AvatarFallback>KT</AvatarFallback>
                </Avatar>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
} 