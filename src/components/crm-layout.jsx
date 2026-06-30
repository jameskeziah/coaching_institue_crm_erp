import { NavLink, Outlet } from 'react-router-dom';
import {
  BookOpen,
  Bot,
  BarChart3,
  CalendarCheck,
  ChartNoAxesColumnIncreasing,
  ClipboardCheck,
  ListChecks,
  Cpu,
  GraduationCap,
  IndianRupee,
  LayoutDashboard,
  Menu,
  Receipt,
  Settings2,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react';

import AuthBar from '@/components/AuthBar';
import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/AuthContext';
import { roleLabels } from '@/rbac';

const navItems = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { title: 'Students', href: '/students', icon: Users, module: 'students' },
  { title: 'Admissions', href: '/admissions', icon: UserPlus, module: 'admissions' },
  { title: 'Fees', href: '/fees', icon: IndianRupee, module: 'fees', end: true },
  { title: 'Fee Structures', href: '/fees/structures', icon: Receipt, module: 'fees' },
  { title: 'Follow-ups', href: '/follow-ups', icon: ListChecks, module: 'followUps' },
  { title: 'Expenses', href: '/expenses', icon: Receipt, module: 'expenses' },
  { title: 'Reports', href: '/reports', icon: BarChart3, module: 'reports' },
  { title: 'Academic', href: '/academic', icon: BookOpen, module: 'academic' },
  { title: 'Batches', href: '/academic/batches', icon: Users, module: 'academicMasters' },
  { title: 'Branches', href: '/settings/branches', icon: Settings2, module: 'academicMasters' },
  { title: 'Courses', href: '/settings/courses', icon: BookOpen, module: 'academicMasters' },
  { title: 'Subjects', href: '/settings/subjects', icon: ClipboardCheck, module: 'academicMasters' },
  { title: 'WhatsApp Templates', href: '/settings/whatsapp/templates', icon: Bot, module: 'automation' },
  { title: 'WhatsApp History', href: '/settings/whatsapp/send-history', icon: ListChecks, module: 'automation' },
  { title: 'Parent Communication', href: '/communication/parents', icon: UserRound, module: 'students' },
  { title: 'AI Lab', href: '/ai-lab', icon: Cpu, module: 'aiLab' },
  { title: 'Tests', href: '/test-performance', icon: ClipboardCheck, module: 'tests' },
  { title: 'Attendance', href: '/attendance', icon: CalendarCheck, module: 'attendance' },
  { title: 'Attendance + ParentPulse', href: '/attendance/mobile', icon: CalendarCheck, module: 'attendance' },
  { title: 'Automation', href: '/automation', icon: Bot, module: 'automation' },
  { title: 'Teachers', href: '/teachers', icon: GraduationCap, module: 'teachers' },
  { title: 'TeacherScore', href: '/teacher-score', icon: ChartNoAxesColumnIncreasing, module: 'teacherPerformance' },
  { title: 'Parent Portal', href: '/parent-portal', icon: UserRound, module: 'parentPortal' },
  { title: 'Ontology', href: '/ontology', icon: Settings2, module: 'ontology' },
];

function SidebarContent() {
  const { canAccess } = useAuth();
  const navigation = navItems.filter((item) => canAccess(item.module));

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm">
            PK
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">ProTrack Kaizen</h1>
            <p className="text-xs text-muted-foreground">Institute CRM</p>
          </div>
        </div>
      </div>

      <Separator />

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/dashboard' || item.end}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  ].join(' ')
                }
              >
                <Icon className="h-4 w-4" />
                {item.title}
              </NavLink>
            );
          })}
        </nav>
      </ScrollArea>

      <Separator />

      <div className="p-4 text-xs text-muted-foreground">
        Miraku Education Foundation
      </div>
    </div>
  );
}

export function CRMLayout() {
  const { user, role } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-card/95 shadow-sm backdrop-blur lg:block">
        <SidebarContent />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 border-b bg-background/85 px-4 py-3 backdrop-blur-xl md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0 lg:hidden">
                  <Menu className="h-4 w-4" />
                  <span className="sr-only">Open navigation</span>
                </Button>
              </SheetTrigger>

              <SheetContent side="left" className="w-64 p-0">
                <SidebarContent />
              </SheetContent>
            </Sheet>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{user?.tenantName || 'Admin Dashboard'}</p>
                <Badge variant="secondary" className="hidden sm:inline-flex">{user?.subscriptionPlan || 'Live CRM'}</Badge>
              </div>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {user?.subscriptionStatus ? `Subscription ${user.subscriptionStatus}` : 'Manage students, fees, academics and staff performance'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ModeToggle />
            {user ? (
              <div className="hidden text-right md:block">
                <p className="text-sm font-medium">{user.username}</p>
                <p className="text-xs text-muted-foreground">{roleLabels[role] || roleLabels.user}</p>
              </div>
            ) : null}
            <AuthBar />
          </div>
        </header>

        <main className="mx-auto max-w-7xl p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
