import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Edit2, Check } from 'lucide-react';
import { TicketStatus, Technician } from '../types';

interface BulkUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  bulkData: {
    status: TicketStatus | '';
    technicianId: string | '';
  };
  setBulkData: React.Dispatch<React.SetStateAction<any>>;
  technicians: Technician[];
  handleBulkUpdate: () => void;
  selectedCount: number;
}

export default function BulkUpdateModal({
  isOpen,
  onClose,
  bulkData,
  setBulkData,
  technicians,
  handleBulkUpdate,
  selectedCount
}: BulkUpdateModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="px-8 py-6 border-b border-black/5 flex items-center justify-between bg-emerald-600 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tight">Bulk Edit</h2>
                  <p className="text-emerald-100 text-[10px] font-bold uppercase tracking-widest mt-0.5">Updating {selectedCount} tickets</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Update Status</label>
                <select
                  value={bulkData.status}
                  onChange={(e) => setBulkData({ ...bulkData, status: e.target.value as TicketStatus })}
                  className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium appearance-none"
                >
                  <option value="">No Change</option>
                  <option value="open">Open</option>
                  <option value="in-progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Assign Technician</label>
                <select
                  value={bulkData.technicianId}
                  onChange={(e) => setBulkData({ ...bulkData, technicianId: e.target.value })}
                  className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium appearance-none"
                >
                  <option value="">No Change</option>
                  {technicians.map(tech => (
                    <option key={tech.id} value={tech.id}>{tech.name}</option>
                  ))}
                </select>
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
                onClick={handleBulkUpdate}
                disabled={!bulkData.status && !bulkData.technicianId}
                className="flex items-center gap-2 px-8 py-2.5 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-5 h-5" />
                Apply Changes
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
