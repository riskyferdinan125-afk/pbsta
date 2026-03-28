import React, { useState, useEffect } from 'react';
import { X, Link as LinkIcon, Save, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { Ticket } from '../types';
import TicketSelector from './TicketSelector';

interface DependencyManagerModalProps {
  ticket: Ticket & { customerName?: string };
  allTickets: (Ticket & { customerName?: string })[];
  onClose: () => void;
}

export default function DependencyManagerModal({ ticket, allTickets, onClose }: DependencyManagerModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(ticket.dependsOn || []);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'tickets', ticket.id), {
        dependsOn: selectedIds,
        updatedAt: serverTimestamp()
      });

      // Log the change in history
      await addDoc(collection(db, 'ticketHistory'), {
        ticketId: ticket.id,
        type: 'dependency_change',
        fromValue: (ticket.dependsOn || []).length.toString(),
        toValue: selectedIds.length.toString(),
        changedBy: auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp()
      });

      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-black/5 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <LinkIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900">Manage Dependencies</h3>
              <p className="text-xs text-neutral-500">For Ticket #{ticket.ticketNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
            <p className="text-xs text-emerald-800 leading-relaxed">
              Select tickets that must be <strong>Resolved</strong> or <strong>Closed</strong> before this ticket can be started.
            </p>
          </div>

          <TicketSelector
            tickets={allTickets}
            selectedIds={selectedIds}
            onSelect={(id) => setSelectedIds([...selectedIds, id])}
            onDeselect={(id) => setSelectedIds(selectedIds.filter(sid => sid !== id))}
            excludeId={ticket.id}
          />
        </div>

        <div className="p-6 border-t border-black/5 bg-neutral-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 border border-black/10 rounded-2xl font-bold text-neutral-600 hover:bg-neutral-100 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Links
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
