import React from 'react';
import { Technician, AvailabilityStatus } from '../types';
import { 
  X, 
  Mail, 
  Phone, 
  Briefcase, 
  Calendar, 
  Clock, 
  User, 
  Activity,
  Shield,
  MapPin,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TechnicianDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  technician: Technician | null;
}

export default function TechnicianDetailsModal({ isOpen, onClose, technician }: TechnicianDetailsModalProps) {
  if (!technician) return null;

  const resolvePhotoUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')) return url;
    if (!url.includes('/')) {
      return `/api/telegram-photo/${url}`;
    }
    return url;
  };

  const getStatusColor = (status?: AvailabilityStatus) => {
    switch (status) {
      case 'Available': return 'bg-emerald-500';
      case 'Busy': return 'bg-yellow-400';
      case 'On Leave': return 'bg-red-500';
      case 'Offline': return 'bg-neutral-400';
      default: return 'bg-neutral-400';
    }
  };

  const getStatusBg = (status?: AvailabilityStatus) => {
    switch (status) {
      case 'Available': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'Busy': return 'bg-yellow-50 text-yellow-700 border-yellow-100';
      case 'On Leave': return 'bg-red-50 text-red-700 border-red-100';
      case 'Offline': return 'bg-neutral-50 text-neutral-600 border-neutral-200';
      default: return 'bg-neutral-50 text-neutral-600 border-neutral-200';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header / Cover */}
            <div className="relative h-32 bg-gradient-to-r from-emerald-600 to-teal-600 shrink-0">
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full backdrop-blur-md transition-all z-10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Info Overlay */}
            <div className="px-8 pb-8 -mt-12 relative flex-1 overflow-y-auto">
              <div className="flex flex-col md:flex-row md:items-end gap-6 mb-8">
                <div className="w-32 h-32 rounded-3xl bg-white p-1 shadow-xl shrink-0">
                  <div className="w-full h-full rounded-2xl bg-neutral-100 flex items-center justify-center overflow-hidden border border-black/5">
                    {technician.photoURL ? (
                      <img 
                        src={resolvePhotoUrl(technician.photoURL)} 
                        alt={technician.name} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User className="w-12 h-12 text-neutral-300" />
                    )}
                  </div>
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-bold text-neutral-900">{technician.name}</h2>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStatusBg(technician.availabilityStatus)}`}>
                      {technician.availabilityStatus}
                    </div>
                  </div>
                  <p className="text-emerald-600 font-semibold flex items-center gap-2">
                    <Briefcase className="w-4 h-4" />
                    {technician.role || 'General Technician'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column: Contact & Identity */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Identity & Contact</h3>
                    <div className="space-y-4">
                      {technician.nik && (
                        <div className="flex items-start gap-4 p-3 rounded-2xl bg-neutral-50 border border-black/5">
                          <div className="p-2 bg-white rounded-xl shadow-sm text-neutral-400">
                            <Shield className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">NIK (National ID)</p>
                            <p className="text-sm font-mono font-medium text-neutral-900">{technician.nik}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-4 p-3 rounded-2xl bg-neutral-50 border border-black/5">
                        <div className="p-2 bg-white rounded-xl shadow-sm text-neutral-400">
                          <Mail className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Email Address</p>
                          <p className="text-sm font-medium text-neutral-900">{technician.email}</p>
                        </div>
                      </div>
                      {technician.phone && (
                        <div className="flex items-start gap-4 p-3 rounded-2xl bg-neutral-50 border border-black/5">
                          <div className="p-2 bg-white rounded-xl shadow-sm text-neutral-400">
                            <Phone className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Phone Number</p>
                            <p className="text-sm font-medium text-neutral-900">{technician.phone}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Schedule & Status */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Work Schedule</h3>
                    <div className="space-y-4">
                      <div className="flex items-start gap-4 p-3 rounded-2xl bg-neutral-50 border border-black/5">
                        <div className="p-2 bg-white rounded-xl shadow-sm text-neutral-400">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Working Days</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {technician.workingDays?.map(day => (
                              <span key={day} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-md">
                                {day}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-3 rounded-2xl bg-neutral-50 border border-black/5">
                        <div className="p-2 bg-white rounded-xl shadow-sm text-neutral-400">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Working Hours</p>
                          <p className="text-sm font-medium text-neutral-900">{technician.workingHours || 'Not specified'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-3 rounded-2xl bg-neutral-50 border border-black/5">
                        <div className="p-2 bg-white rounded-xl shadow-sm text-neutral-400">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Current Status</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className={`w-2 h-2 rounded-full ${getStatusColor(technician.availabilityStatus)} shadow-sm`} />
                            <p className="text-sm font-medium text-neutral-900">{technician.availabilityStatus}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="mt-12 pt-6 border-t border-black/5 flex justify-end">
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-bold text-sm hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-900/10"
                >
                  Close Details
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
