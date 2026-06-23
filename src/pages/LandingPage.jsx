import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeIndianRupee,
  BarChart3,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Headphones,
  MessageSquare,
  MonitorCog,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { onboardInstitute } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const modules = [
  {
    icon: Users,
    title: 'Admissions CRM',
    copy: 'Track leads, counsellor follow-ups, missed calls, parent meetings, and conversion.',
    image: '/images/admissions-crm-counselling.png',
    alt: 'Counsellor managing student admission leads in ProTrack Kaizen CRM',
  },
  {
    icon: BadgeIndianRupee,
    title: 'Fees and Expenses',
    copy: 'Run receipts, discounts, pending dues, UPI-style payments, vendors, and cash flow.',
    image: '/images/fees-expenses-dashboard.png',
    alt: 'Institute fee collection and expense dashboard',
  },
  {
    icon: CalendarCheck,
    title: 'Attendance',
    copy: 'Mark students and staff, send absence alerts, approve corrections, and review reports.',
    image: '/images/digital-attendance-classroom.png',
    alt: 'Teacher marking student attendance digitally',
  },
  {
    icon: GraduationCap,
    title: 'Academics',
    copy: 'Plan lectures, homework, tests, remedial batches, student progress, and teacher performance.',
    image: '/images/academics-performance-dashboard.png',
    alt: 'Academic planning and student performance dashboard',
  },
];

const proofPoints = [
  'Built for coaching institutes, tuition centers, NEET/JEE academies, and AI labs',
  'Designed around Indian fee collection, parent communication, and branch operations',
  'Includes tenant onboarding, trial subscriptions, support access, and platform admin control',
];

const operations = [
  { icon: ClipboardList, label: 'Lead follow-up queues' },
  { icon: MessageSquare, label: 'Parent communication' },
  { icon: BarChart3, label: 'Daily owner dashboard' },
  { icon: Building2, label: 'Multi-branch control' },
];

export default function LandingPage() {
  const [form, setForm] = useState({
    instituteName: '',
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
    branchName: 'Main Branch',
    city: '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submitOnboarding(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const result = await onboardInstitute(form);
      setMessage(`${result.data.tenant.name} is ready. Verify the owner email, then sign in.`);
      setForm({
        instituteName: '',
        ownerName: '',
        ownerEmail: '',
        ownerPassword: '',
        branchName: 'Main Branch',
        city: '',
      });
    } catch (err) {
      setError(err.message || err.error || 'Could not start institute trial');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7faf6] text-slate-950">
      <section className="relative overflow-hidden border-b border-slate-200 bg-[#edf6f1]">
        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-950 text-sm font-semibold text-white">
              PK
            </div>
            <div>
              <div className="font-semibold">ProTrack Kaizen</div>
              <div className="text-xs text-slate-600">Institute OS</div>
            </div>
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/super-admin">Platform admin</Link>
            </Button>
            <Button asChild>
              <Link to="/dashboard">Institute login</Link>
            </Button>
          </nav>
        </header>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-10 lg:grid-cols-[minmax(0,0.88fr)_minmax(460px,1.12fr)] lg:items-center">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-teal-200 bg-white/80 px-3 py-1 text-sm text-slate-700 shadow-sm backdrop-blur">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Subscription-ready operating system for Indian institutes
            </div>
            <h1 className="text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl lg:text-6xl">
              ProTrack Kaizen
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
              Run admissions, students, fees, attendance, academics, tests, staff performance, parent
              communication, and SaaS tenant control from one serious institute operations platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <a href="#start-trial">
                  Start institute trial
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/dashboard">Open product</Link>
              </Button>
            </div>
            <div className="mt-8 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
              {operations.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-2 rounded-md border border-white bg-white/70 px-3 py-2 shadow-sm">
                    <Icon className="h-4 w-4 text-teal-700" />
                    {item.label}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative">
            <img
              src="/images/hero-institute-os-dashboard.png"
              alt="ProTrack Kaizen institute operations dashboard on a laptop"
              className="aspect-[16/9] w-full rounded-md border border-white object-cover shadow-2xl"
            />
            <div className="absolute -bottom-5 left-5 max-w-xs rounded-md border bg-white p-4 shadow-xl">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-teal-600" />
                <div>
                  <div className="text-sm font-medium">Tenant-ready SaaS</div>
                  <div className="text-xs text-slate-500">Trials, billing, usage, support access</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 py-8 lg:grid-cols-3">
          {proofPoints.map((point) => (
            <div key={point} className="flex gap-3 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              {point}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14">
        <div className="mb-8 max-w-3xl">
          <h2 className="text-3xl font-semibold tracking-normal">Core operating modules</h2>
          <p className="mt-3 text-slate-600">
            Each module reflects a real institute workflow: counsellors converting leads, accountants collecting fees,
            teachers running classes, and owners reviewing performance.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <article key={module.title} className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                <img src={module.image} alt={module.alt} className="h-44 w-full object-cover" />
                <div className="p-5">
                  <Icon className="h-6 w-6 text-slate-800" />
                  <h3 className="mt-4 text-base font-semibold">{module.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{module.copy}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[0.96fr_1.04fr] lg:items-center">
          <img
            src="/images/admissions-crm-counselling.png"
            alt="Counsellor managing student admission leads in ProTrack Kaizen CRM"
            className="aspect-[16/10] w-full rounded-md border border-slate-200 object-cover shadow-lg"
          />
          <div>
            <div className="mb-3 text-sm font-medium text-teal-700">Admissions CRM</div>
            <h2 className="text-3xl font-semibold tracking-normal">Convert parent enquiries without losing follow-ups</h2>
            <p className="mt-4 leading-7 text-slate-600">
              Admissions teams can manage enquiry sources, counsellor ownership, parent meetings, missed follow-ups,
              conversion stages, and student handoff into the rest of the institute workflow.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {['Lead ownership', 'Parent meetings', 'Follow-up aging', 'Conversion reports'].map((item) => (
                <div key={item} className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">{item}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-14 lg:grid-cols-3">
        <article className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <img src="/images/fees-expenses-dashboard.png" alt="Institute fee collection and expense dashboard" className="mb-5 aspect-[16/10] w-full rounded-md object-cover" />
          <BadgeIndianRupee className="h-6 w-6 text-emerald-700" />
          <h2 className="mt-4 text-xl font-semibold">Fees, receipts, and cash control</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Pending dues, discounts, receipts, expenses, vendors, monthly reports, and collection visibility for owners.</p>
        </article>
        <article className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <img src="/images/digital-attendance-classroom.png" alt="Teacher marking student attendance digitally" className="mb-5 aspect-[16/10] w-full rounded-md object-cover" />
          <CalendarCheck className="h-6 w-6 text-blue-700" />
          <h2 className="mt-4 text-xl font-semibold">Attendance with parent alerts</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Daily class attendance, staff attendance, absent alerts, correction requests, and branch-level discipline reports.</p>
        </article>
        <article className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <img src="/images/academics-performance-dashboard.png" alt="Academic planning and student performance dashboard" className="mb-5 aspect-[16/10] w-full rounded-md object-cover" />
          <GraduationCap className="h-6 w-6 text-amber-700" />
          <h2 className="mt-4 text-xl font-semibold">Academic planning depth</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Lecture plans, homework, test calendars, remedial work, teacher impact, and student performance history.</p>
        </article>
      </section>

      <section className="border-y border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-sm text-teal-100">
              <MonitorCog className="h-4 w-4" />
              SaaS control plane
            </div>
            <h2 className="text-3xl font-semibold tracking-normal">Built to sell as a multi-tenant subscription product</h2>
            <p className="mt-4 leading-7 text-slate-300">
              Platform admins can view institutes, trials, paid customers, suspended tenants, usage, revenue,
              support access, and audit logs without becoming a tenant user.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {['Active trials', 'Paid customers', 'Monthly revenue', 'Audited support access'].map((item) => (
                <div key={item} className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">{item}</div>
              ))}
            </div>
            <Button asChild className="mt-7 bg-white text-slate-950 hover:bg-slate-100">
              <Link to="/super-admin">Open platform admin</Link>
            </Button>
          </div>
          <img
            src="/images/super-admin-saas-dashboard.png"
            alt="SaaS super admin dashboard for coaching institute tenants"
            className="aspect-[16/10] w-full rounded-md border border-white/10 object-cover shadow-2xl"
          />
        </div>
      </section>

      <section id="start-trial" className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
          <div>
            <img
              src="/images/tenant-onboarding-checklist.png"
              alt="Tenant onboarding checklist with setup steps"
              className="mb-6 aspect-[16/10] w-full rounded-md border border-slate-200 object-cover shadow-lg"
            />
            <h2 className="text-3xl font-semibold tracking-normal">Start a trial tenant</h2>
            <p className="mt-4 text-slate-600">
              Create a tenant, owner account, main branch, roles, starter fee plans, message templates,
              sample dashboard metrics, and first-login checklist in one onboarding flow.
            </p>
          </div>
          <form onSubmit={submitOnboarding} className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-5 md:grid-cols-2">
            <Input required placeholder="Institute name" value={form.instituteName} onChange={(e) => setForm({ ...form, instituteName: e.target.value })} />
            <Input required placeholder="Owner name" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
            <Input required type="email" placeholder="Owner email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
            <Input required type="password" placeholder="Strong password" value={form.ownerPassword} onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })} />
            <Input required placeholder="Branch name" value={form.branchName} onChange={(e) => setForm({ ...form, branchName: e.target.value })} />
            <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <div className="md:col-span-2">
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Creating tenant...' : 'Create trial tenant'}
              </Button>
              {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
              {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
            </div>
          </form>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-[#edf6f1]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-5 py-10 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">Ready to run your institute like a SaaS-grade operation?</h2>
            <p className="mt-2 text-slate-600">Start with a trial tenant, then add students, staff, fee plans, WhatsApp, and Razorpay.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <a href="#start-trial">Start trial</a>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">Open product</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
