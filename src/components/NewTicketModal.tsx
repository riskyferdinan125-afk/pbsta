import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Search, 
  User, 
  Tag, 
  AlertCircle, 
  Calendar, 
  Mail, 
  Link as LinkIcon,
  Check
} from 'lucide-react';
import { Customer, Technician, TicketCategory, TicketPriority, TicketStatus } from '../types';
import TicketSelector from './TicketSelector';

interface NewTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  newTicket: any;
  setNewTicket: React.Dispatch<React.SetStateAction<any>>;
  customerSearch: string;
  setCustomerSearch: (search: string) => void;
  isCustomerDropdownOpen: boolean;
  setIsCustomerDropdownOpen: (isOpen: boolean) => void;
  customers: Customer[];
  technicians: Technician[];
  tickets: any[];
  saveTicket: (e: React.FormEvent) => void;
}

export default function NewTicketModal({
  isOpen,
  onClose,
  newTicket,
  setNewTicket,
  customerSearch,
  setCustomerSearch,
  isCustomerDropdownOpen,
  setIsCustomerDropdownOpen,
  customers,
  technicians,
  tickets,
  saveTicket
}: NewTicketModalProps) {
  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.customerId.toLowerCase().includes(customerSearch.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="px-8 py-6 border-b border-black/5 flex items-center justify-between bg-emerald-600 text-white">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Create New Ticket</h2>
                <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest mt-1">Fill in the details below</p>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer Selection */}
                <div className="space-y-2 relative customer-dropdown-container">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Customer</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="text"
                      placeholder="Search customer name or ID..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setIsCustomerDropdownOpen(true);
                      }}
                      onFocus={() => setIsCustomerDropdownOpen(true)}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium"
                    />
                  </div>
                  
                  {isCustomerDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-black/5 rounded-2xl shadow-xl max-h-60 overflow-y-auto py-2">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map(customer => (
                          <button
                            key={customer.id}
                            onClick={() => {
                              setNewTicket({ ...newTicket, customerId: customer.id });
                              setCustomerSearch(customer.name);
                              setIsCustomerDropdownOpen(false);
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-neutral-50 flex items-center gap-3 transition-colors"
                          >
                            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">
                              {customer.name.charAt(0)}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-neutral-900">{customer.name}</div>
                              <div className="text-[10px] text-neutral-400 font-mono">{customer.customerId}</div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-sm text-neutral-400 italic">No customers found</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Category</label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <select
                      value={newTicket.category}
                      onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value as TicketCategory, subCategory: '' })}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium appearance-none"
                    >
                      <option value="PROJECT">PROJECT</option>
                      <option value="REGULER">REGULER</option>
                      <option value="PSB">PSB</option>
                      <option value="SQM">SQM</option>
                      <option value="UNSPEKS">UNSPEKS</option>
                      <option value="EXBIS">EXBIS</option>
                      <option value="CORRECTIVE">CORRECTIVE</option>
                      <option value="PREVENTIVE">PREVENTIVE</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Sub-Category */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Sub Category</label>
                  <input
                    type="text"
                    placeholder="Enter sub-category..."
                    value={newTicket.subCategory}
                    onChange={(e) => setNewTicket({ ...newTicket, subCategory: e.target.value })}
                    className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium"
                  />
                </div>

                {/* Priority */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Priority</label>
                  <div className="relative">
                    <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <select
                      value={newTicket.priority}
                      onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value as TicketPriority })}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium appearance-none"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                {/* Due Date */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Due Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="datetime-local"
                      value={newTicket.dueDate}
                      onChange={(e) => setNewTicket({ ...newTicket, dueDate: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Customer Email */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Customer Email (Optional)</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="email"
                      placeholder="customer@example.com"
                      value={newTicket.email}
                      onChange={(e) => setNewTicket({ ...newTicket, email: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Description</label>
                <textarea
                  placeholder="Describe the issue or task..."
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium resize-none"
                />
              </div>

              {/* Technician Assignment */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Assign Technicians</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {technicians.map(tech => (
                    <button
                      key={tech.id}
                      onClick={() => {
                        const isSelected = newTicket.technicianIds.includes(tech.id);
                        setNewTicket({
                          ...newTicket,
                          technicianIds: isSelected
                            ? newTicket.technicianIds.filter((id: string) => id !== tech.id)
                            : [...newTicket.technicianIds, tech.id]
                        });
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-left ${
                        newTicket.technicianIds.includes(tech.id)
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-white border-black/5 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${newTicket.technicianIds.includes(tech.id) ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
                      <span className="text-xs font-bold truncate">{tech.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dependencies */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Dependencies (Optional)</label>
                <TicketSelector
                  tickets={tickets}
                  selectedIds={newTicket.dependsOn}
                  onSelect={(id) => setNewTicket({ ...newTicket, dependsOn: [...newTicket.dependsOn, id] })}
                  onDeselect={(id) => setNewTicket({ ...newTicket, dependsOn: newTicket.dependsOn.filter((sid: string) => sid !== id) })}
                />
              </div>
            </div>

            <div className="px-8 py-6 bg-neutral-50 border-t border-black/5 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-sm font-bold text-neutral-500 hover:text-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveTicket}
                disabled={!newTicket.customerId || !newTicket.description}
                className="flex items-center gap-2 px-8 py-2.5 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-5 h-5" />
                Create Ticket
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
