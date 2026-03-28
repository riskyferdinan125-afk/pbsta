import React from 'react';
import { Ticket } from '../types';
import { 
  Ticket as TicketIcon, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  TrendingUp,
  AlertCircle as AlertIcon,
  CheckCircle as CheckIcon,
  Activity as ActivityIcon
} from 'lucide-react';

interface DashboardSummaryProps {
  tickets: Ticket[];
}

export default function DashboardSummary({ tickets }: DashboardSummaryProps) {
  const stats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    inProgress: tickets.filter(t => t.status === 'in-progress').length,
    resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
    urgent: tickets.filter(t => t.priority === 'urgent' && t.status !== 'closed').length
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <TicketIcon className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Total Tiket</span>
        </div>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-black text-neutral-900">{stats.total}</span>
          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
            <TrendingUp className="w-3 h-3" />
            <span>+12%</span>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">
            <AlertIcon className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Open</span>
        </div>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-black text-neutral-900">{stats.open}</span>
          <span className="text-[10px] font-bold text-neutral-400">Aktif</span>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
            <ActivityIcon className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">In Progress</span>
        </div>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-black text-neutral-900">{stats.inProgress}</span>
          <span className="text-[10px] font-bold text-neutral-400">Dikerjakan</span>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckIcon className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Resolved</span>
        </div>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-black text-neutral-900">{stats.resolved}</span>
          <span className="text-[10px] font-bold text-emerald-600">Selesai</span>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
            <AlertCircle className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Urgent</span>
        </div>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-black text-rose-600">{stats.urgent}</span>
          <div className="flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full animate-pulse">
            <span>Critical</span>
          </div>
        </div>
      </div>
    </div>
  );
}
