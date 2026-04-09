import React from 'react';
import { Ticket, Customer, TicketStatus, TicketPriority, Technician } from '../types';
import { stripHtml } from '../lib/textUtils';
import { calculateSLAStatus, getSLARemainingTime } from '../lib/slaUtils';
import { 
  Tag,
  Info,
  Link as LinkIcon,
  ChevronRight,
  Clock,
  User,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  UserPlus,
  Users,
  Wrench,
  Zap,
  TrendingUp,
  MoreVertical,
  X,
  Timer,
  Play,
  Square
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

interface TicketRowProps {
  ticket: Ticket & { customerName?: string };
  technicians: Technician[];
  selectedTicketIds: string[];
  toggleSelect: (id: string) => void;
  handleStatusChange: (id: string, status: TicketStatus) => void;
  handleSmartAssign: (id: string) => void;
  handleAssignToMe: (id: string) => void;
  setIsAssignModalOpen: (isOpen: boolean) => void;
  setIsDependencyModalOpen: (isOpen: boolean) => void;
  setIsRepairModalOpen: (isOpen: boolean) => void;
  setIsDetailsModalOpen: (isOpen: boolean) => void;
  setSelectedTicket: (ticket: Ticket & { customerName?: string }) => void;
  setSelectedTicketId: (id: string) => void;
  updatePriority: (id: string, priority: TicketPriority) => void;
  updateTechnician: (ticketId: string, techId: string) => void;
  handleStartTimer: (id: string) => void;
  handleStopTimer: (id: string) => void;
  getStatusColor: (status: TicketStatus) => string;
  getPriorityColor: (priority: TicketPriority) => string;
  getSLAStatus: (ticket: Ticket) => 'within-sla' | 'near-breach' | 'breached';
  tickets: Ticket[];
  isTechnician: boolean;
  myTechnicianId?: string;
}

export default function TicketRow({
  ticket,
  technicians,
  selectedTicketIds,
  toggleSelect,
  handleStatusChange,
  handleSmartAssign,
  handleAssignToMe,
  setIsAssignModalOpen,
  setIsDependencyModalOpen,
  setIsRepairModalOpen,
  setIsDetailsModalOpen,
  setSelectedTicket,
  setSelectedTicketId,
  updatePriority,
  updateTechnician,
  handleStartTimer,
  handleStopTimer,
  getStatusColor,
  getPriorityColor,
  getSLAStatus,
  tickets,
  isTechnician,
  myTechnicianId
}: TicketRowProps) {
  const resolvePhotoUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')) return url;
    if (!url.includes('/')) {
      return `/api/telegram-photo/${url}`;
    }
    return url;
  };
  return (
    <tr 
      key={ticket.id} 
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('select') || (e.target as HTMLElement).closest('input')) return;
        setSelectedTicket(ticket);
        setIsDetailsModalOpen(true);
      }}
      className="group hover:bg-neutral-50 transition-all cursor-pointer border-b border-black/5 last:border-0"
    >
      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
        <input 
          type="checkbox" 
          className="rounded border-black/10 text-emerald-600 focus:ring-emerald-500/20"
          checked={selectedTicketIds.includes(ticket.id)}
          onChange={() => toggleSelect(ticket.id)}
        />
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <span className="text-xs font-mono font-bold text-neutral-400">#{ticket.ticketNumber || '---'}</span>
          {ticket.isTimerRunning && (
            <div className="flex items-center gap-1 text-[8px] font-black text-red-500 animate-pulse bg-red-50 px-1.5 py-0.5 rounded border border-red-100 w-fit mt-0.5">
              <Timer className="w-2.5 h-2.5" />
              RUNNING
            </div>
          )}
          {ticket.inseraTicketId && (
            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-tighter bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 w-fit mt-0.5">
              {ticket.inseraTicketId}
            </span>
          )}
          {(() => {
            const isBlocked = ticket.dependsOn?.some(depId => {
              const dep = tickets.find(t => t.id === depId);
              return dep && dep.status !== 'resolved' && dep.status !== 'closed';
            });
            if (isBlocked) {
              return (
                <div className="flex items-center gap-1 text-[8px] font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 w-fit mt-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  BLOCKED
                </div>
              );
            }
            return null;
          })()}
          <div className={`mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border w-fit ${getPriorityColor(ticket.priority)}`}>
            {ticket.priority}
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 border border-black/5">
            <User className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-neutral-900">{ticket.customerName}</span>
            <span className="text-[10px] text-neutral-400 font-medium uppercase tracking-tighter">ID: {ticket.customerId?.slice(-6) || '---'}</span>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-neutral-700">{ticket.category}</span>
          <span className="text-[10px] text-neutral-400">{ticket.subCategory || 'General'}</span>
          {ticket.points !== undefined && (
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-2.5 h-2.5 text-emerald-500" />
              <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter">{ticket.points} PTS</span>
            </div>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <p className="text-sm text-neutral-600 line-clamp-1 max-w-[200px]">{stripHtml(ticket.description)}</p>
      </td>
      <td className="px-6 py-4">
        <div className="relative inline-block group/status">
          <div className={`absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${
            ticket.status === 'open' ? 'text-sky-500' :
            ticket.status === 'in-progress' ? 'text-amber-500' :
            ticket.status === 'resolved' ? 'text-emerald-500' :
            'text-slate-500'
          }`}>
            {ticket.status === 'open' && <AlertCircle className="w-3 h-3" />}
            {ticket.status === 'in-progress' && <Clock className="w-3 h-3" />}
            {ticket.status === 'resolved' && <CheckCircle2 className="w-3 h-3" />}
            {ticket.status === 'closed' && <X className="w-3 h-3" />}
          </div>
          <select
            value={ticket.status}
            onChange={(e) => handleStatusChange(ticket.id, e.target.value as TicketStatus)}
            className={`text-[10px] font-black uppercase tracking-tighter pl-7 pr-7 py-1.5 rounded-full border focus:ring-0 cursor-pointer transition-all appearance-none ${getStatusColor(ticket.status)}`}
          >
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-50 rotate-90 pointer-events-none" />
        </div>
      </td>
      <td className="px-6 py-4">
        {(() => {
          const sla = getSLAStatus(ticket);
          const remaining = getSLARemainingTime(ticket);
          return (
            <div className="flex flex-col gap-0.5">
              <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tighter ${
                sla === 'breached' ? 'text-rose-600' :
                sla === 'near-breach' ? 'text-amber-600 animate-pulse' :
                'text-emerald-600'
              }`}>
                <Clock className="w-3 h-3" />
                {sla === 'breached' ? 'Breached' : sla === 'near-breach' ? 'Near Breach' : 'Within SLA'}
              </div>
              {remaining && (
                <span className="text-[9px] text-neutral-400 font-medium ml-4.5">
                  {remaining.hours}h {remaining.mins}m {remaining.isPast ? 'overdue' : 'left'}
                </span>
              )}
            </div>
          );
        })()}
      </td>
      <td className="px-6 py-4">
        {ticket.dependsOn && ticket.dependsOn.length > 0 ? (
          (() => {
            const isBlocked = ticket.dependsOn.some(depId => {
              const dep = tickets.find(t => t.id === depId);
              return dep && dep.status !== 'resolved' && dep.status !== 'closed';
            });
            return (
              <div className={`flex items-center gap-1 text-[10px] font-bold ${isBlocked ? 'text-amber-600' : 'text-neutral-400'}`}>
                <LinkIcon className="w-3 h-3" />
                <span>{ticket.dependsOn.length} {isBlocked ? 'Blocked' : 'Deps'}</span>
                {isBlocked && <AlertTriangle className="w-3 h-3" />}
              </div>
            );
          })()
        ) : (
          <span className="text-neutral-300">---</span>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2 overflow-hidden">
            {ticket.technicianIds && ticket.technicianIds.length > 0 ? (
              ticket.technicianIds.map(techId => {
                const tech = technicians.find(t => t.id === techId);
                return (
                  <div key={techId} className="relative inline-block">
                    <div className="w-8 h-8 rounded-full ring-2 ring-white bg-neutral-100 flex items-center justify-center text-neutral-400 border border-black/5 overflow-hidden">
                      {tech?.photoURL ? (
                        <img src={resolvePhotoUrl(tech.photoURL)} alt="Tech" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                      tech?.availabilityStatus === 'Available' ? 'bg-emerald-500' :
                      tech?.availabilityStatus === 'Busy' ? 'bg-yellow-400' : 'bg-red-500'
                    }`} />
                  </div>
                );
              })
            ) : (
              <div className="w-8 h-8 rounded-full border-2 border-dashed border-neutral-200 flex items-center justify-center text-neutral-300">
                <UserPlus className="w-4 h-4" />
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <select
              value=""
              onChange={(e) => e.target.value && updateTechnician(ticket.id, e.target.value)}
              className="text-xs font-bold bg-transparent border-none focus:ring-0 text-neutral-500 cursor-pointer hover:text-emerald-600 transition-colors p-0 uppercase tracking-tighter"
            >
              <option value="">{ticket.technicianIds?.length ? `${ticket.technicianIds.length} Assigned` : 'Unassigned'}</option>
              {technicians.map(tech => (
                <option key={tech.id} value={tech.id}>
                  {ticket.technicianIds?.includes(tech.id) ? '✓ ' : '+ '}{tech.name}
                </option>
              ))}
            </select>
            {ticket.technicianIds && ticket.technicianIds.length > 0 && (
              <span className="text-[10px] text-neutral-400 font-medium">
                {ticket.technicianIds.map(id => technicians.find(t => t.id === id)?.name).join(', ')}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="relative inline-block group/priority">
          <select
            value={ticket.priority}
            onChange={(e) => updatePriority(ticket.id, e.target.value as TicketPriority)}
            className={`text-[10px] font-black uppercase tracking-tighter px-3 py-1 rounded-full border-none focus:ring-0 cursor-pointer transition-all appearance-none pr-7 ${getPriorityColor(ticket.priority)}`}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-50 rotate-90 pointer-events-none" />
        </div>
      </td>
      <td className="px-6 py-4 text-sm font-medium">
        {ticket.dueDate ? (
          <span className={`flex items-center gap-1.5 ${
            ticket.dueDate instanceof Timestamp && ticket.dueDate.toDate() < new Date() && ticket.status !== 'resolved' && ticket.status !== 'closed'
              ? 'text-red-600'
              : 'text-neutral-600'
          }`}>
            <Clock className="w-3.5 h-3.5" />
            {ticket.dueDate instanceof Timestamp ? ticket.dueDate.toDate().toLocaleDateString() : new Date(ticket.dueDate).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-neutral-400">---</span>
        )}
      </td>
      <td className="px-6 py-4 text-sm text-neutral-500">
        {ticket.createdAt instanceof Timestamp ? ticket.createdAt.toDate().toLocaleDateString() : '---'}
      </td>
      <td className="px-6 py-4 text-sm text-neutral-500">
        {ticket.updatedAt instanceof Timestamp ? ticket.updatedAt.toDate().toLocaleDateString() : '---'}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {isTechnician && myTechnicianId && !ticket.technicianIds?.includes(myTechnicianId) && (
            <button
              onClick={() => handleAssignToMe(ticket.id)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all shadow-sm text-[10px] font-bold uppercase tracking-wider"
              title="Assign to Me"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Assign to Me</span>
            </button>
          )}
          {(!ticket.technicianIds || ticket.technicianIds.length === 0) && (
            <button
              onClick={() => handleSmartAssign(ticket.id)}
              className="p-2 hover:bg-amber-50 text-amber-600 rounded-lg"
              title="Smart Assign"
            >
              <Zap className="w-4 h-4" />
            </button>
          )}
          <button 
            onClick={() => {
              setSelectedTicket(ticket);
              setIsAssignModalOpen(true);
            }}
            className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg"
            title="Assign Technicians"
          >
            <Users className="w-4 h-4" />
          </button>
          <button 
            onClick={() => {
              setSelectedTicket(ticket);
              setIsDependencyModalOpen(true);
            }}
            className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg"
            title="Link Dependencies"
          >
            <LinkIcon className="w-4 h-4" />
          </button>
          <button 
            onClick={() => {
              setSelectedTicketId(ticket.id);
              setIsRepairModalOpen(true);
            }}
            className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg"
            title="Record Repair"
          >
            <Wrench className="w-4 h-4" />
          </button>
          <button 
            onClick={() => handleStatusChange(ticket.id, 'in-progress')}
            className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg"
            title="Set In Progress"
          >
            <Clock className="w-4 h-4" />
          </button>
          {ticket.isTimerRunning ? (
            <button 
              onClick={() => handleStopTimer(ticket.id)}
              className="p-2 bg-red-50 text-red-600 rounded-lg animate-pulse"
              title="Stop Timer"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button 
              onClick={() => handleStartTimer(ticket.id)}
              className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg"
              title="Start Timer"
            >
              <Play className="w-4 h-4 fill-current" />
            </button>
          )}
          <button 
            onClick={() => handleStatusChange(ticket.id, 'resolved')}
            className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg"
            title="Resolve"
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => handleStatusChange(ticket.id, 'closed')}
            className="p-2 hover:bg-neutral-100 text-neutral-600 rounded-lg"
            title="Close Ticket"
          >
            <X className="w-4 h-4" />
          </button>
          <button 
            onClick={() => {
              setSelectedTicket(ticket);
              setIsDetailsModalOpen(true);
            }}
            className="p-2 hover:bg-neutral-100 text-neutral-500 rounded-lg"
            title="View Details"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button className="p-2 hover:bg-neutral-100 text-neutral-500 rounded-lg">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
