import React, { useState } from 'react';
import { Search, Check, X } from 'lucide-react';
import { Ticket } from '../types';

interface TicketSelectorProps {
  tickets: (Ticket & { customerName?: string })[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onDeselect: (id: string) => void;
  excludeId?: string;
}

export default function TicketSelector({ tickets, selectedIds, onSelect, onDeselect, excludeId }: TicketSelectorProps) {
  const [search, setSearch] = useState('');

  const filteredTickets = tickets.filter(t => 
    t.id !== excludeId &&
    (t.customerName?.toLowerCase().includes(search.toLowerCase()) ||
     t.description.toLowerCase().includes(search.toLowerCase()) ||
     t.ticketNumber?.toString().includes(search))
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Search tickets to link..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
        />
      </div>

      <div className="max-h-48 overflow-y-auto border border-black/5 rounded-xl divide-y divide-black/5">
        {filteredTickets.length > 0 ? (
          filteredTickets.map(ticket => {
            const isSelected = selectedIds.includes(ticket.id);
            return (
              <div 
                key={ticket.id}
                onClick={() => isSelected ? onDeselect(ticket.id) : onSelect(ticket.id)}
                className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                  isSelected ? 'bg-emerald-50/50' : 'hover:bg-neutral-50'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-neutral-400">#{ticket.ticketNumber}</span>
                    <span className="text-sm font-bold text-neutral-900">{ticket.customerName}</span>
                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                      ticket.status === 'resolved' || ticket.status === 'closed' 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {ticket.status.replace('-', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 truncate max-w-[200px]">{ticket.description}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                  isSelected 
                    ? 'bg-emerald-600 border-emerald-600 text-white' 
                    : 'border-black/10 bg-white'
                }`}>
                  {isSelected && <Check className="w-3 h-3" />}
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center">
            <p className="text-sm text-neutral-400 italic">No tickets found</p>
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {selectedIds.map(id => {
            const ticket = tickets.find(t => t.id === id);
            if (!ticket) return null;
            return (
              <div key={id} className="flex items-center gap-1.5 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-emerald-200">
                <span>#{ticket.ticketNumber}</span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeselect(id);
                  }}
                  className="hover:text-emerald-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
