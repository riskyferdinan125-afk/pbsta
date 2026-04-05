import React from 'react';
import { motion } from 'motion/react';
import { Ticket, TicketStatus, TicketPriority } from '../types';
import { 
  CheckCircle2,
  AlertCircle,
  X,
  Plus, 
  MoreVertical, 
  User, 
  Clock, 
  Link as LinkIcon,
  Zap,
  Timer,
  AlertTriangle,
  TrendingUp
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

interface KanbanViewProps {
  filteredTickets: (Ticket & { customerName?: string })[];
  setNewTicket: React.Dispatch<React.SetStateAction<any>>;
  setIsModalOpen: (isOpen: boolean) => void;
  setSelectedTicket: (ticket: Ticket & { customerName?: string }) => void;
  setIsDetailsModalOpen: (isOpen: boolean) => void;
  handleSmartAssign: (ticketId: string) => void;
  getPriorityColor: (priority: TicketPriority) => string;
  getSLAStatus: (ticket: Ticket) => 'within-sla' | 'near-breach' | 'breached';
}

export default function KanbanView({
  filteredTickets,
  setNewTicket,
  setIsModalOpen,
  setSelectedTicket,
  setIsDetailsModalOpen,
  handleSmartAssign,
  getPriorityColor,
  getSLAStatus
}: KanbanViewProps) {
  const columns: { id: TicketStatus; title: string; color: string; icon: React.ReactNode }[] = [
    { id: 'open', title: 'Open', color: 'bg-sky-500', icon: <AlertCircle className="w-3 h-3" /> },
    { id: 'in-progress', title: 'In Progress', color: 'bg-amber-500', icon: <Clock className="w-3 h-3" /> },
    { id: 'resolved', title: 'Resolved', color: 'bg-emerald-500', icon: <CheckCircle2 className="w-3 h-3" /> },
    { id: 'closed', title: 'Closed', color: 'bg-slate-500', icon: <X className="w-3 h-3" /> }
  ];

  return (
    <div className="flex gap-6 overflow-x-auto pb-6 min-h-[600px]">
      {columns.map(column => (
        <div key={column.id} className="flex-shrink-0 w-80 flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-white ${column.color}`}>
                {column.icon}
              </div>
              <h3 className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">{column.title}</h3>
              <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {filteredTickets.filter(t => t.status === column.id).length}
              </span>
            </div>
            <button 
              onClick={() => {
                setNewTicket((prev: any) => ({ ...prev, status: column.id }));
                setIsModalOpen(true);
              }}
              className="p-1 hover:bg-slate-100 rounded-md text-slate-400 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {filteredTickets
              .filter(t => t.status === column.id)
              .map(ticket => (
                <motion.div
                  layoutId={ticket.id}
                  key={ticket.id}
                  onClick={() => {
                    setSelectedTicket(ticket);
                    setIsDetailsModalOpen(true);
                  }}
                  className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-slate-400">#{ticket.ticketNumber || '---'}</span>
                        <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${getPriorityColor(ticket.priority)}`}>
                          {ticket.priority}
                        </div>
                      </div>
                      {ticket.inseraTicketId && (
                        <span className="text-[9px] font-bold text-blue-500 uppercase tracking-tighter bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 w-fit">
                          {ticket.inseraTicketId}
                        </span>
                      )}
                      {ticket.isTimerRunning && (
                        <div className="flex items-center gap-1 text-[9px] font-bold text-red-500 animate-pulse bg-red-50 px-1.5 py-0.5 rounded border border-red-100 w-fit">
                          <Timer size={10} />
                          RUNNING
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {(() => {
                        const isBlocked = ticket.dependsOn?.some(depId => {
                          const dep = filteredTickets.find(t => t.id === depId);
                          return dep && dep.status !== 'resolved' && dep.status !== 'closed';
                        });
                        if (isBlocked) {
                          return (
                            <div className="flex items-center gap-1 text-[8px] font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 w-fit">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              BLOCKED
                            </div>
                          );
                        }
                        if (ticket.dependsOn && ticket.dependsOn.length > 0) {
                          return <LinkIcon size={12} className="text-amber-500" />;
                        }
                        return null;
                      })()}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSmartAssign(ticket.id);
                        }}
                        className="p-1 opacity-0 group-hover:opacity-100 text-emerald-500 hover:text-emerald-700 transition-all"
                        title="Smart Assign"
                      >
                        <Zap size={14} />
                      </button>
                      <button className="p-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-all">
                        <MoreVertical size={14} />
                      </button>
                    </div>
                  </div>

                  <h4 className="text-sm font-semibold text-slate-800 mb-1 line-clamp-1">{ticket.category} - {ticket.subCategory || 'General'}</h4>
                  {ticket.points !== undefined && (
                    <div className="flex items-center gap-1 mb-2">
                      <TrendingUp className="w-2.5 h-2.5 text-emerald-500" />
                      <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter">{ticket.points} PTS</span>
                    </div>
                  )}
                  <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed">{ticket.description}</p>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <User size={12} />
                      </div>
                      <span className="text-[11px] font-medium text-slate-600 truncate max-w-[100px]">{ticket.customerName}</span>
                    </div>
                    
                    {(() => {
                      const sla = getSLAStatus(ticket);
                      const deadline = ticket.slaDeadline instanceof Timestamp ? ticket.slaDeadline.toDate() : (ticket.slaDeadline ? new Date(ticket.slaDeadline) : null);
                      if (!deadline) return null;
                      
                      const now = new Date();
                      const diff = deadline.getTime() - now.getTime();
                      const hours = Math.floor(Math.abs(diff) / (1000 * 60 * 60));
                      const mins = Math.floor((Math.abs(diff) % (1000 * 60 * 60)) / (1000 * 60));

                      return (
                        <div className={`flex items-center gap-1 text-[10px] font-bold ${
                          sla === 'breached' ? 'text-rose-500' :
                          sla === 'near-breach' ? 'text-amber-500 animate-pulse' :
                          'text-emerald-500'
                        }`}>
                          <Clock size={10} />
                          {sla === 'breached' ? `Breached ${hours}h ${mins}m ago` : `${hours}h ${mins}m left`}
                        </div>
                      );
                    })()}
                  </div>
                </motion.div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
