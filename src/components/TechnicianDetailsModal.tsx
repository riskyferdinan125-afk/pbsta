import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Technician, AvailabilityStatus, Ticket, RepairRecord } from '../types';
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
  CheckCircle2,
  Send,
  Home,
  FileText,
  History,
  ClipboardList,
  Wrench,
  ChevronRight,
  Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TechnicianDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  technician: Technician | null;
}

export default function TechnicianDetailsModal({ isOpen, onClose, technician }: TechnicianDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');
  const [assignedTickets, setAssignedTickets] = useState<Ticket[]>([]);
  const [repairRecords, setRepairRecords] = useState<RepairRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (isOpen && technician && activeTab === 'history') {
      fetchHistory();
    }
  }, [isOpen, technician, activeTab]);

  const fetchHistory = async () => {
    if (!technician) return;
    setLoadingHistory(true);
    try {
      // Fetch tickets assigned to this technician
      const ticketsQuery = query(
        collection(db, 'tickets'),
        where('technicianIds', 'array-contains', technician.id),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const ticketsSnap = await getDocs(ticketsQuery);
      setAssignedTickets(ticketsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket)));

      // Fetch repair records by this technician
      const recordsQuery = query(
        collection(db, 'repairRecords'),
        where('technicianId', '==', technician.id),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const recordsSnap = await getDocs(recordsQuery);
      setRepairRecords(recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RepairRecord)));
    } catch (error) {
      console.error("Error fetching technician history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

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
              
              {/* Tabs */}
              <div className="absolute bottom-0 left-0 right-0 flex justify-center">
                <div className="flex bg-white/10 backdrop-blur-md p-1 rounded-t-2xl border-x border-t border-white/20">
                  <button
                    onClick={() => setActiveTab('info')}
                    className={`px-6 py-2 rounded-t-xl text-xs font-bold uppercase tracking-widest transition-all ${
                      activeTab === 'info' 
                        ? 'bg-white text-emerald-700 shadow-lg' 
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    Profile Info
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`px-6 py-2 rounded-t-xl text-xs font-bold uppercase tracking-widest transition-all ${
                      activeTab === 'history' 
                        ? 'bg-white text-emerald-700 shadow-lg' 
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    Assignment History
                  </button>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div className="px-8 pb-8 pt-6 relative flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                {activeTab === 'info' ? (
                  <motion.div
                    key="info"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    <div className="flex flex-col md:flex-row md:items-end gap-6 mb-8 -mt-16">
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
                          {technician.title || technician.role || 'General Technician'}
                          {technician.specialization && (
                            <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase rounded-md border border-emerald-200">
                              {technician.specialization}
                            </span>
                          )}
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
                            {technician.telegramId && (
                              <div className="flex items-start gap-4 p-3 rounded-2xl bg-neutral-50 border border-black/5">
                                <div className="p-2 bg-white rounded-xl shadow-sm text-neutral-400">
                                  <Send className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Telegram ID</p>
                                  <p className="text-sm font-medium text-neutral-900">{technician.telegramId}</p>
                                </div>
                              </div>
                            )}
                            {technician.address && (
                              <div className="flex items-start gap-4 p-3 rounded-2xl bg-neutral-50 border border-black/5">
                                <div className="p-2 bg-white rounded-xl shadow-sm text-neutral-400">
                                  <Home className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Address</p>
                                  <p className="text-sm font-medium text-neutral-900">{technician.address}</p>
                                </div>
                              </div>
                            )}
                            {technician.bio && (
                              <div className="flex items-start gap-4 p-3 rounded-2xl bg-neutral-50 border border-black/5">
                                <div className="p-2 bg-white rounded-xl shadow-sm text-neutral-400">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Bio / Notes</p>
                                  <p className="text-sm font-medium text-neutral-900 whitespace-pre-wrap">{technician.bio}</p>
                                </div>
                              </div>
                            )}
                            {technician.location && (
                              <div className="flex items-start gap-4 p-3 rounded-2xl bg-neutral-50 border border-black/5">
                                <div className="p-2 bg-white rounded-xl shadow-sm text-neutral-400">
                                  <MapPin className="w-4 h-4" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Last Known Location</p>
                                  <div className="flex items-center justify-between mt-1">
                                    <p className="text-xs font-medium text-neutral-900">
                                      {technician.location.lat.toFixed(4)}, {technician.location.lng.toFixed(4)}
                                    </p>
                                    <a 
                                      href={`https://www.google.com/maps?q=${technician.location.lat},${technician.location.lng}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-1"
                                    >
                                      Google Maps
                                    </a>
                                  </div>
                                  <p className="text-[10px] text-neutral-400 mt-1">
                                    Updated: {technician.location.updatedAt?.toDate().toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            )}
                            
                            {technician.skills && technician.skills.length > 0 && (
                              <div className="flex items-start gap-4 p-3 rounded-2xl bg-neutral-50 border border-black/5">
                                <div className="p-2 bg-white rounded-xl shadow-sm text-neutral-400">
                                  <CheckCircle2 className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Skills & Expertise</p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {technician.skills.map(skill => (
                                      <span key={skill} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-md border border-blue-100">
                                        {skill}
                                      </span>
                                    ))}
                                  </div>
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
                  </motion.div>
                ) : (
                  <motion.div
                    key="history"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-8"
                  >
                    {/* Recent Assignments */}
                    <div>
                      <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" /> Recent Assignments
                      </h3>
                      <div className="space-y-3">
                        {loadingHistory ? (
                          [1, 2].map(i => (
                            <div key={i} className="h-20 bg-neutral-50 rounded-2xl border border-black/5 animate-pulse" />
                          ))
                        ) : assignedTickets.length > 0 ? (
                          assignedTickets.map(ticket => (
                            <div key={ticket.id} className="p-4 bg-neutral-50 border border-black/5 rounded-2xl flex items-center justify-between group hover:bg-white hover:shadow-lg transition-all">
                              <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                  ticket.status === 'resolved' ? 'bg-emerald-100 text-emerald-600' :
                                  ticket.status === 'in-progress' ? 'bg-blue-100 text-blue-600' :
                                  'bg-neutral-100 text-neutral-600'
                                }`}>
                                  <ClipboardList className="w-5 h-5" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">#{ticket.ticketNumber}</span>
                                    <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${
                                      ticket.status === 'resolved' ? 'bg-emerald-500 text-white' :
                                      ticket.status === 'in-progress' ? 'bg-blue-500 text-white' :
                                      'bg-neutral-400 text-white'
                                    }`}>
                                      {ticket.status}
                                    </span>
                                  </div>
                                  <p className="text-sm font-bold text-neutral-900 truncate max-w-[200px]">{ticket.description}</p>
                                  <p className="text-[10px] text-neutral-400">
                                    Assigned: {ticket.createdAt?.toDate().toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <ChevronRight className="w-5 h-5 text-neutral-300 group-hover:text-emerald-600 transition-colors" />
                            </div>
                          ))
                        ) : (
                          <div className="py-8 text-center bg-neutral-50 rounded-2xl border border-dashed border-neutral-200">
                            <p className="text-xs text-neutral-400">No recent assignments found.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Repair Records */}
                    <div>
                      <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Wrench className="w-4 h-4" /> Repair Records
                      </h3>
                      <div className="space-y-3">
                        {loadingHistory ? (
                          [1, 2].map(i => (
                            <div key={i} className="h-24 bg-neutral-50 rounded-2xl border border-black/5 animate-pulse" />
                          ))
                        ) : repairRecords.length > 0 ? (
                          repairRecords.map(record => (
                            <div key={record.id} className="p-4 bg-neutral-50 border border-black/5 rounded-2xl space-y-3 hover:bg-white hover:shadow-lg transition-all">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                    record.type === 'Physical' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {record.type} Repair
                                  </span>
                                  <span className="text-[10px] text-neutral-400">
                                    {record.createdAt?.toDate().toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] font-bold text-neutral-500">
                                  <Clock className="w-3 h-3" />
                                  {record.startTime?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {record.endTime?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                              <p className="text-sm text-neutral-700 line-clamp-2 italic">"{record.notes}"</p>
                              <div className="flex items-center gap-4 pt-2 border-t border-black/5">
                                <div className="flex items-center gap-1 text-[10px] font-medium text-neutral-400">
                                  <Package className="w-3 h-3" />
                                  {record.materialsUsed?.length || 0} Materials
                                </div>
                                <div className="flex items-center gap-1 text-[10px] font-medium text-neutral-400">
                                  <Briefcase className="w-3 h-3" />
                                  {record.jobsUsed?.length || 0} Jobs
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="py-8 text-center bg-neutral-50 rounded-2xl border border-dashed border-neutral-200">
                            <p className="text-xs text-neutral-400">No repair records found.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {!loadingHistory && assignedTickets.length === 0 && repairRecords.length === 0 && (
                      <div className="py-12 text-center">
                        <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-4">
                          <History className="w-8 h-8 text-neutral-200" />
                        </div>
                        <h4 className="text-sm font-bold text-neutral-900">No History Available</h4>
                        <p className="text-xs text-neutral-500 max-w-[200px] mx-auto mt-1">
                          This technician hasn't been assigned to any tickets or recorded any repairs yet.
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

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
