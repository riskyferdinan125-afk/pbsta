import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { Ticket, Customer, Technician, TicketStatus, UserProfile } from '../types';
import { 
  Search, 
  UserPlus, 
  Clock, 
  AlertTriangle,
  User,
  ChevronRight,
  ClipboardList,
  Check,
  Sparkles,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import TicketDetailsModal from './TicketDetailsModal';
import { useToast } from './Toast';
import { GoogleGenAI } from "@google/genai";

export default function TicketAssignment({ profile }: { profile: UserProfile | null }) {
  const [tickets, setTickets] = useState<(Ticket & { customerName?: string })[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<(Ticket & { customerName?: string }) | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ techId: string; reason: string } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const techQuery = query(collection(db, 'users'), where('role', '==', 'teknisi'));
    const techUnsubscribe = onSnapshot(techQuery, (snapshot) => {
      setTechnicians(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as Technician)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const ticketData = await Promise.all(snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data() as Ticket;
        // Only show unassigned tickets
        if (data.technicianIds && data.technicianIds.length > 0) return null;

        let customerName = 'Unknown';
        if (data.customerId) {
          const custDoc = await getDoc(doc(db, 'customers', data.customerId));
          if (custDoc.exists()) {
            customerName = custDoc.data().name;
          }
        }
        return { id: docSnap.id, ...data, customerName };
      }));
      setTickets(ticketData.filter(t => t !== null) as any);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tickets');
    });

    return () => {
      unsubscribe();
      techUnsubscribe();
    };
  }, []);

  const handleAiSuggest = async (ticket: Ticket) => {
    setIsAiSuggesting(true);
    setAiSuggestion(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `
          Analyze this ticket and suggest the best technician from the list.
          
          Ticket:
          - Description: ${ticket.description}
          - Category: ${ticket.category}
          - Priority: ${ticket.priority}
          
          Technicians:
          ${technicians.map(t => `- ID: ${t.id}, Name: ${t.name}, Skills: ${t.skills?.join(', ') || 'N/A'}, Status: ${t.availabilityStatus || 'Available'}`).join('\n')}
          
          Return JSON format: { "techId": "ID", "reason": "Short reason why" }
        `,
        config: { responseMimeType: "application/json" }
      });

      const result = await model;
      const suggestion = JSON.parse(result.text);
      setAiSuggestion(suggestion);
      showToast('AI Suggestion ready');
    } catch (error) {
      console.error('AI Suggestion error:', error);
      showToast('AI failed to suggest', 'error');
    } finally {
      setIsAiSuggesting(false);
    }
  };

  const updateTechnician = async (ticketId: string, technicianId: string) => {
    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;

      const oldTechIds = ticket.technicianIds || [];
      let newTechIds: string[];
      
      if (oldTechIds.includes(technicianId)) {
        newTechIds = oldTechIds.filter(id => id !== technicianId);
      } else {
        newTechIds = [...oldTechIds, technicianId];
      }

      const updates: any = {
        technicianIds: newTechIds,
        updatedAt: serverTimestamp()
      };

      // Auto-update status to in-progress if it was open and now assigned
      if (oldTechIds.length === 0 && newTechIds.length > 0 && ticket.status === 'open') {
        updates.status = 'in-progress';
      }

      await updateDoc(doc(db, 'tickets', ticketId), updates);
      
      await addDoc(collection(db, 'ticketHistory'), {
        ticketId,
        type: 'assignment_change',
        fromValue: oldTechIds,
        toValue: newTechIds,
        changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp()
      });

      showToast('Assignment updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticketId}`);
      showToast('Failed to update assignment', 'error');
    }
  };

  const handleAssignToMe = async (ticketId: string) => {
    const myTech = technicians.find(t => t.email === auth.currentUser?.email);
    if (myTech) {
      await updateTechnician(ticketId, myTech.id);
    } else {
      showToast('You are not registered as a technician', 'error');
    }
  };

  const filteredTickets = tickets.filter(t => 
    t.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.ticketNumber?.toString().includes(searchQuery) ||
    t.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-neutral-900 uppercase tracking-tighter">Ticket Assignment</h2>
          <p className="text-sm text-neutral-500">Manage unassigned tickets and technician workloads</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search unassigned tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm animate-pulse h-48"></div>
          ))
        ) : filteredTickets.length > 0 ? (
          filteredTickets.map((ticket) => (
            <motion.div
              key={ticket.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">#{ticket.ticketNumber}</span>
                  <h3 className="font-bold text-neutral-900 truncate max-w-[200px]">{ticket.customerName}</h3>
                </div>
                <div className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  ticket.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                  ticket.priority === 'high' ? 'bg-orange-100 text-orange-600' :
                  'bg-neutral-100 text-neutral-600'
                }`}>
                  {ticket.priority}
                </div>
              </div>

              <p className="text-sm text-neutral-500 line-clamp-2 mb-6 h-10">
                {ticket.description}
              </p>

              <div className="flex items-center justify-between pt-4 border-t border-black/5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAssignToMe(ticket.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                  >
                    <UserPlus className="w-3 h-3" />
                    Assign to Me
                  </button>
                  <button
                    onClick={() => {
                      setSelectedTicket(ticket);
                      setIsAssignModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-black/10 text-neutral-600 rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-neutral-50 transition-all"
                  >
                    <ClipboardList className="w-3 h-3" />
                    Assign
                  </button>
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
            </motion.div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-neutral-200">
            <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="w-8 h-8 text-neutral-200" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900">All Caught Up!</h3>
            <p className="text-neutral-500">No unassigned tickets found.</p>
          </div>
        )}
      </div>

      {/* Assign Modal */}
      <AnimatePresence>
        {isAssignModalOpen && selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-neutral-900">Assign Technicians</h3>
                  <p className="text-xs text-neutral-500 mt-1">Ticket #{selectedTicket.ticketNumber}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAiSuggest(selectedTicket)}
                    disabled={isAiSuggesting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-100 transition-all disabled:opacity-50"
                  >
                    {isAiSuggesting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    AI Suggest
                  </button>
                  <button onClick={() => {
                    setIsAssignModalOpen(false);
                    setAiSuggestion(null);
                  }} className="p-2 hover:bg-neutral-100 rounded-xl">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
                {aiSuggestion && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl mb-4">
                    <div className="flex items-center gap-2 text-emerald-700 mb-1">
                      <Sparkles className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">AI Recommendation</span>
                    </div>
                    <p className="text-sm text-emerald-600 leading-relaxed italic">
                      "{aiSuggestion.reason}"
                    </p>
                  </div>
                )}
                {technicians.map(tech => {
                  const isAssigned = selectedTicket.technicianIds?.includes(tech.id);
                  const isSuggested = aiSuggestion?.techId === tech.id;
                  return (
                    <button
                      key={tech.id}
                      onClick={() => updateTechnician(selectedTicket.id, tech.id)}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                        isAssigned 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                          : isSuggested
                            ? 'bg-white border-emerald-400 ring-2 ring-emerald-500/20 text-neutral-600'
                            : 'bg-white border-black/5 text-neutral-600 hover:border-emerald-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 border border-black/5 overflow-hidden">
                            {tech.photoURL ? (
                              <img src={tech.photoURL} alt={tech.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <User className="w-5 h-5" />
                            )}
                          </div>
                          {isSuggested && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white">
                              <Sparkles className="w-2 h-2 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-sm flex items-center gap-2">
                            {tech.name}
                            {isSuggested && <span className="text-[8px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full uppercase">Suggested</span>}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider opacity-60">{tech.availabilityStatus || 'Available'}</p>
                        </div>
                      </div>
                      {isAssigned && (
                        <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="p-6 bg-neutral-50 border-t border-black/5">
                <button
                  onClick={() => {
                    setIsAssignModalOpen(false);
                    setAiSuggestion(null);
                  }}
                  className="w-full py-3 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-900/20"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Details Modal */}
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

function X({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  );
}
