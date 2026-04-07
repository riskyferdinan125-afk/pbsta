import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Edit2, Check } from 'lucide-react';
import { TicketStatus, Technician } from '../types';

interface BulkUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  bulkData: {
    status: TicketStatus | '';
    technicianIds: string[];
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

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Assign Technicians</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-neutral-50 rounded-2xl border border-black/5">
                  <button
                    onClick={() => {
                      if (bulkData.technicianIds.length === 0) {
                        setBulkData({ ...bulkData, technicianIds: ['unassigned'] });
                      } else {
                        setBulkData({ ...bulkData, technicianIds: [] });
                      }
                    }}
                    className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold transition-all border ${
                      bulkData.technicianIds.includes('unassigned')
                        ? 'bg-red-50 border-red-200 text-red-600'
                        : 'bg-white border-black/5 text-neutral-500 hover:border-red-200'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                      bulkData.technicianIds.includes('unassigned') ? 'bg-red-500 border-red-500 text-white' : 'border-black/10'
                    }`}>
                      {bulkData.technicianIds.includes('unassigned') && <Check className="w-3 h-3" />}
                    </div>
                    Unassign All
                  </button>
                  {technicians.map(tech => {
                    const isSelected = bulkData.technicianIds.includes(tech.id);
                    return (
                      <button
                        key={tech.id}
                        onClick={() => {
                          let newIds = [...bulkData.technicianIds.filter(id => id !== 'unassigned')];
                          if (isSelected) {
                            newIds = newIds.filter(id => id !== tech.id);
                          } else {
                            newIds.push(tech.id);
                          }
                          setBulkData({ ...bulkData, technicianIds: newIds });
                        }}
                        className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold transition-all border ${
                          isSelected
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                            : 'bg-white border-black/5 text-neutral-500 hover:border-emerald-200'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-black/10'
                        }`}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                        <span className="truncate">{tech.name}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-neutral-400 italic ml-1">
                  {bulkData.technicianIds.length > 0 
                    ? `Selected ${bulkData.technicianIds.includes('unassigned') ? 'Unassign All' : `${bulkData.technicianIds.length} technicians`}`
                    : 'No changes to assignments'}
                </p>
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
                disabled={!bulkData.status && bulkData.technicianIds.length === 0}
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
