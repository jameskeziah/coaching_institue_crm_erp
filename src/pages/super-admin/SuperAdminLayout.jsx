import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  Banknote,
  Building2,
  ClipboardList,
  Headphones,
  LayoutDashboard,
  LogOut,
  PauseCircle,
  Shield,
  Timer,
  Users,
} from 'lucide-react';

import {
  getPlatformToken,
  getStoredPlatformAdmin,
  platformLogin,
  removePlatformToken,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const navItems = [
  { to: '/super-admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/super-admin/institutes', label: 'Institutes', icon: Building2 },
  { to: '/super-admin/trials', label: 'Active Trials', icon: Timer },
  { to: '/super-admin/paid-customers', label: 'Paid Customers', icon: Users },
  { to: '/super-admin/expired-trials', label: 'Expired Trials', icon: ClipboardList },
  { to: '/super-admin/suspended', label: 'Suspended', icon: PauseCircle },
  { to: '/super-admin/revenue', label: 'Revenue', icon: Banknote },
  { to: '/super-admin/usage', label: 'Usage', icon: Activity },
  { to: '/super-admin/support-access', label: 'Support Access', icon: Headphones },
  { to: '/super-admin/audit-logs', label: 'Audit Logs', icon: Shield },
];

function PlatformLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await platformLogin(email, password);
      window.location.reload();
    } catch (err) {
      setError(err.message || 'Platform login failed');
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
        <div className="mb-6">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-md bg-cyan-500 text-slate-950">
            <Shield className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-normal">Platform Admin</h1>
          <p className="mt-2 text-sm text-slate-400">Use a platform-admin account, not an institute user account.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-slate-800 bg-slate-900 p-5">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@example.com"
            className="bg-slate-950"
          />
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="bg-slate-950"
          />
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <Button type="submit" className="w-full">Sign in</Button>
        </form>
      </div>
    </main>
  );
}

export function StatCard({ label, value }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-normal">{value}</div>
    </div>
  );
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
}

export function SuperAdminLayout() {
  const navigate = useNavigate();
  const admin = getStoredPlatformAdmin();
  const token = getPlatformToken();

  if (!token || !admin) return <PlatformLogin />;

  function logout() {
    removePlatformToken();
    navigate('/super-admin');
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 w-64 border-r bg-card">
        <div className="flex h-16 items-center gap-3 border-b px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan-500 text-slate-950">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">Platform Admin</div>
            <div className="text-xs text-muted-foreground">{admin.role}</div>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t p-3">
          <Button variant="outline" className="w-full justify-start gap-2" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="ml-64 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}

export default SuperAdminLayout;
