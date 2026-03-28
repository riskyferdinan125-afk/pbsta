import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit, orderBy, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Ticket, Customer } from '../types';
import { 
  Ticket as TicketIcon, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  TrendingUp,
  Users
} from 'lucide-react';
import { motion } from 'motion/react';

import SeedDataButton from './SeedDataButton';

export default function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0
  });
  const [techStats, setTechStats] = useState({
    total: 0,
    available: 0,
    busy: 0,
    onLeave: 0
  });
  const [recentTickets, setRecentTickets] = useState<(Ticket & { customerName?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const ticketsSnap = await getDocs(collection(db, 'tickets'));
      const tickets = ticketsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket));
      
      setStats({
        total: tickets.length,
        open: tickets.filter(t => t.status === 'open').length,
        inProgress: tickets.filter(t => t.status === 'in-progress').length,
        resolved: tickets.filter(t => t.status === 'resolved').length
      });

      const techsSnap = await getDocs(collection(db, 'technicians'));
      const techs = techsSnap.docs.map(doc => doc.data());
      setTechStats({
        total: techs.length,
        available: techs.filter(t => t.availabilityStatus === 'Available').length,
        busy: techs.filter(t => t.availabilityStatus === 'Busy').length,
        onLeave: techs.filter(t => t.availabilityStatus === 'On Leave').length
      });

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
    { label: 'Total Tickets', value: stats.total, icon: TicketIcon, color: 'bg-blue-500' },
    { label: 'Open', value: stats.open, icon: AlertCircle, color: 'bg-orange-500' },
    { label: 'In Progress', icon: Clock, value: stats.inProgress, color: 'bg-emerald-500' },
    { label: 'Resolved', icon: CheckCircle2, value: stats.resolved, color: 'bg-purple-500' },
  ];

  if (loading) return <div className="animate-pulse space-y-8">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {[1,2,3,4].map(i => <div key={i} className="h-32 bg-neutral-200 rounded-2xl"></div>)}
    </div>
    <div className="h-96 bg-neutral-200 rounded-2xl"></div>
  </div>;

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
        <div className="lg:col-span-2 bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-black/5 flex items-center justify-between">
            <h3 className="font-bold text-neutral-900">Recent Tickets</h3>
            <button className="text-sm text-emerald-600 font-medium hover:underline">View All</button>
          </div>
          <div className="divide-y divide-black/5">
            {recentTickets.length > 0 ? recentTickets.map((ticket) => (
              <div key={ticket.id} className="p-6 flex items-center justify-between hover:bg-neutral-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    ticket.status === 'open' ? 'bg-orange-100 text-orange-600' :
                    ticket.status === 'in-progress' ? 'bg-emerald-100 text-emerald-600' :
                    'bg-purple-100 text-purple-600'
                  }`}>
                    <TicketIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900">{ticket.customerName}</p>
                    <p className="text-sm text-neutral-500 truncate max-w-xs">{ticket.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                    ticket.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                    ticket.priority === 'high' ? 'bg-orange-100 text-orange-600' :
                    'bg-neutral-100 text-neutral-600'
                  }`}>
                    {ticket.priority}
                  </span>
                  <p className="text-xs text-neutral-400 mt-1">
                    {ticket.createdAt instanceof Timestamp ? ticket.createdAt.toDate().toLocaleDateString() : 'No date'}
                  </p>
                </div>
              </div>
            )) : (
              <div className="p-12 text-center text-neutral-500">No recent tickets found.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-emerald-600 rounded-2xl p-6 text-white shadow-lg shadow-emerald-600/20">
            <h3 className="font-bold text-lg mb-2">Need Help?</h3>
            <p className="text-emerald-100 text-sm mb-6">Check out the documentation for managing tickets and productivity reports.</p>
            <button className="w-full py-3 bg-white text-emerald-600 rounded-xl font-bold hover:bg-emerald-50 transition-colors">
              Read Docs
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
            <h3 className="font-bold text-neutral-900 mb-4">Technician Availability</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                  <span className="text-sm text-neutral-600">Available</span>
                </div>
                <span className="text-sm font-bold text-neutral-900">{techStats.available}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.4)]" />
                  <span className="text-sm text-neutral-600">Busy</span>
                </div>
                <span className="text-sm font-bold text-neutral-900">{techStats.busy}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                  <span className="text-sm text-neutral-600">On Leave</span>
                </div>
                <span className="text-sm font-bold text-neutral-900">{techStats.onLeave}</span>
              </div>
              <div className="pt-2 border-t border-black/5 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-500">Total Technicians</span>
                <span className="text-sm font-bold text-neutral-900">{techStats.total}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
            <h3 className="font-bold text-neutral-900 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button className="w-full p-3 text-left bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-colors flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                  <TicketIcon className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">Create New Ticket</span>
              </button>
              <button className="w-full p-3 text-left bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-colors flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">Add New Customer</span>
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
