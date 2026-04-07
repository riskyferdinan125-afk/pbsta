import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, writeBatch, serverTimestamp, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { Technician, AvailabilityStatus, UserProfile } from '../types';
import { Plus, Search, Wrench, Mail, Phone, Briefcase, Edit2, Trash2, X, Calendar, Camera, Upload, Activity, Eye, MapPin, User, Zap, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow } from '@vis.gl/react-google-maps';
import ConfirmationModal from './ConfirmationModal';
import TechnicianDetailsModal from './TechnicianDetailsModal';
import { useToast } from './Toast';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidMapsKey = Boolean(API_KEY) && API_KEY !== '';

interface TechnicianListProps {
  profile: UserProfile | null;
}

export default function TechnicianList({ profile }: TechnicianListProps) {
  const resolvePhotoUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')) return url;
    if (!url.includes('/')) {
      return `/api/telegram-photo/${url}`;
    }
    return url;
  };
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AvailabilityStatus | 'All'>('All');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedDetailsTech, setSelectedDetailsTech] = useState<Technician | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id?: string; isBulk?: boolean }>({ isOpen: false });
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [selectedMarker, setSelectedMarker] = useState<Technician | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    nik: '',
    email: '',
    phone: '',
    telegramId: '',
    address: '',
    title: '',
    role: 'teknisi',
    password: '',
    photoURL: '',
    availabilityStatus: 'Available' as any,
    workingDays: [] as string[],
    workingHours: '',
    skills: '',
    specialization: '',
    bio: ''
  });

  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'teknisi'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTechnicians(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as Technician)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return unsubscribe;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.name.trim()) { setError('Name is required'); return; }
    if (!formData.email.trim()) { setError('Email is required'); return; }
    if (!formData.role.trim()) { setError('Role is required'); return; }
    if (formData.workingDays.length === 0) { setError('Please select at least one working day'); return; }
    if (!formData.workingHours.trim()) { setError('Working hours are required'); return; }

    try {
      const skillsArray = formData.skills.split(',').map(s => s.trim()).filter(Boolean);
      const { password, ...otherData } = formData;
      const dataToSave: any = {
        ...otherData,
        skills: skillsArray,
        updatedAt: serverTimestamp()
      };

      if (password) {
        dataToSave.password = password;
      }

      if (editingTech) {
        await updateDoc(doc(db, 'users', editingTech.id), dataToSave);
        showToast('Technician updated successfully', 'success');
      } else {
        await addDoc(collection(db, 'users'), {
          ...dataToSave,
          createdAt: serverTimestamp()
        });
        showToast('Technician added successfully', 'success');
      }
      closeModal();
    } catch (error) {
      handleFirestoreError(error, editingTech ? OperationType.UPDATE : OperationType.CREATE, 'users');
      showToast('Failed to save technician', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const confirmSingleDelete = async () => {
    if (!confirmDelete.id) return;
    try {
      await deleteDoc(doc(db, 'users', confirmDelete.id));
      setConfirmDelete({ isOpen: false });
      showToast('Technician deleted successfully', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${confirmDelete.id}`);
      showToast('Failed to delete technician', 'error');
    }
  };

  const handleBulkDelete = async () => {
    setConfirmDelete({ isOpen: true, isBulk: true });
  };

  const confirmBulkDelete = async () => {
    try {
      const batch = writeBatch(db);
      selectedTechIds.forEach(id => {
        batch.delete(doc(db, 'users', id));
      });
      await batch.commit();
      setSelectedTechIds([]);
      setConfirmDelete({ isOpen: false });
      showToast(`${selectedTechIds.length} technicians deleted`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'users/bulk');
      showToast('Failed to delete technicians', 'error');
    }
  };

  const handleBulkStatusUpdate = async (status: AvailabilityStatus) => {
    try {
      const batch = writeBatch(db);
      selectedTechIds.forEach(id => {
        batch.update(doc(db, 'users', id), { availabilityStatus: status });
      });
      await batch.commit();
      setSelectedTechIds([]);
      setIsBulkStatusModalOpen(false);
      showToast(`Status updated for ${selectedTechIds.length} technicians`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users/bulk-status');
      showToast('Failed to update status', 'error');
    }
  };

  const updateTechStatus = async (id: string, status: AvailabilityStatus) => {
    try {
      await updateDoc(doc(db, 'users', id), { 
        availabilityStatus: status,
        updatedAt: serverTimestamp()
      });
      showToast(`Status updated to ${status}`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${id}`);
      showToast('Failed to update status', 'error');
    }
  };

  const toggleSelectTech = (id: string) => {
    setSelectedTechIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const openDetails = (tech: Technician) => {
    setSelectedDetailsTech(tech);
    setIsDetailsModalOpen(true);
  };

  const openModal = (tech?: Technician) => {
    if (tech) {
      setEditingTech(tech);
      setFormData({
        name: tech.name,
        nik: tech.nik || '',
        email: tech.email,
        phone: tech.phone || '',
        telegramId: tech.telegramId || '',
        address: tech.address || '',
        title: tech.title || '',
        role: tech.role || 'teknisi',
        password: '',
        photoURL: tech.photoURL || '',
        availabilityStatus: tech.availabilityStatus || 'Available',
        workingDays: tech.workingDays || [],
        workingHours: tech.workingHours || '',
        skills: tech.skills?.join(', ') || '',
        specialization: tech.specialization || '',
        bio: tech.bio || ''
      });
    } else {
      setEditingTech(null);
      setFormData({ name: '', nik: '', email: '', phone: '', telegramId: '', address: '', title: '', role: 'teknisi', password: '', photoURL: '', availabilityStatus: 'Available', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], workingHours: '08:00-17:00', skills: '', specialization: '', bio: '' });
    }
    setIsModalOpen(true);
    setError(null);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTech(null);
    setFormData({ name: '', nik: '', email: '', phone: '', telegramId: '', address: '', title: '', role: 'teknisi', password: '', photoURL: '', availabilityStatus: 'Available', workingDays: [], workingHours: '', skills: '', specialization: '', bio: '' });
    setError(null);
    setUploading(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Image size must be less than 2MB');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const storageRef = ref(storage, `technicians/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      setFormData(prev => ({ ...prev, photoURL: downloadURL }));
    } catch (error) {
      console.error('Error uploading photo:', error);
      setError('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const uniqueRoles = Array.from(new Set(technicians.map(t => t.role).filter(Boolean))) as string[];

  const filteredTechs = technicians.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.role?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'All' || t.availabilityStatus === statusFilter;
    const matchesRole = roleFilter === 'All' || t.role === roleFilter;

    return matchesSearch && matchesStatus && matchesRole;
  });

  const canManage = profile?.role === 'superadmin' || profile?.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col md:flex-row gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search technicians..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 bg-white border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="All">All Status</option>
              <option value="Available">Available</option>
              <option value="Busy">Busy</option>
              <option value="On Leave">On Leave</option>
            </select>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="All">All Roles</option>
              {uniqueRoles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <div className="flex items-center bg-white border border-black/5 rounded-xl p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-emerald-50 text-emerald-600' : 'text-neutral-400 hover:text-neutral-600'}`}
                title="Grid View"
              >
                <Briefcase className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'map' ? 'bg-emerald-50 text-emerald-600' : 'text-neutral-400 hover:text-neutral-600'}`}
                title="Map View"
              >
                <MapPin className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {canManage && selectedTechIds.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100"
              >
                <span className="text-xs font-bold text-emerald-700 mr-2 whitespace-nowrap">
                  {selectedTechIds.length} Selected
                </span>
                <button
                  onClick={() => setIsBulkStatusModalOpen(true)}
                  className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                  title="Update Status"
                >
                  <Activity className="w-4 h-4" />
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete Selected"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedTechIds([])}
                  className="p-1.5 text-neutral-400 hover:bg-neutral-100 rounded-lg transition-colors"
                  title="Clear Selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {canManage && (
            <button
              onClick={() => openModal()}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 whitespace-nowrap"
            >
              <Plus className="w-5 h-5" />
              Add Technician
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {viewMode === 'grid' ? (
          loading ? (
            [1,2,3].map(i => <div key={i} className="h-48 bg-white rounded-2xl border border-black/5 animate-pulse"></div>)
          ) : filteredTechs.length > 0 ? filteredTechs.map((tech) => (
            <motion.div
              layout
              key={tech.id}
              className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm hover:shadow-md transition-all group relative"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {canManage && (
                    <input 
                      type="checkbox" 
                      className="rounded border-black/10 text-emerald-600 focus:ring-emerald-500/20"
                      checked={selectedTechIds.includes(tech.id)}
                      onChange={() => toggleSelectTech(tech.id)}
                    />
                  )}
                  <div 
                    onClick={() => openDetails(tech)}
                    className="w-14 h-14 bg-neutral-50 text-neutral-400 rounded-2xl flex items-center justify-center overflow-hidden border border-black/5 shadow-inner cursor-pointer hover:border-emerald-500/50 transition-all"
                  >
                    {tech.photoURL ? (
                      <img 
                        src={resolvePhotoUrl(tech.photoURL)} 
                        alt={tech.name} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Wrench className="w-7 h-7" />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => openDetails(tech)}
                    className="p-2 hover:bg-neutral-100 text-neutral-500 rounded-lg"
                    title="View Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {(canManage || profile?.email === tech.email) && (
                    <button 
                      onClick={() => openModal(tech)}
                      className="p-2 hover:bg-neutral-100 text-neutral-500 rounded-lg"
                      title="Edit Technician"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  {canManage && (
                    <button 
                      onClick={() => handleDelete(tech.id)}
                      className="p-2 hover:bg-red-50 text-red-600 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900 truncate">{tech.name}</h3>
                    <p className="text-xs text-neutral-500 truncate">{tech.title || 'Technician'}</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                  tech.availabilityStatus === 'Available' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' :
                  tech.availabilityStatus === 'Busy' ? 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.4)]' :
                  'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                }`} title={tech.availabilityStatus} />
              </div>
              <p className="text-sm text-emerald-600 font-medium mb-4 truncate">{tech.specialization || 'General'}</p>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-2">
                  {tech.nik && (
                    <div className="flex items-center gap-3 text-sm text-neutral-500">
                      <Activity className="w-4 h-4 shrink-0" />
                      <span className="font-mono">{tech.nik}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-sm text-neutral-500">
                    <Mail className="w-4 h-4 shrink-0" />
                    <span className="truncate">{tech.email}</span>
                  </div>
                  {tech.phone && (
                    <div className="flex items-center gap-3 text-sm text-neutral-500">
                      <Phone className="w-4 h-4 shrink-0" />
                      <span>{tech.phone}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Availability Status</span>
                  <div className="flex items-center gap-1 bg-neutral-50 p-1 rounded-xl border border-black/5">
                    {(['Available', 'Busy', 'On Leave', 'Offline'] as AvailabilityStatus[]).map((status) => (
                      <button
                        key={status}
                        disabled={!canManage && profile?.email !== tech.email}
                        onClick={() => updateTechStatus(tech.id, status)}
                        className={`px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex-1 text-center ${
                          tech.availabilityStatus === status
                            ? status === 'Available' ? 'bg-emerald-600 text-white shadow-sm' :
                              status === 'Busy' ? 'bg-yellow-400 text-neutral-900 shadow-sm' :
                              status === 'On Leave' ? 'bg-red-600 text-white shadow-sm' :
                              'bg-neutral-500 text-white shadow-sm'
                            : 'text-neutral-400 hover:text-neutral-600'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Schedule</span>
                  <div className="flex flex-wrap gap-1">
                    {tech.workingDays?.map(day => (
                      <span key={day} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-md border border-blue-100">
                        {day}
                      </span>
                    ))}
                    {tech.workingHours && (
                      <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-[10px] font-bold rounded-md border border-black/5">
                        {tech.workingHours}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )) : (
            <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-black/10">
              <Wrench className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
              <p className="text-neutral-500 font-medium">No technicians found matching your criteria.</p>
              <button 
                onClick={() => { setSearchQuery(''); setStatusFilter('All'); setRoleFilter('All'); }}
                className="mt-4 text-emerald-600 font-bold text-sm hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )
        ) : (
          <div className="col-span-full h-[600px] bg-white rounded-3xl border border-black/5 overflow-hidden relative">
            {!hasValidMapsKey ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-neutral-50">
                <MapPin className="w-12 h-12 text-neutral-300 mb-4" />
                <h4 className="text-lg font-bold text-neutral-900 mb-2">Maps API Key Missing</h4>
                <p className="text-neutral-500 max-w-md">
                  Google Maps Platform API key is not configured. Please add GOOGLE_MAPS_PLATFORM_KEY to your environment variables.
                </p>
              </div>
            ) : (
              <APIProvider apiKey={API_KEY}>
                <Map
                  defaultCenter={{ lat: -6.2088, lng: 106.8456 }} // Default to Jakarta
                  defaultZoom={11}
                  mapId="TECHNICIAN_LOCATIONS"
                  className="w-full h-full"
                >
                  {filteredTechs.filter(t => t.location).map(tech => (
                    <AdvancedMarker
                      key={tech.id}
                      position={{ lat: tech.location!.lat, lng: tech.location!.lng }}
                      onClick={() => setSelectedMarker(tech)}
                    >
                      <Pin
                        background={
                          tech.availabilityStatus === 'Available' ? '#10b981' :
                          tech.availabilityStatus === 'Busy' ? '#facc15' :
                          '#ef4444'
                        }
                        borderColor="#ffffff"
                        glyphColor="#ffffff"
                      />
                    </AdvancedMarker>
                  ))}

                  {selectedMarker && selectedMarker.location && (
                    <InfoWindow
                      position={{ lat: selectedMarker.location.lat, lng: selectedMarker.location.lng }}
                      onCloseClick={() => setSelectedMarker(null)}
                    >
                      <div className="p-2 min-w-[200px]">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-100 border border-black/5">
                            {selectedMarker.photoURL ? (
                              <img 
                                src={resolvePhotoUrl(selectedMarker.photoURL)} 
                                alt={selectedMarker.name} 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                <User className="w-5 h-5" />
                              </div>
                            )}
                          </div>
                          <div>
                            <h4 className="font-bold text-neutral-900 leading-tight">{selectedMarker.name}</h4>
                            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">{selectedMarker.role}</p>
                          </div>
                        </div>
                        <div className="space-y-1.5 border-t border-black/5 pt-2">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-neutral-500">Status:</span>
                            <span className={`font-bold ${
                              selectedMarker.availabilityStatus === 'Available' ? 'text-emerald-600' :
                              selectedMarker.availabilityStatus === 'Busy' ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>{selectedMarker.availabilityStatus}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-neutral-500">Last Updated:</span>
                            <span className="text-neutral-900 font-medium">
                              {selectedMarker.location.updatedAt?.toDate().toLocaleString()}
                            </span>
                          </div>
                          <button
                            onClick={() => openDetails(selectedMarker)}
                            className="w-full mt-2 py-1.5 bg-neutral-900 text-white text-[10px] font-bold rounded-lg hover:bg-neutral-800 transition-colors"
                          >
                            View Full Profile
                          </button>
                        </div>
                      </div>
                    </InfoWindow>
                  )}
                </Map>
              </APIProvider>
            )}
          </div>
        )}
      </div>

      {/* Bulk Status Modal */}
      <AnimatePresence>
        {isBulkStatusModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between">
                <h3 className="text-lg font-bold text-neutral-900">Update Status</h3>
                <button onClick={() => setIsBulkStatusModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-3">
                <p className="text-sm text-neutral-500 mb-4">Set status for {selectedTechIds.length} selected technicians:</p>
                {(['Available', 'Busy', 'On Leave', 'Offline'] as AvailabilityStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleBulkStatusUpdate(status)}
                    className={`w-full py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-sm transition-all border ${
                      status === 'Available' ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-600 hover:text-white' :
                      status === 'Busy' ? 'bg-yellow-50 text-yellow-700 border-yellow-100 hover:bg-yellow-400 hover:text-neutral-900' :
                      status === 'On Leave' ? 'bg-red-50 text-red-700 border-red-100 hover:bg-red-600 hover:text-white' :
                      'bg-neutral-50 text-neutral-700 border-neutral-100 hover:bg-neutral-500 hover:text-white'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between shrink-0">
                <h3 className="text-xl font-bold text-neutral-900">
                  {editingTech ? 'Edit Technician' : 'Add New Technician'}
                </h3>
                <button onClick={closeModal} className="p-2 hover:bg-neutral-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                <div className="flex justify-center mb-6">
                  <div className="relative group">
                    <div className="w-24 h-24 bg-neutral-100 rounded-2xl border-2 border-dashed border-black/10 flex items-center justify-center overflow-hidden transition-all group-hover:border-emerald-500/50">
                      {formData.photoURL ? (
                        <img 
                          src={resolvePhotoUrl(formData.photoURL)} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Camera className="w-8 h-8 text-neutral-400" />
                      )}
                      {uploading && (
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <label className="absolute -bottom-2 -right-2 p-2 bg-white rounded-xl shadow-lg border border-black/5 cursor-pointer hover:bg-neutral-50 transition-all">
                      <Upload className="w-4 h-4 text-emerald-600" />
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={handlePhotoUpload}
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Full Name</label>
                    <input
                      required
                      readOnly={!canManage}
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={`w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none ${!canManage ? 'bg-neutral-50 cursor-not-allowed' : ''}`}
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">NIK (National ID)</label>
                    <input
                      readOnly={!canManage}
                      type="text"
                      value={formData.nik}
                      onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                      className={`w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none ${!canManage ? 'bg-neutral-50 cursor-not-allowed' : ''}`}
                      placeholder="3201..."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
                    <input
                      required
                      readOnly={!canManage}
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className={`w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none ${!canManage ? 'bg-neutral-50 cursor-not-allowed' : ''}`}
                      placeholder="jane@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="+62..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Telegram ID</label>
                    <input
                      type="text"
                      value={formData.telegramId}
                      onChange={(e) => setFormData({ ...formData, telegramId: e.target.value })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="e.g. 123456789"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Address</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none resize-none"
                    placeholder="Technician's home or base address..."
                    rows={2}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Bio / Notes</label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none resize-none"
                    placeholder="Brief biography or internal notes about the technician..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Job Title / Position</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="e.g. Senior Network Engineer"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">System Role</label>
                    <select
                      disabled={!canManage}
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                      className={`w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none bg-white ${!canManage ? 'bg-neutral-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="teknisi">Technician</option>
                      <option value="staf">Staff</option>
                      <option value="admin">Admin</option>
                      <option value="superadmin">Super Admin</option>
                    </select>
                  </div>
                </div>

                {canManage && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      {editingTech ? 'Reset Password (leave blank to keep current)' : 'Initial Password'}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none pr-10"
                        placeholder="••••••••"
                      />
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Main Specialization</label>
                    <input
                      type="text"
                      value={formData.specialization}
                      onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="e.g. REGULER, PSB, SQM"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Photo URL</label>
                    <input
                      type="url"
                      value={formData.photoURL}
                      onChange={(e) => setFormData({ ...formData, photoURL: e.target.value })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                      <Zap className="w-4 h-4" />
                    </div>
                    <p className="text-[10px] text-neutral-400 leading-tight">
                      Specialization helps the <span className="font-bold text-emerald-600">Smart Assignment</span> algorithm find the best match.
                    </p>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Skills (Comma separated)</label>
                  <input
                    type="text"
                    value={formData.skills}
                    onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                    className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                    placeholder="Fiber Optic, ODP, Splitting, etc."
                  />
                  <p className="mt-1 text-[10px] text-neutral-400">Enter skills separated by commas to help with smart assignment.</p>
                </div>

                <div className="p-4 bg-neutral-50 rounded-2xl border border-black/5 space-y-4">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Availability & Schedule</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Status</label>
                      <select
                        required
                        value={formData.availabilityStatus}
                        onChange={(e) => setFormData({ ...formData, availabilityStatus: e.target.value as any })}
                        className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none bg-white"
                      >
                        <option value="Available">Available</option>
                        <option value="Busy">Busy</option>
                        <option value="On Leave">On Leave</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Working Hours</label>
                      <input
                        required
                        type="text"
                        value={formData.workingHours}
                        onChange={(e) => setFormData({ ...formData, workingHours: e.target.value })}
                        className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none bg-white"
                        placeholder="e.g., 08:00-17:00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Working Days</label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map(day => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            const newDays = formData.workingDays.includes(day)
                              ? formData.workingDays.filter(d => d !== day)
                              : [...formData.workingDays, day];
                            setFormData({ ...formData, workingDays: newDays });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                            formData.workingDays.includes(day)
                              ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                              : 'bg-white border-black/10 text-neutral-500 hover:border-emerald-600'
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 font-medium">
                    {error}
                  </div>
                )}

                <div className="pt-4 flex gap-3 sticky bottom-0 bg-white pb-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 py-3 px-4 border border-black/10 rounded-xl font-medium hover:bg-neutral-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                  >
                    {editingTech ? 'Update' : 'Add'} Technician
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        title={confirmDelete.isBulk ? 'Delete Multiple Technicians' : 'Delete Technician'}
        message={
          confirmDelete.isBulk 
            ? `Are you sure you want to delete ${selectedTechIds.length} selected technicians? This action cannot be undone.`
            : 'Are you sure you want to delete this technician? This action cannot be undone.'
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete.isBulk ? confirmBulkDelete : confirmSingleDelete}
        onCancel={() => setConfirmDelete({ isOpen: false })}
        variant="danger"
      />

      {/* Details Modal */}
      <TechnicianDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        technician={selectedDetailsTech}
      />
    </div>
  );
}
