import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, Timestamp, doc, getDoc, getDocs, updateDoc, increment, query, where } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { Technician, Material, MaterialUsage, RepairRecord, Notification, Job, JobUsage } from '../types';
import { X, Plus, Trash2, Save, Clock, Wrench, Package, AlertTriangle, Camera, MapPin, PenTool, Briefcase, Settings, HardDrive, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import SignatureCanvas from 'react-signature-canvas';
import { ref, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage';
import { storage } from '../firebase';

interface RepairRecordFormProps {
  ticketId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function RepairRecordForm({ ticketId, onClose, onSuccess }: RepairRecordFormProps) {
  const resolvePhotoUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')) return url;
    if (!url.includes('/')) {
      return `/api/telegram-photo/${url}`;
    }
    return url;
  };
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    technicianId: '',
    startTime: new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
    endTime: '',
    type: '' as 'Logic' | 'Physical' | '',
    rootCause: '',
    repairAction: '',
    evidencePhoto: '',
    notes: '',
    materialsUsed: [] as MaterialUsage[],
    jobsUsed: [] as JobUsage[],
    beforePhoto: '',
    afterPhoto: '',
    signature: '',
    location: null as { lat: number; lng: number } | null
  });

  const [ticketInfo, setTicketInfo] = useState<{ customerId: string; customerName: string; ticketNumber: number } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [materialQuantity, setMaterialQuantity] = useState(1);
  const [materialPrice, setMaterialPrice] = useState(0);

  const [selectedJobId, setSelectedJobId] = useState('');
  const [jobQuantity, setJobQuantity] = useState(1);
  const [jobPrice, setJobPrice] = useState(0);

  const [isUploading, setIsUploading] = useState(false);
  const sigCanvas = React.useRef<SignatureCanvas>(null);

  useEffect(() => {
    // Get current location
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData(prev => ({
            ...prev,
            location: {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            }
          }));
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }
  }, []);

  useEffect(() => {
    const techQuery = query(collection(db, 'users'), where('role', '==', 'teknisi'));
    const unsubTechs = onSnapshot(techQuery, (snapshot) => {
      setTechnicians(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as Technician)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snapshot) => {
      setMaterials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Material)));
    });

    const unsubJobs = onSnapshot(collection(db, 'jobs'), (snapshot) => {
      setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
      setLoading(false);
    });

    // Fetch ticket to pre-fill technician and materials
    const fetchTicket = async () => {
      try {
        const ticketDoc = await getDoc(doc(db, 'tickets', ticketId));
        if (ticketDoc.exists()) {
          const ticketData = ticketDoc.data();
          setTicketInfo({
            customerId: ticketData.customerId || '',
            customerName: '',
            ticketNumber: ticketData.ticketNumber || 0
          });
          
          // Fetch customer name
          if (ticketData.customerId) {
            const custDoc = await getDoc(doc(db, 'customers', ticketData.customerId));
            if (custDoc.exists()) {
              const custData = custDoc.data();
              setTicketInfo(prev => prev ? { ...prev, customerName: custData.name } : null);
              setFormData(prev => ({ ...prev, customerId: custData.customerId, customerName: custData.name }));
            }
          }

          if (ticketData.technicianIds && ticketData.technicianIds.length > 0) {
            setFormData(prev => ({ ...prev, technicianId: ticketData.technicianIds[0] }));
          }
        }

        // Fetch materials from subcollection
        const materialsSnap = await getDocs(collection(db, 'tickets', ticketId, 'materialsUsed'));
        if (!materialsSnap.empty) {
          const ticketMaterials = materialsSnap.docs.map(doc => ({
            materialId: doc.data().materialId,
            name: doc.data().name,
            quantity: doc.data().quantity,
            unitPrice: doc.data().unitPrice
          } as MaterialUsage));
          
          setFormData(prev => ({
            ...prev,
            materialsUsed: [...prev.materialsUsed, ...ticketMaterials]
          }));
        }
      } catch (error) {
        console.error("Error fetching ticket for pre-fill:", error);
      }
    };
    fetchTicket();

    return () => {
      unsubTechs();
      unsubMaterials();
      unsubJobs();
    };
  }, [ticketId]);

  useEffect(() => {
    const material = materials.find(m => m.id === selectedMaterialId);
    if (material) {
      setMaterialPrice(material.price);
    } else {
      setMaterialPrice(0);
    }
  }, [selectedMaterialId, materials]);

  useEffect(() => {
    const job = jobs.find(j => j.id === selectedJobId);
    if (job) {
      setJobPrice(job.price);
    } else {
      setJobPrice(0);
    }
  }, [selectedJobId, jobs]);

  const handleCustomerIdChange = async (cid: string) => {
    setFormData(prev => ({ ...prev, customerId: cid }));
    // Try to find customer name
    if (cid.length >= 3) {
      const q = query(collection(db, 'customers'), where('customerId', '==', cid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setFormData(prev => ({ ...prev, customerName: snap.docs[0].data().name }));
      }
    }
  };

  const handleAddMaterial = () => {
    const material = materials.find(m => m.id === selectedMaterialId);
    if (!material) return;

    const existing = formData.materialsUsed.find(m => m.materialId === selectedMaterialId);
    if (existing) {
      setFormData({
        ...formData,
        materialsUsed: formData.materialsUsed.map(m => 
          m.materialId === selectedMaterialId 
            ? { ...m, quantity: m.quantity + materialQuantity, unitPrice: materialPrice }
            : m
        )
      });
    } else {
      setFormData({
        ...formData,
        materialsUsed: [
          ...formData.materialsUsed,
          {
            materialId: material.id,
            name: material.name,
            quantity: materialQuantity,
            unitPrice: materialPrice
          }
        ]
      });
    }
    setSelectedMaterialId('');
    setMaterialQuantity(1);
    setMaterialPrice(0);
  };

  const handleRemoveMaterial = (id: string) => {
    setFormData({
      ...formData,
      materialsUsed: formData.materialsUsed.filter(m => m.materialId !== id)
    });
  };

  const handleAddJob = () => {
    const job = jobs.find(j => j.id === selectedJobId);
    if (!job) return;

    const existing = formData.jobsUsed.find(j => j.jobId === selectedJobId);
    if (existing) {
      setFormData({
        ...formData,
        jobsUsed: formData.jobsUsed.map(j => 
          j.jobId === selectedJobId 
            ? { ...j, quantity: j.quantity + jobQuantity, unitPrice: jobPrice }
            : j
        )
      });
    } else {
      setFormData({
        ...formData,
        jobsUsed: [
          ...formData.jobsUsed,
          {
            jobId: job.id,
            designator: job.designator,
            name: job.name,
            quantity: jobQuantity,
            unitPrice: jobPrice
          }
        ]
      });
    }
    setSelectedJobId('');
    setJobQuantity(1);
    setJobPrice(0);
  };

  const handleRemoveJob = (id: string) => {
    setFormData({
      ...formData,
      jobsUsed: formData.jobsUsed.filter(j => j.jobId !== id)
    });
  };

  const totalMaterialsCost = formData.materialsUsed.reduce((sum, m) => sum + (m.quantity * m.unitPrice), 0);
  const totalJobsCost = formData.jobsUsed.reduce((sum, j) => sum + (j.quantity * j.unitPrice), 0);
  const totalCost = totalMaterialsCost + totalJobsCost;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after' | 'evidence') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `repairs/${ticketId}/${type}_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setFormData(prev => ({
        ...prev,
        [type === 'before' ? 'beforePhoto' : type === 'after' ? 'afterPhoto' : 'evidencePhoto']: url
      }));
    } catch (error) {
      console.error("Error uploading photo:", error);
      setError("Failed to upload photo");
    } finally {
      setIsUploading(false);
    }
  };

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setFormData(prev => ({ ...prev, signature: '' }));
  };

  const saveSignature = async () => {
    if (sigCanvas.current?.isEmpty()) return;
    const signatureData = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
    if (!signatureData) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `repairs/${ticketId}/signature_${Date.now()}.png`);
      await uploadString(storageRef, signatureData, 'data_url');
      const url = await getDownloadURL(storageRef);
      setFormData(prev => ({ ...prev, signature: url }));
    } catch (error) {
      console.error("Error uploading signature:", error);
      setError("Failed to upload signature");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.signature && sigCanvas.current && !sigCanvas.current.isEmpty()) {
      await saveSignature();
    }

    if (formData.endTime) {
      const start = new Date(formData.startTime).getTime();
      const end = new Date(formData.endTime).getTime();
      if (end < start) {
        setError('End Time cannot be before Start Time');
        return;
      }
    }

    try {
      // 1. Deduct material quantities and check for low stock
      for (const usage of formData.materialsUsed) {
        const materialRef = doc(db, 'materials', usage.materialId);
        const materialSnap = await getDoc(materialRef);
        
        if (materialSnap.exists()) {
          const materialData = materialSnap.data() as Material;
          const newQuantity = materialData.quantity - usage.quantity;

          if (newQuantity < 0) {
            setError(`Insufficient stock for ${materialData.name}`);
            return;
          }

          // Update material quantity
          await updateDoc(materialRef, {
            quantity: increment(-usage.quantity),
            updatedAt: serverTimestamp()
          });

          // Check for low stock alert
          if (newQuantity <= (materialData.minQuantity || 5)) {
            const notification: Omit<Notification, 'id'> = {
              userId: 'admin', // Notify admin
              title: 'Low Stock Alert',
              message: `Material "${materialData.name}" is low on stock (${newQuantity} remaining).`,
              type: 'warning',
              read: false,
              createdAt: serverTimestamp() as Timestamp,
              link: '/inventory'
            };
            await addDoc(collection(db, 'notifications'), notification);
          }
        }
      }

      const recordData = {
        ticketId,
        technicianId: formData.technicianId,
        startTime: Timestamp.fromDate(new Date(formData.startTime)),
        endTime: formData.endTime ? Timestamp.fromDate(new Date(formData.endTime)) : null,
        type: formData.type,
        rootCause: formData.rootCause,
        repairAction: formData.repairAction,
        evidencePhoto: formData.evidencePhoto,
        notes: formData.notes,
        materialsUsed: formData.materialsUsed,
        jobsUsed: formData.jobsUsed,
        beforePhoto: formData.beforePhoto,
        afterPhoto: formData.afterPhoto,
        signature: formData.signature,
        location: formData.location,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'repairRecords'), recordData);

      // 2. Clear materials from ticket subcollection
      try {
        const materialsSnap = await getDocs(collection(db, 'tickets', ticketId, 'materialsUsed'));
        const { deleteDoc } = await import('firebase/firestore');
        for (const docRef of materialsSnap.docs) {
          await deleteDoc(docRef.ref);
        }
      } catch (error) {
        console.error("Error clearing ticket materials:", error);
      }

      // Log History
      await addDoc(collection(db, 'ticketHistory'), {
        ticketId,
        type: 'note_added',
        toValue: `Repair record added by ${technicians.find(t => t.id === formData.technicianId)?.name || 'Technician'}: ${formData.notes.slice(0, 50)}${formData.notes.length > 50 ? '...' : ''}`,
        changedBy: auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp()
      });

      onSuccess?.();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'repairRecords');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="p-6 border-b border-black/5 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-neutral-900">Add Repair Record</h3>
              <p className="text-xs text-neutral-500">Ticket ID: {ticketId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="p-6 border-b border-black/5 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-neutral-900">Repair Record Wizard</h3>
              <p className="text-xs text-neutral-500">Step {currentStep + 1} of {formData.type === 'Physical' ? 5 : 4}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 animate-shake">
              <AlertTriangle className="w-5 h-5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {currentStep === 0 ? (
              <motion.div
                key="step0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <label className="text-sm font-bold text-neutral-700 flex items-center gap-2">
                    <Briefcase className="w-4 h-4" /> Customer Identity
                  </label>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Customer ID</label>
                      <input
                        type="text"
                        value={formData.customerId}
                        onChange={(e) => handleCustomerIdChange(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-black/10 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-bold"
                        placeholder="Enter Customer ID"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Customer Name</label>
                      <div className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-2xl text-neutral-600 font-medium">
                        {formData.customerName || 'Customer not found'}
                      </div>
                    </div>
                    {ticketInfo && (
                      <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2 text-emerald-700 text-xs font-bold">
                        <CheckCircle2 className="w-4 h-4" />
                        Linked to Ticket #{ticketInfo.ticketNumber}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : currentStep === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-3">
                  <label className="text-sm font-bold text-neutral-700">Select Repair Type</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'Logic' })}
                      className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${
                        formData.type === 'Logic'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-lg shadow-emerald-500/10'
                          : 'border-black/5 hover:border-black/10 text-neutral-500'
                      }`}
                    >
                      <Settings className={`w-8 h-8 ${formData.type === 'Logic' ? 'text-emerald-600' : 'text-neutral-300'}`} />
                      <span className="font-bold">Logic</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'Physical' })}
                      className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${
                        formData.type === 'Physical'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-lg shadow-emerald-500/10'
                          : 'border-black/5 hover:border-black/10 text-neutral-500'
                      }`}
                    >
                      <HardDrive className={`w-8 h-8 ${formData.type === 'Physical' ? 'text-emerald-600' : 'text-neutral-300'}`} />
                      <span className="font-bold">Physical</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-4 pt-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                      <Wrench className="w-4 h-4" /> Technician
                    </label>
                    <select
                      required
                      value={formData.technicianId}
                      onChange={(e) => setFormData({ ...formData, technicianId: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                    >
                      <option value="">Select technician</option>
                      {technicians.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.role})</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                          <Clock className="w-4 h-4" /> Start Time
                        </label>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, startTime: new Date().toISOString().slice(0, 16) })}
                          className="text-[10px] font-bold uppercase text-emerald-600 hover:bg-emerald-50 px-2 py-0.5 rounded transition-all"
                        >
                          Now
                        </button>
                      </div>
                      <input
                        required
                        type="datetime-local"
                        value={formData.startTime}
                        onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                        className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                          <Clock className="w-4 h-4" /> End Time
                        </label>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, endTime: new Date().toISOString().slice(0, 16) })}
                          className="text-[10px] font-bold uppercase text-emerald-600 hover:bg-emerald-50 px-2 py-0.5 rounded transition-all"
                        >
                          Now
                        </button>
                      </div>
                      <input
                        type="datetime-local"
                        value={formData.endTime}
                        onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                        className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : currentStep === 2 ? (
              <motion.div
                key="step2-jobs-materials"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {formData.type === 'Physical' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-neutral-700 flex items-center gap-2">
                        <Package className="w-4 h-4" /> Materials Used
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <div className="flex-1 min-w-[200px]">
                        <select
                          value={selectedMaterialId}
                          onChange={(e) => setSelectedMaterialId(e.target.value)}
                          className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                        >
                          <option value="">Select material</option>
                          {materials.map(m => (
                            <option key={m.id} value={m.id}>{m.name} (Stok: {m.quantity} {m.unit})</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24">
                        <input
                          type="number"
                          min="1"
                          value={materialQuantity}
                          onChange={(e) => setMaterialQuantity(parseInt(e.target.value))}
                          className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                          placeholder="Qty"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddMaterial}
                        disabled={!selectedMaterialId}
                        className="px-4 bg-neutral-900 text-white rounded-xl font-medium hover:bg-neutral-800 disabled:opacity-50 transition-all"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="bg-neutral-50 rounded-2xl border border-black/5 divide-y divide-black/5 overflow-hidden">
                      {formData.materialsUsed.length > 0 ? (
                        formData.materialsUsed.map((m) => (
                          <div key={m.materialId} className="p-4 flex items-center justify-between bg-white">
                            <div>
                              <p className="text-sm font-bold text-neutral-900">{m.name}</p>
                              <p className="text-[10px] font-black uppercase text-neutral-400">Quantity: {m.quantity}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveMaterial(m.materialId)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="p-12 text-center text-neutral-400">
                          <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
                          <p className="text-sm italic">No materials added yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className={`space-y-4 ${formData.type === 'Physical' ? 'pt-4 border-t border-black/5' : ''}`}>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-neutral-700 flex items-center gap-2">
                      <Briefcase className="w-4 h-4" /> Jobs Performed
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <select
                        value={selectedJobId}
                        onChange={(e) => setSelectedJobId(e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                      >
                        <option value="">Select job</option>
                        {jobs.map(j => (
                          <option key={j.id} value={j.id}>{j.name} (Rp {j.price.toLocaleString()})</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddJob}
                      disabled={!selectedJobId}
                      className="px-4 bg-neutral-900 text-white rounded-xl font-medium hover:bg-neutral-800 disabled:opacity-50 transition-all"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="bg-neutral-50 rounded-2xl border border-black/5 divide-y divide-black/5 overflow-hidden">
                    {formData.jobsUsed.length > 0 ? (
                      formData.jobsUsed.map((j) => (
                        <div key={j.jobId} className="p-4 flex items-center justify-between bg-white">
                          <div>
                            <p className="text-sm font-bold text-neutral-900">{j.name}</p>
                            <p className="text-[10px] font-black uppercase text-neutral-400">Price: Rp {j.unitPrice.toLocaleString()}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveJob(j.jobId)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="p-12 text-center text-neutral-400">
                        <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p className="text-sm italic">No jobs added yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : currentStep === 3 ? (
              <motion.div
                key="step-cause"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-neutral-700">Penyebab Gangguan (Root Cause)</label>
                    <textarea
                      required
                      rows={3}
                      value={formData.rootCause}
                      onChange={(e) => setFormData({ ...formData, rootCause: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-black/10 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all resize-none"
                      placeholder="Apa penyebab gangguannya?"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-neutral-700">Perbaikan Gangguan (Repair Action)</label>
                    <textarea
                      required
                      rows={3}
                      value={formData.repairAction}
                      onChange={(e) => setFormData({ ...formData, repairAction: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-black/10 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all resize-none"
                      placeholder="Apa tindakan perbaikan yang dilakukan?"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-neutral-700">Notes (Optional)</label>
                    <textarea
                      rows={2}
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-black/10 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all resize-none"
                      placeholder="Catatan tambahan..."
                    />
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step-evidence"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <label className="text-sm font-bold text-neutral-700 flex items-center gap-2">
                    <Camera className="w-4 h-4" /> Photos (Evidence)
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Before Photo */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase text-neutral-400 ml-1">Before Repair</p>
                      <div className="relative aspect-square bg-neutral-50 rounded-2xl border-2 border-dashed border-black/5 overflow-hidden group">
                        {formData.beforePhoto ? (
                          <>
                            <img src={resolvePhotoUrl(formData.beforePhoto)} alt="Before" className="w-full h-full object-cover" />
                            <button 
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, beforePhoto: '' }))}
                              className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-100 transition-colors">
                            <Camera className="w-8 h-8 text-neutral-300 mb-1" />
                            <span className="text-[10px] font-bold text-neutral-400">Upload Before</span>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, 'before')} />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* After Photo */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase text-neutral-400 ml-1">After Repair</p>
                      <div className="relative aspect-square bg-neutral-50 rounded-2xl border-2 border-dashed border-black/5 overflow-hidden group">
                        {formData.afterPhoto ? (
                          <>
                            <img src={resolvePhotoUrl(formData.afterPhoto)} alt="After" className="w-full h-full object-cover" />
                            <button 
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, afterPhoto: '' }))}
                              className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-100 transition-colors">
                            <Camera className="w-8 h-8 text-neutral-300 mb-1" />
                            <span className="text-[10px] font-bold text-neutral-400">Upload After</span>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, 'after')} />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Evidence Photo */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase text-neutral-400 ml-1">General Evidence</p>
                      <div className="relative aspect-square bg-neutral-50 rounded-2xl border-2 border-dashed border-black/5 overflow-hidden group">
                        {formData.evidencePhoto ? (
                          <>
                            <img src={resolvePhotoUrl(formData.evidencePhoto)} alt="Evidence" className="w-full h-full object-cover" />
                            <button 
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, evidencePhoto: '' }))}
                              className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-100 transition-colors">
                            <Camera className="w-8 h-8 text-neutral-300 mb-1" />
                            <span className="text-[10px] font-bold text-neutral-400">Upload Evidence</span>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, 'evidence')} />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-neutral-700 flex items-center gap-2">
                    <PenTool className="w-4 h-4" /> Customer Signature
                  </label>
                  <div className="bg-neutral-50 border border-black/5 rounded-3xl overflow-hidden">
                    <SignatureCanvas 
                      ref={sigCanvas}
                      penColor="black"
                      canvasProps={{
                        className: "w-full h-40 cursor-crosshair",
                        style: { width: '100%', height: '160px' }
                      }}
                      onEnd={saveSignature}
                    />
                    <div className="p-3 bg-white border-t border-black/5 flex justify-end">
                      <button
                        type="button"
                        onClick={clearSignature}
                        className="px-4 py-1.5 text-xs font-black uppercase text-neutral-400 hover:text-neutral-600 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-6 border-t border-black/5 bg-neutral-50 flex gap-3">
          {currentStep > 0 && (
            <button
              type="button"
              onClick={() => setCurrentStep(prev => prev - 1)}
              className="flex-1 py-4 px-6 border border-black/10 rounded-2xl font-bold text-neutral-600 hover:bg-neutral-100 transition-all flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-5 h-5" /> Back
            </button>
          )}
          
          {currentStep < 4 ? (
            <button
              type="button"
              disabled={(currentStep === 0 && !formData.customerId) || (currentStep === 1 && !formData.type)}
              onClick={() => setCurrentStep(prev => prev + 1)}
              className="flex-[2] py-4 px-6 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-xl shadow-neutral-900/10"
            >
              Next Step <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isUploading || (!formData.evidencePhoto && !formData.afterPhoto)}
              className="flex-[2] py-4 px-6 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
              Finish & Save
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
