import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, Timestamp, doc, getDoc, updateDoc, increment, query, where } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { Technician, Material, MaterialUsage, RepairRecord, Notification, Job, JobUsage } from '../types';
import { X, Plus, Trash2, Save, Clock, Wrench, Package, AlertTriangle, Camera, MapPin, PenTool, Briefcase } from 'lucide-react';
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
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    technicianId: '',
    startTime: new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
    endTime: '',
    notes: '',
    materialsUsed: [] as MaterialUsage[],
    jobsUsed: [] as JobUsage[],
    beforePhoto: '',
    afterPhoto: '',
    signature: '',
    location: null as { lat: number; lng: number } | null
  });

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

    // Fetch ticket to pre-fill technician
    const fetchTicket = async () => {
      try {
        const ticketDoc = await getDoc(doc(db, 'tickets', ticketId));
        if (ticketDoc.exists()) {
          const ticketData = ticketDoc.data();
          if (ticketData.technicianIds && ticketData.technicianIds.length > 0) {
            setFormData(prev => ({ ...prev, technicianId: ticketData.technicianIds[0] }));
          }
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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `repairs/${ticketId}/${type}_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setFormData(prev => ({
        ...prev,
        [type === 'before' ? 'beforePhoto' : 'afterPhoto']: url
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 animate-shake">
              <X className="w-5 h-5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Technician Selection */}
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

            {/* Times */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Start Time
              </label>
              <input
                required
                type="datetime-local"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                <Clock className="w-4 h-4" /> End Time (Optional)
              </label>
              <input
                type="datetime-local"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-700">Repair Notes</label>
            <textarea
              required
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all resize-none"
              placeholder="Describe the work performed..."
            />
          </div>

          {/* Photos Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                <Camera className="w-4 h-4" /> Before Photo
              </label>
              <div className="relative aspect-video bg-neutral-100 rounded-xl border-2 border-dashed border-black/10 overflow-hidden group">
                {formData.beforePhoto ? (
                  <>
                    <img src={formData.beforePhoto} alt="Before" className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, beforePhoto: '' }))}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-200 transition-colors">
                    <Camera className="w-8 h-8 text-neutral-400 mb-2" />
                    <span className="text-xs font-medium text-neutral-500">Upload Before Photo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, 'before')} />
                  </label>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                <Camera className="w-4 h-4" /> After Photo
              </label>
              <div className="relative aspect-video bg-neutral-100 rounded-xl border-2 border-dashed border-black/10 overflow-hidden group">
                {formData.afterPhoto ? (
                  <>
                    <img src={formData.afterPhoto} alt="After" className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, afterPhoto: '' }))}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-200 transition-colors">
                    <Camera className="w-8 h-8 text-neutral-400 mb-2" />
                    <span className="text-xs font-medium text-neutral-500">Upload After Photo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, 'after')} />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Location Info */}
          {formData.location && (
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3 text-emerald-700">
              <MapPin className="w-4 h-4" />
              <p className="text-xs font-medium">
                Location Captured: {formData.location.lat.toFixed(6)}, {formData.location.lng.toFixed(6)}
              </p>
            </div>
          )}

          {/* Signature Section */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
              <PenTool className="w-4 h-4" /> Customer Signature
            </label>
            <div className="bg-neutral-50 border border-black/10 rounded-xl overflow-hidden">
              <SignatureCanvas 
                ref={sigCanvas}
                penColor="black"
                canvasProps={{
                  className: "w-full h-40 cursor-crosshair",
                  style: { width: '100%', height: '160px' }
                }}
                onEnd={saveSignature}
              />
              <div className="p-2 bg-white border-t border-black/5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={clearSignature}
                  className="px-3 py-1 text-xs font-bold text-neutral-500 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Materials Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                <Package className="w-4 h-4" /> Materials Used
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[10px] font-bold uppercase text-neutral-400 mb-1 ml-1">Material</label>
                <select
                  value={selectedMaterialId}
                  onChange={(e) => setSelectedMaterialId(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                >
                  <option value="">Select material</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>{m.name} (Rp {m.price.toLocaleString()}/{m.unit})</option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <label className="block text-[10px] font-bold uppercase text-neutral-400 mb-1 ml-1">Qty</label>
                <input
                  type="number"
                  min="1"
                  value={materialQuantity}
                  onChange={(e) => setMaterialQuantity(parseInt(e.target.value))}
                  className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                />
              </div>
              <div className="w-32">
                <label className="block text-[10px] font-bold uppercase text-neutral-400 mb-1 ml-1">Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={materialPrice}
                  onChange={(e) => setMaterialPrice(parseFloat(e.target.value))}
                  className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleAddMaterial}
                  disabled={!selectedMaterialId}
                  className="h-[42px] px-4 bg-neutral-900 text-white rounded-xl font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="bg-neutral-50 rounded-xl border border-black/5 divide-y divide-black/5">
              {formData.materialsUsed.length > 0 ? (
                <>
                  {formData.materialsUsed.map((m) => (
                    <div key={m.materialId} className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{m.name}</p>
                        <p className="text-xs text-neutral-500">Qty: {m.quantity} × Rp {m.unitPrice.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-neutral-900">Rp {(m.quantity * m.unitPrice).toLocaleString()}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMaterial(m.materialId)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="p-3 bg-white/50 flex justify-between items-center border-t border-black/10">
                    <span className="text-xs font-bold uppercase text-neutral-500 tracking-wider">Total Materials Cost</span>
                    <span className="text-lg font-black text-emerald-600">Rp {totalMaterialsCost.toLocaleString()}</span>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-neutral-400 text-sm italic">
                  No materials added yet.
                </div>
              )}
            </div>
          </div>
          {/* Jobs Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> BOQ REKONSILIASI
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[10px] font-bold uppercase text-neutral-400 mb-1 ml-1">BOQ</label>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                >
                  <option value="">Select BOQ</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.designator ? `[${j.designator}] ` : ''}{j.name} (Rp {j.price.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <label className="block text-[10px] font-bold uppercase text-neutral-400 mb-1 ml-1">Qty</label>
                <input
                  type="number"
                  min="1"
                  value={jobQuantity}
                  onChange={(e) => setJobQuantity(parseInt(e.target.value))}
                  className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                />
              </div>
              <div className="w-32">
                <label className="block text-[10px] font-bold uppercase text-neutral-400 mb-1 ml-1">Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={jobPrice}
                  onChange={(e) => setJobPrice(parseFloat(e.target.value))}
                  className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleAddJob}
                  disabled={!selectedJobId}
                  className="h-[42px] px-4 bg-neutral-900 text-white rounded-xl font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="bg-neutral-50 rounded-xl border border-black/5 divide-y divide-black/5">
              {formData.jobsUsed.length > 0 ? (
                <>
                  {formData.jobsUsed.map((j) => (
                    <div key={j.jobId} className="p-3 flex items-center justify-between">
                      <div className="flex items-start gap-3">
                        {j.designator && (
                          <span className="mt-1 px-1.5 py-0.5 bg-neutral-200 text-neutral-600 text-[8px] font-mono font-bold rounded">
                            {j.designator}
                          </span>
                        )}
                        <div>
                          <p className="text-sm font-medium text-neutral-900">{j.name}</p>
                          <p className="text-xs text-neutral-500">Qty: {j.quantity} × Rp {j.unitPrice.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-neutral-900">Rp {(j.quantity * j.unitPrice).toLocaleString()}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveJob(j.jobId)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="p-3 bg-white/50 flex justify-between items-center border-t border-black/10">
                    <span className="text-xs font-bold uppercase text-neutral-500 tracking-wider">Total BOQ Cost</span>
                    <span className="text-lg font-black text-emerald-600">Rp {totalJobsCost.toLocaleString()}</span>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-neutral-400 text-sm italic">
                  No jobs added yet.
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-neutral-900 rounded-2xl text-white flex justify-between items-center">
            <div>
              <p className="text-xs font-bold uppercase text-neutral-400">Grand Total Cost</p>
              <p className="text-2xl font-black">Rp {totalCost.toLocaleString()}</p>
            </div>
            <Save className="w-8 h-8 text-emerald-500 opacity-50" />
          </div>
        </form>

        <div className="p-6 border-t border-black/5 bg-neutral-50 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 border border-black/10 rounded-xl font-medium hover:bg-neutral-100 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-2 py-3 px-6 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            Save Record
          </button>
        </div>
      </motion.div>
    </div>
  );
}
