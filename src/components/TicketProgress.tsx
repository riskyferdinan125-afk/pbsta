import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Ticket, Customer, Technician, TicketStatus, UserProfile } from '../types';
import { 
  Search, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  User,
  Plane,
  ChevronRight,
  Activity,
  Calendar,
  ArrowRight,
  UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import TicketDetailsModal from './TicketDetailsModal';

export default function TicketProgress({ profile }: { profile: UserProfile | null }) {
  const [tickets, setTickets] = useState<(Ticket & { customerName?: string, technicianName?: string })[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<(Ticket & { customerName?: string }) | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [showOnlyMine, setShowOnlyMine] = useState(false);

  const myTechnician = technicians.find(t => t.email === profile?.email);

  useEffect(() => {
    if (profile?.role === 'teknisi') {
      setShowOnlyMine(true);
    }
  }, [profile, technicians]);

  useEffect(() => {
    const techUnsubscribe = onSnapshot(collection(db, 'technicians'), (snapshot) => {
      setTechnicians(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician)));
    });

    // We want tickets that are assigned to a technician
    const q = query(
      collection(db, 'tickets'), 
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const ticketData = await Promise.all(snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data() as Ticket;
        if (!data.technicianIds || data.technicianIds.length === 0) return null;

        let customerName = 'Unknown';
        let technicianNames: string[] = [];

        if (data.customerId) {
          const custDoc = await getDoc(doc(db, 'customers', data.customerId));
          if (custDoc.exists()) {
            customerName = custDoc.data().name;
          }
        }

        if (data.technicianIds && data.technicianIds.length > 0) {
          const techDocs = await Promise.all(data.technicianIds.map(id => getDoc(doc(db, 'technicians', id))));
          technicianNames = techDocs.filter(d => d.exists()).map(d => d.data()!.name);
        }

        return { 
          id: docSnap.id, 
          ...data, 
          customerName, 
          technicianName: technicianNames.join(', ') || 'Unassigned' 
        };
      }));
      
      setTickets(ticketData.filter(t => t !== null).sort((a, b) => {
        const timeA = a!.updatedAt?.toMillis() || a!.createdAt.toMillis();
        const timeB = b!.updatedAt?.toMillis() || b!.createdAt.toMillis();
        return timeB - timeA;
      }) as any);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tickets');
    });

    return () => {
      unsubscribe();
      techUnsubscribe();
    };
  }, []);

  const filteredTickets = tickets.filter(t => {
    const matchesSearch = t.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.technicianName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.ticketNumber?.toString().includes(searchQuery);
    
    const matchesOwnership = showOnlyMine && myTechnician 
      ? t.technicianIds?.includes(myTechnician.id)
      : true;

    return matchesSearch && matchesOwnership;
  });

  const getStatusProgress = (status: TicketStatus) => {
    switch (status) {
      case 'open': return 25;
      case 'in-progress': return 50;
      case 'resolved': return 75;
      case 'closed': return 100;
      default: return 0;
    }
  };

  const getStatusColor = (status: TicketStatus) => {
    switch (status) {
      case 'open': return 'bg-orange-500';
      case 'in-progress': return 'bg-blue-500';
      case 'resolved': return 'bg-emerald-500';
      case 'closed': return 'bg-neutral-500';
      default: return 'bg-neutral-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search progress by ticket #, customer, or technician..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>
          {profile?.role === 'teknisi' && myTechnician && (
            <button 
              onClick={() => setShowOnlyMine(!showOnlyMine)}
              className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition-all ${
                showOnlyMine 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                  : 'bg-white border-black/5 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              {showOnlyMine ? 'Show All Tickets' : 'My Tickets Only'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Activity className="w-4 h-4 text-emerald-500" />
          <span>Tracking {filteredTickets.length} active assignments</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
          [1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm animate-pulse h-48"></div>
          ))
        ) : filteredTickets.length > 0 ? (
          filteredTickets.map((ticket) => (
            <motion.div
              key={ticket.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
            >
              {/* Progress Bar Background */}
              <div className="absolute bottom-0 left-0 h-1 bg-neutral-100 w-full">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${getStatusProgress(ticket.status)}%` }}
                  className={`h-full ${getStatusColor(ticket.status)}`}
                />
              </div>

              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">#{ticket.ticketNumber}</span>
                  <h3 className="font-bold text-neutral-900 truncate max-w-[200px]">{ticket.customerName}</h3>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                  ticket.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                  ticket.priority === 'high' ? 'bg-orange-100 text-orange-600' :
                  'bg-neutral-100 text-neutral-600'
                }`}>
                  {ticket.priority}
                </span>
              </div>

              <p className="text-sm text-neutral-500 line-clamp-2 mb-6 h-10">
                {ticket.description}
              </p>

              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2 overflow-hidden">
                      {ticket.technicianIds?.slice(0, 2).map(techId => {
                        const tech = technicians.find(t => t.id === techId);
                        return (
                          <div key={techId} className="relative inline-block">
                            <div className="w-6 h-6 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400 border border-black/5 overflow-hidden ring-2 ring-white">
                              {tech?.photoURL ? (
                                <img src={tech.photoURL} alt="Tech" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <User className="w-3 h-3" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {ticket.technicianIds && ticket.technicianIds.length > 2 && (
                        <div className="w-6 h-6 bg-neutral-100 rounded-full flex items-center justify-center text-[8px] font-bold text-neutral-500 border border-black/5 ring-2 ring-white">
                          +{ticket.technicianIds.length - 2}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-neutral-900 text-[10px] leading-none truncate max-w-[120px]">
                        {ticket.technicianName}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-neutral-400 text-[10px]">
                    <Calendar className="w-3 h-3" />
                    <span>{ticket.updatedAt?.toDate().toLocaleDateString() || ticket.createdAt.toDate().toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(ticket.status)} animate-pulse`} />
                    <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider">{ticket.status.replace('-', ' ')}</span>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedTicket(ticket);
                      setIsDetailsModalOpen(true);
                    }}
                    className="p-2 hover:bg-neutral-50 text-neutral-400 hover:text-emerald-600 rounded-xl transition-all"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-neutral-200">
            <Activity className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
            <p className="text-neutral-500">No tickets currently assigned to technicians.</p>
          </div>
        )}
      </div>

      {selectedTicket && isDetailsModalOpen && (
        <TicketDetailsModal
          onClose={() => setIsDetailsModalOpen(false)}
          ticket={selectedTicket}
          technicians={technicians}
        />
      )}
    </div>
  );
}
