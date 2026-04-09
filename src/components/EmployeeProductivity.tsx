import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Ticket, Technician, UserProfile } from '../types';
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  Star, 
  TrendingUp,
  Search,
  Filter,
  BarChart3,
  Activity,
  Briefcase,
  ShieldCheck
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  Cell
} from 'recharts';

interface EmployeeProductivityProps {
  profile?: UserProfile | null;
}

interface ProductivityStats {
  technicianId: string;
  technicianName: string;
  completedTickets: number;
  avgCompletionTime: number; // in minutes
  avgRating: number;
  inProgressTickets: number;
  totalPoints: number;
  slaComplianceRate: number;
  totalChecklistItems: number;
  completedChecklistItems: number;
}

export default function EmployeeProductivity({ profile }: EmployeeProductivityProps) {
  const [stats, setStats] = useState<ProductivityStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<keyof ProductivityStats>('completedTickets');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let tickets: Ticket[] = [];
    let technicians: UserProfile[] = [];

    const updateStats = () => {
      if (technicians.length === 0) return;

      const productivityData: ProductivityStats[] = technicians.map(tech => {
        const techTickets = tickets.filter(t => t.technicianIds?.includes(tech.uid));
        const completed = techTickets.filter(t => t.status === 'resolved' || t.status === 'closed');
        const inProgress = techTickets.filter(t => t.status === 'in-progress');
        
        const totalTime = completed.reduce((sum, t) => sum + (t.totalTimeSpent || 0), 0);
        const totalRating = completed.reduce((sum, t) => sum + (t.rating || 0), 0);
        const ratedCount = completed.filter(t => t.rating && t.rating > 0).length;
        const totalPoints = techTickets.reduce((sum, t) => sum + (t.points || 0), 0);
        
        const withinSLA = completed.filter(t => t.slaStatus === 'within-sla').length;
        const slaRate = completed.length > 0 ? (withinSLA / completed.length) * 100 : 0;

        // Checklist Metrics
        let totalChecklistItems = 0;
        let completedByTech = 0;

        techTickets.forEach(ticket => {
          if (ticket.checklist) {
            totalChecklistItems += ticket.checklist.length;
            ticket.checklist.forEach(item => {
              if (item.completed && (item.completedBy === tech.name || item.completedBy === tech.email)) {
                completedByTech += 1;
              }
            });
          }
        });

        return {
          technicianId: tech.uid,
          technicianName: tech.name,
          completedTickets: completed.length,
          avgCompletionTime: completed.length > 0 ? totalTime / completed.length : 0,
          avgRating: ratedCount > 0 ? totalRating / ratedCount : 0,
          inProgressTickets: inProgress.length,
          totalPoints: totalPoints,
          slaComplianceRate: slaRate,
          totalChecklistItems: totalChecklistItems,
          completedChecklistItems: completedByTech
        };
      });

      setStats(productivityData);
      setLoading(false);
    };

    const unsubscribeTickets = onSnapshot(collection(db, 'tickets'), (snapshot) => {
      tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket));
      updateStats();
    });

    const techQuery = query(collection(db, 'users'), where('role', '==', 'teknisi'));
    const unsubscribeTechs = onSnapshot(techQuery, (snapshot) => {
      technicians = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      updateStats();
    });

    return () => {
      unsubscribeTickets();
      unsubscribeTechs();
    };
  }, []);

  const sortedStats = [...stats]
    .filter(s => s.technicianName.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const valA = a[sortBy];
      const valB = b[sortBy];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortOrder === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

  const handleSort = (key: keyof ProductivityStats) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('desc');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-neutral-900">Analisis Produktivitas Petugas</h3>
          <p className="text-sm text-neutral-500">Metrik performa dan efisiensi tim perbaikan</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Cari petugas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-64"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-emerald-50 rounded-2xl">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Total Selesai</p>
              <p className="text-2xl font-black text-neutral-900">
                {stats.reduce((sum, s) => sum + s.completedTickets, 0)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-emerald-600 font-bold">
            <TrendingUp className="w-3 h-3" />
            <span>Tiket telah diselesaikan</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-amber-50 rounded-2xl">
              <Activity className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Dalam Proses</p>
              <p className="text-2xl font-black text-neutral-900">
                {stats.reduce((sum, s) => sum + s.inProgressTickets, 0)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-amber-600 font-bold">
            <Clock className="w-3 h-3" />
            <span>Tiket sedang dikerjakan</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-50 rounded-2xl">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Rata-rata Waktu</p>
              <p className="text-2xl font-black text-neutral-900">
                {(() => {
                  const total = stats.reduce((sum, s) => sum + s.avgCompletionTime, 0);
                  const count = stats.filter(s => s.avgCompletionTime > 0).length;
                  return count > 0 ? Math.round(total / count) : 0;
                })()}m
              </p>
            </div>
          </div>
          <div className="text-xs text-neutral-500 font-medium">
            Waktu penyelesaian rata-rata
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-purple-50 rounded-2xl">
              <Star className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Kepuasan</p>
              <p className="text-2xl font-black text-neutral-900">
                {(() => {
                  const total = stats.reduce((sum, s) => sum + s.avgRating, 0);
                  const count = stats.filter(s => s.avgRating > 0).length;
                  return count > 0 ? (total / count).toFixed(1) : '0.0';
                })()}
              </p>
            </div>
          </div>
          <div className="text-xs text-neutral-500 font-medium">
            Skala 1-5 bintang
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-indigo-50 rounded-2xl">
              <ShieldCheck className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Penyelesaian Checklist</p>
              <p className="text-2xl font-black text-neutral-900">
                {(() => {
                  const total = stats.reduce((sum, s) => sum + s.totalChecklistItems, 0);
                  const completed = stats.reduce((sum, s) => sum + s.completedChecklistItems, 0);
                  return total > 0 ? Math.round((completed / total) * 100) : 0;
                })()}%
              </p>
            </div>
          </div>
          <div className="text-xs text-neutral-500 font-medium">
            Rata-rata item checklist selesai
          </div>
        </div>
      </div>

      {/* Visualization Chart */}
      <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
        <h4 className="text-lg font-bold text-neutral-900 mb-6 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-600" />
          Visualisasi Performa Petugas
        </h4>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sortedStats.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="technicianName" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#737373' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} />
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                cursor={{ fill: '#f8fafc' }}
              />
              <Legend verticalAlign="top" height={36} />
              <Bar dataKey="completedTickets" name="Tiket Selesai" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
              <Bar dataKey="slaComplianceRate" name="Kepatuhan SLA (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
              <Bar 
                dataKey={(data) => data.totalChecklistItems > 0 ? Math.round((data.completedChecklistItems / data.totalChecklistItems) * 100) : 0} 
                name="Checklist Selesai (%)" 
                fill="#8b5cf6" 
                radius={[4, 4, 0, 0]} 
                barSize={20} 
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50/50 border-b border-black/5">
                <th 
                  className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-emerald-600 transition-colors"
                  onClick={() => handleSort('technicianName')}
                >
                  <div className="flex items-center gap-2">
                    Petugas
                    {sortBy === 'technicianName' && (sortOrder === 'asc' ? <TrendingUp className="w-3 h-3 rotate-180" /> : <TrendingUp className="w-3 h-3" />)}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider text-center cursor-pointer hover:text-emerald-600 transition-colors"
                  onClick={() => handleSort('completedTickets')}
                >
                  <div className="flex items-center justify-center gap-2">
                    Tiket Selesai
                    {sortBy === 'completedTickets' && (sortOrder === 'asc' ? <TrendingUp className="w-3 h-3 rotate-180" /> : <TrendingUp className="w-3 h-3" />)}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider text-center cursor-pointer hover:text-emerald-600 transition-colors"
                  onClick={() => handleSort('inProgressTickets')}
                >
                  <div className="flex items-center justify-center gap-2">
                    Dalam Proses
                    {sortBy === 'inProgressTickets' && (sortOrder === 'asc' ? <TrendingUp className="w-3 h-3 rotate-180" /> : <TrendingUp className="w-3 h-3" />)}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider text-center cursor-pointer hover:text-emerald-600 transition-colors"
                  onClick={() => handleSort('avgCompletionTime')}
                >
                  <div className="flex items-center justify-center gap-2">
                    Rata-rata Waktu
                    {sortBy === 'avgCompletionTime' && (sortOrder === 'asc' ? <TrendingUp className="w-3 h-3 rotate-180" /> : <TrendingUp className="w-3 h-3" />)}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider text-center cursor-pointer hover:text-emerald-600 transition-colors"
                  onClick={() => handleSort('avgRating')}
                >
                  <div className="flex items-center justify-center gap-2">
                    Kepuasan
                    {sortBy === 'avgRating' && (sortOrder === 'asc' ? <TrendingUp className="w-3 h-3 rotate-180" /> : <TrendingUp className="w-3 h-3" />)}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider text-center cursor-pointer hover:text-emerald-600 transition-colors"
                  onClick={() => handleSort('totalPoints')}
                >
                  <div className="flex items-center justify-center gap-2">
                    Total Poin
                    {sortBy === 'totalPoints' && (sortOrder === 'asc' ? <TrendingUp className="w-3 h-3 rotate-180" /> : <TrendingUp className="w-3 h-3" />)}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider text-center cursor-pointer hover:text-emerald-600 transition-colors"
                  onClick={() => handleSort('slaComplianceRate')}
                >
                  <div className="flex items-center justify-center gap-2">
                    SLA Rate
                    {sortBy === 'slaComplianceRate' && (sortOrder === 'asc' ? <TrendingUp className="w-3 h-3 rotate-180" /> : <TrendingUp className="w-3 h-3" />)}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider text-center"
                >
                  <div className="flex items-center justify-center gap-2">
                    Checklist
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {sortedStats.map((row) => (
                <motion.tr 
                  layout
                  key={row.technicianId}
                  className="hover:bg-neutral-50/50 transition-colors group"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs">
                        {row.technicianName.charAt(0)}
                      </div>
                      <span className="font-bold text-neutral-900">{row.technicianName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
                      {row.completedTickets}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">
                      {row.inProgressTickets}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-neutral-600 font-medium">
                      <Clock className="w-3 h-3" />
                      {Math.round(row.avgCompletionTime)}m
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-amber-500 font-bold">
                      <Star className="w-3 h-3 fill-current" />
                      {row.avgRating.toFixed(1)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="font-black text-emerald-600">
                      {row.totalPoints.toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`font-bold ${row.slaComplianceRate >= 90 ? 'text-emerald-600' : row.slaComplianceRate >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {Math.round(row.slaComplianceRate)}%
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-full max-w-[80px] h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 transition-all"
                          style={{ width: `${row.totalChecklistItems > 0 ? (row.completedChecklistItems / row.totalChecklistItems) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-neutral-500">
                        {row.completedChecklistItems}/{row.totalChecklistItems}
                      </span>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
