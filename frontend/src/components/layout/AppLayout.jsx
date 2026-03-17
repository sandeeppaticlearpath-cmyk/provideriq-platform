'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, Briefcase, FileText, BarChart3,
  Settings, Search, Bell, ChevronRight, LogOut, Zap,
  Database, MessageSquare, Menu, X, Building2, TrendingUp,
  ChevronDown, User
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Overview & metrics',
  },
  {
    label: 'Providers',
    href: '/providers',
    icon: Database,
    description: 'Global provider database',
    badge: 'NEW',
  },
  {
    label: 'Candidates',
    href: '/candidates',
    icon: Users,
    description: 'Candidate pipeline',
  },
  {
    label: 'Jobs',
    href: '/jobs',
    icon: Briefcase,
    description: 'Open positions',
  },
  {
    label: 'Submissions',
    href: '/submissions',
    icon: FileText,
    description: 'Candidate submissions',
  },
  {
    label: 'Communications',
    href: '/communications',
    icon: MessageSquare,
    description: 'Calls, emails & SMS',
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    description: 'Reports & insights',
  },
];

const ADMIN_ITEMS = [
  { label: 'Admin', href: '/admin', icon: Settings },
];

export default function AppLayout({ children }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationCount] = useState(3);

  return (
    <div className="flex h-screen bg-slate-25 overflow-hidden">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 256 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          'relative flex flex-col bg-white border-r border-slate-100',
          'shadow-[1px_0_0_0_#f1f5f9] z-50 overflow-hidden',
          'fixed inset-y-0 left-0 lg:relative',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          'transition-transform lg:transition-none duration-300'
        )}
      >
        {/* Logo Area */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-100 flex-shrink-0">
          <AnimatePresence mode="wait">
            {!collapsed ? (
              <motion.div
                key="full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2.5"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-sm">
                  <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <span className="font-semibold text-slate-900 text-[15px] tracking-tight">ProviderIQ</span>
                  <span className="block text-[10px] text-slate-400 font-medium tracking-wider uppercase -mt-0.5">
                    {user?.org?.name || 'Platform'}
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="icon"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-sm mx-auto"
              >
                <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex w-7 h-7 items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors ml-auto"
          >
            <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronRight className="w-4 h-4" />
            </motion.div>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 overflow-y-auto overflow-x-hidden scrollbar-thin">
          {/* Main Nav */}
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <NavItem
                  key={item.href}
                  item={item}
                  isActive={isActive}
                  collapsed={collapsed}
                  onClick={() => setMobileOpen(false)}
                />
              );
            })}
          </div>

          {/* Divider */}
          <div className="my-4 px-2">
            <div className="h-px bg-slate-100" />
          </div>

          {/* AI Assistant */}
          <Link
            href="/ai-assistant"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group',
              pathname === '/ai-assistant'
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            )}
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-brand-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Zap className="w-4 h-4 text-white" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">AI Assistant</p>
                <p className="text-xs text-slate-400 truncate">Recruiting intelligence</p>
              </div>
            )}
          </Link>

          {/* Admin */}
          {['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER'].includes(user?.role) && (
            <div className="mt-2 space-y-0.5">
              {ADMIN_ITEMS.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  isActive={pathname.startsWith(item.href)}
                  collapsed={collapsed}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </div>
          )}
        </nav>

        {/* User Profile */}
        <div className="p-2 border-t border-slate-100 flex-shrink-0">
          <div className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors group'
          )}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-white text-xs font-semibold">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </span>
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-slate-400 truncate capitalize">
                    {user?.role?.replace('_', ' ').toLowerCase()}
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="flex items-center h-16 px-6 bg-white border-b border-slate-100 flex-shrink-0 z-30">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden mr-3 p-2 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Global Search */}
          <div className="flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search providers, candidates, jobs..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl 
                  focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300
                  placeholder:text-slate-400 transition-all"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-white border border-slate-200 rounded">
                ⌘K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Notifications */}
            <button className="relative p-2 rounded-xl hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors">
              <Bell className="w-5 h-5" />
              {notificationCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full" />
              )}
            </button>

            {/* Org Badge */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-brand-50 rounded-xl border border-brand-100">
              <Building2 className="w-3.5 h-3.5 text-brand-500" />
              <span className="text-xs font-medium text-brand-700 truncate max-w-[120px]">
                {user?.org?.name}
              </span>
              <span className="text-[10px] text-brand-400 uppercase tracking-wider border border-brand-200 px-1.5 py-0.5 rounded-md font-medium">
                {user?.org?.plan}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="h-full"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function NavItem({ item, isActive, collapsed, onClick }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group relative',
        isActive
          ? 'bg-brand-50 text-brand-700'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
      )}
    >
      {isActive && (
        <motion.div
          layoutId="nav-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-500 rounded-full -translate-x-2"
        />
      )}
      <Icon className={cn(
        'w-[18px] h-[18px] flex-shrink-0 transition-colors',
        isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'
      )} />
      {!collapsed && (
        <span className={cn(
          'text-sm font-medium truncate flex-1',
          isActive ? 'text-brand-700' : ''
        )}>
          {item.label}
        </span>
      )}
      {!collapsed && item.badge && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-brand-500 text-white rounded-full">
          {item.badge}
        </span>
      )}
    </Link>
  );
}
