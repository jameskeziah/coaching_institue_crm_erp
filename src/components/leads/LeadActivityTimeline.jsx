import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  IndianRupee,
  MessageCircle,
  Phone,
  RefreshCcw,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';

const activityConfig = {
  CALL_NOTE: {
    label: 'Call',
    icon: Phone,
    className: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  WHATSAPP_NOTE: {
    label: 'WhatsApp',
    icon: MessageCircle,
    className: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  VISIT_NOTE: {
    label: 'Visit',
    icon: Users,
    className: 'text-violet-600 bg-violet-50 border-violet-200',
  },
  COUNSELLING_NOTE: {
    label: 'Counselling',
    icon: ClipboardCheck,
    className: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  },
  STATUS_CHANGE: {
    label: 'Status',
    icon: RefreshCcw,
    className: 'text-slate-700 bg-slate-50 border-slate-200',
  },
  DEMO_SCHEDULED: {
    label: 'Demo Scheduled',
    icon: CalendarCheck,
    className: 'text-amber-600 bg-amber-50 border-amber-200',
  },
  DEMO_COMPLETED: {
    label: 'Demo Completed',
    icon: CheckCircle2,
    className: 'text-green-600 bg-green-50 border-green-200',
  },
  FEE_DISCUSSED: {
    label: 'Fee Discussed',
    icon: IndianRupee,
    className: 'text-orange-600 bg-orange-50 border-orange-200',
  },
  FOLLOW_UP_CREATED: {
    label: 'Follow-up',
    icon: Clock,
    className: 'text-cyan-600 bg-cyan-50 border-cyan-200',
  },
  LEAD_CONVERTED: {
    label: 'Converted',
    icon: UserCheck,
    className: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  LEAD_LOST: {
    label: 'Lost',
    icon: UserX,
    className: 'text-red-600 bg-red-50 border-red-200',
  },
};

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function LeadActivityTimeline({ activities = [] }) {
  if (!activities.length) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        No activity yet. Add a call note, WhatsApp note, visit note, or follow-up to start the timeline.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-950">Lead activity timeline</h2>
        <p className="mt-1 text-sm text-slate-500">
          Complete history of calls, WhatsApp notes, visits, demos, fee discussions, and status changes.
        </p>
      </div>

      <div className="divide-y divide-slate-100">
        {activities.map((activity) => {
          const config = activityConfig[activity.type] || activityConfig.STATUS_CHANGE;
          const Icon = config.icon;

          return (
            <div key={activity.id} className="flex gap-4 px-5 py-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${config.className}`}>
                <Icon className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-950">{activity.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {config.label} - {formatDate(activity.activityAt)}
                    </p>
                  </div>

                  {activity.oldStatus && activity.newStatus ? (
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                      {activity.oldStatus} -&gt; {activity.newStatus}
                    </div>
                  ) : null}
                </div>

                {activity.note ? (
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">
                    {activity.note}
                  </p>
                ) : null}

                {activity.metadata?.followUpAt ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Next follow-up: {formatDate(activity.metadata.followUpAt)}
                  </p>
                ) : null}

                {activity.metadata?.demoDate ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Demo date: {formatDate(activity.metadata.demoDate)}
                  </p>
                ) : null}

                {activity.metadata?.estimatedRevenue ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Estimated revenue: {money(activity.metadata.estimatedRevenue)}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
