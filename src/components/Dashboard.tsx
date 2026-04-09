import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit, orderBy, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Ticket, Customer, UserProfile, RepairRecord } from '../types';
import { 
  Ticket as TicketIcon, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  TrendingUp,
  Users,
  Star,
  Award,
  ChevronRight
} from 'lucide-react';
import { motion } from 'motion/react';

import SeedDataButton from './SeedDataButton';

interface DashboardProps {
  onNavigate?: (view: any) => void;
  onOpenTicket?: (ticketId: string) => void;
}

export default function Dashboard({ onNavigate, onOpenTicket }: DashboardProps) {
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    customers: 0
  });
  const [techStats, setTechStats] = useState({
    total: 0,
    available: 0,
    busy: 0,
    onLeave: 0
  });
  const [recentTickets, setRecentTickets] = useState<(Ticket & { customerName?: string })[]>([]);
  const [topTechnicians, setTopTechnicians] = useState<{
    id: string;
    name: string;
    completed: number;
    avgTime: number;
    rating: number;
    checklistRate: number;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const ticketsSnap = await getDocs(collection(db, 'tickets'));
      const tickets = ticketsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket));
      
      const customersSnap = await getDocs(collection(db, 'customers'));
      
      const recordsSnap = await getDocs(collection(db, 'repairRecords'));
      const records = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RepairRecord));

      setStats({
        total: tickets.length,
        open: tickets.filter(t => t.status === 'open').length,
        inProgress: tickets.filter(t => t.status === 'in-progress').length,
        resolved: tickets.filter(t => t.status === 'resolved').length,
        customers: customersSnap.size
      });

      const techQuery = query(collection(db, 'users'), where('role', '==', 'teknisi'));
      const techsSnap = await getDocs(techQuery);
      const techs = techsSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      
      setTechStats({
        total: techs.length,
        available: techs.filter(t => t.availabilityStatus === 'Available').length,
        busy: techs.filter(t => t.availabilityStatus === 'Busy').length,
        onLeave: techs.filter(t => t.availabilityStatus === 'On Leave').length
      });

      // Calculate Top Technicians
      const techPerformance = techs.map(tech => {
        const techTickets = tickets.filter(t => t.technicianIds?.includes(tech.uid));
        const completed = techTickets.filter(t => t.status === 'resolved' || t.status === 'closed');
        
        const totalTime = completed.reduce((sum, t) => sum + (t.totalTimeSpent || 0), 0);
        const totalRating = completed.reduce((sum, t) => sum + (t.rating || 0), 0);
        const ratedCount = completed.filter(t => t.rating && t.rating > 0).length;

        // Checklist completion for this tech
        let totalChecklist = 0;
        let completedChecklist = 0;
        techTickets.forEach(ticket => {
          if (ticket.checklist) {
            totalChecklist += ticket.checklist.length;
            ticket.checklist.forEach(item => {
              if (item.completed && (item.completedBy === tech.name || item.completedBy === tech.email)) {
                completedChecklist += 1;
              }
            });
          }
        });

        return {
          id: tech.uid,
          name: tech.name,
          completed: completed.length,
          avgTime: completed.length > 0 ? Math.round(totalTime / completed.length) : 0,
          rating: ratedCount > 0 ? Number((totalRating / ratedCount).toFixed(1)) : 0,
          checklistRate: totalChecklist > 0 ? Math.round((completedChecklist / totalChecklist) * 100) : 0
        };
      })
      .sort((a, b) => b.completed - a.completed || b.rating - a.rating)
      .slice(0, 4);

      setTopTechnicians(techPerformance);

      const recentQuery = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'), limit(5));
      const recentSnap = await getDocs(recentQuery);
      const recent = await Promise.all(recentSnap.docs.map(async (docSnap) => {
        const data = docSnap.data() as Ticket;
        let customerName = 'Unknown';
        if (data.customerId) {
          const custDoc = await getDoc(doc(db, 'customers', data.customerId));
          if (custDoc.exists()) {
            customerName = custDoc.data().name;
          }
        }
        return { id: docSnap.id, ...data, customerName };
      }));
      setRecentTickets(recent);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const statCards = [
    { label: 'Total Tiket', value: stats.total, icon: TicketIcon, color: 'bg-blue-500' },
    { label: 'Tiket Open', value: stats.open, icon: AlertCircle, color: 'bg-orange-500' },
    { label: 'Dalam Proses', icon: Clock, value: stats.inProgress, color: 'bg-emerald-500' },
    { label: 'Selesai', icon: CheckCircle2, value: stats.resolved, color: 'bg-purple-500' },
    { label: 'Total Pelanggan', icon: Users, value: stats.customers, color: 'bg-indigo-500' },
  ];

  if (loading) return <div className="animate-pulse space-y-8">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
      {[1,2,3,4,5].map(i => <div key={i} className="h-32 bg-neutral-200 rounded-2xl"></div>)}
    </div>
    <div className="h-96 bg-neutral-200 rounded-2xl"></div>
  </div>;

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {statCards.map((stat, idx) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${stat.color} text-white`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                +12%
              </span>
            </div>
            <p className="text-neutral-500 text-sm font-medium">{stat.label}</p>
            <h3 className="text-3xl font-bold text-neutral-900 mt-1">{stat.value}</h3>
          </motion.div>
        ))}
      </div>

      {/* Recent Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-black/5 flex items-center justify-between">
              <h3 className="font-bold text-neutral-900">Tiket Terbaru</h3>
              <button 
                onClick={() => onNavigate?.('tickets')}
                className="text-sm text-emerald-600 font-medium hover:underline"
              >
                Lihat Semua
              </button>
            </div>
            <div className="divide-y divide-black/5">
              {recentTickets.length > 0 ? recentTickets.map((ticket) => (
                <div 
                  key={ticket.id} 
                  onClick={() => onOpenTicket?.(ticket.id)}
                  className="p-6 flex items-center justify-between hover:bg-neutral-50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      ticket.status === 'open' ? 'bg-orange-100 text-orange-600' :
                      ticket.status === 'in-progress' ? 'bg-emerald-100 text-emerald-600' :
                      'bg-purple-100 text-purple-600'
                    }`}>
                      <TicketIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-neutral-900 group-hover:text-emerald-600 transition-colors">{ticket.customerName}</p>
                      <p className="text-sm text-neutral-500 truncate max-w-xs">{ticket.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full border ${
                        ticket.priority === 'urgent' ? 'bg-red-50 text-red-600 border-red-100' :
                        ticket.priority === 'high' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                        'bg-neutral-50 text-neutral-600 border-neutral-100'
                      }`}>
                        {ticket.priority}
                      </span>
                      <p className="text-[10px] text-neutral-400 font-bold mt-1 uppercase">
                        {ticket.createdAt instanceof Timestamp ? ticket.createdAt.toDate().toLocaleDateString() : 'No date'}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-emerald-500 transition-all group-hover:translate-x-1" />
                  </div>
                </div>
              )) : (
                <div className="p-12 text-center text-neutral-500">No recent tickets found.</div>
              )}
            </div>
          </div>

          {/* Top Performers Section */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-black/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-neutral-900">Teknisi Terbaik</h3>
              </div>
              <button 
                onClick={() => onNavigate?.('productivity')}
                className="text-sm text-emerald-600 font-medium hover:underline"
              >
                Laporan Lengkap
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topTechnicians.map((tech, idx) => (
                  <div key={tech.id} className="p-4 bg-neutral-50 rounded-2xl border border-black/5 hover:border-emerald-200 transition-all group">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-white border border-black/5 flex items-center justify-center text-xl font-black text-neutral-900 shadow-sm">
                        {idx + 1}
                      </div>
                      <div>
                        <h4 className="font-bold text-neutral-900">{tech.name}</h4>
                        <div className="flex items-center gap-1 text-amber-500">
                          <Star className="w-3 h-3 fill-current" />
                          <span className="text-xs font-bold">{tech.rating || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white p-2 rounded-xl border border-black/5">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">Selesai</p>
                        <p className="text-lg font-black text-emerald-600">{tech.completed}</p>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-black/5">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">Rata-rata Waktu</p>
                        <p className="text-lg font-black text-neutral-900">{tech.avgTime}m</p>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-black/5 col-span-2">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] font-bold text-neutral-400 uppercase">Checklist Selesai</p>
                          <p className="text-[10px] font-black text-indigo-600">{tech.checklistRate}%</p>
                        </div>
                        <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500 transition-all"
                            style={{ width: `${tech.checklistRate}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {topTechnicians.length === 0 && (
                  <div className="col-span-full py-8 text-center text-neutral-500 italic">
                    No performance data available yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-emerald-600 rounded-2xl p-6 text-white shadow-lg shadow-emerald-600/20">
            <h3 className="font-bold text-lg mb-2">Butuh Bantuan?</h3>
            <p className="text-emerald-100 text-sm mb-6">Lihat dokumentasi untuk mengelola tiket dan laporan produktivitas.</p>
            <button className="w-full py-3 bg-white text-emerald-600 rounded-xl font-bold hover:bg-emerald-50 transition-colors">
              Baca Dokumen
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
            <h3 className="font-bold text-neutral-900 mb-4">Ketersediaan Teknisi</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                  <span className="text-sm text-neutral-600">Tersedia</span>
                </div>
                <span className="text-sm font-bold text-neutral-900">{techStats.available}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.4)]" />
                  <span className="text-sm text-neutral-600">Sibuk</span>
                </div>
                <span className="text-sm font-bold text-neutral-900">{techStats.busy}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                  <span className="text-sm text-neutral-600">Cuti</span>
                </div>
                <span className="text-sm font-bold text-neutral-900">{techStats.onLeave}</span>
              </div>
              <div className="pt-2 border-t border-black/5 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-500">Total Teknisi</span>
                <span className="text-sm font-bold text-neutral-900">{techStats.total}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
            <h3 className="font-bold text-neutral-900 mb-4">Aksi Cepat</h3>
            <div className="space-y-3">
              <button 
                onClick={() => onNavigate?.('tickets')}
                className="w-full p-3 text-left bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-colors flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                  <TicketIcon className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">Buat Tiket Baru</span>
              </button>
              <button 
                onClick={() => onNavigate?.('customers')}
                className="w-full p-3 text-left bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-colors flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">Tambah Pelanggan Baru</span>
              </button>
              <SeedDataButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper for getDoc (already imported above)
