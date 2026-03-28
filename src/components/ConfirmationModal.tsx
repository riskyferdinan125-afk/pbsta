import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmLabel?: string;
  onCancel?: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  title,
  message,
  onConfirm,
  confirmLabel = 'Confirm',
  onCancel,
  variant = 'warning'
}: ConfirmationModalProps) {
  const handleCancel = onCancel || onClose || (() => {});
  const handleClose = onClose || onCancel || (() => {});

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-sm overflow-hidden"
          >
            <div className="p-6 text-center space-y-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
                variant === 'danger' ? 'bg-red-100 text-red-600' :
                variant === 'info' ? 'bg-blue-100 text-blue-600' :
                'bg-orange-100 text-orange-600'
              }`}>
                <AlertCircle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-neutral-900">{title}</h3>
                <p className="text-sm text-neutral-500 mt-2">{message}</p>
              </div>
            </div>
            <div className="p-6 bg-neutral-50 flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 py-3 px-4 border border-black/10 rounded-2xl font-bold text-neutral-600 hover:bg-neutral-100 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  handleClose();
                }}
                className={`flex-1 py-3 px-4 text-white rounded-2xl font-bold transition-all shadow-xl ${
                  variant === 'danger' ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' :
                  variant === 'info' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20' :
                  'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
