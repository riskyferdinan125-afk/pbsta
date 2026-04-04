import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Job } from '../types';
import { Plus, Search, Briefcase, Edit2, Trash2, X, Download, Upload, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from './Toast';
import ConfirmationModal from './ConfirmationModal';

export default function PekerjaanList() {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id?: string; isBulk?: boolean; isAll?: boolean }>({ isOpen: false });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Reset page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const [formData, setFormData] = useState({
    designator: '',
    name: '',
    unit: '',
    category: '',
    materialPrice: 0,
    servicePrice: 0,
    price: 0
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'jobs'), (snapshot) => {
      setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'jobs');
    });
    return unsubscribe;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.materialPrice < 0 || formData.servicePrice < 0) {
      showToast('Price cannot be negative', 'error');
      return;
    }

    const finalData = {
      ...formData,
      price: formData.materialPrice + formData.servicePrice
    };

    try {
      if (editingJob) {
        await updateDoc(doc(db, 'jobs', editingJob.id), finalData);
        showToast('BOQ updated successfully', 'success');
      } else {
        await addDoc(collection(db, 'jobs'), finalData);
        showToast('BOQ added successfully', 'success');
      }
      closeModal();
    } catch (error) {
      handleFirestoreError(error, editingJob ? OperationType.UPDATE : OperationType.CREATE, 'jobs');
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const confirmSingleDelete = async () => {
    if (!confirmDelete.id) return;
    try {
      await deleteDoc(doc(db, 'jobs', confirmDelete.id));
      showToast('BOQ deleted successfully', 'success');
      setConfirmDelete({ isOpen: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `jobs/${confirmDelete.id}`);
    }
  };

  const handleBulkDelete = async () => {
    setConfirmDelete({ isOpen: true, isBulk: true });
  };

  const confirmBulkDelete = async () => {
    try {
      const batch = writeBatch(db);
      selectedJobIds.forEach(id => {
        batch.delete(doc(db, 'jobs', id));
      });
      await batch.commit();
      setSelectedJobIds([]);
      showToast(`${selectedJobIds.length} BOQ deleted`, 'success');
      setConfirmDelete({ isOpen: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'jobs/bulk');
    }
  };

  const toggleSelectJob = (id: string) => {
    setSelectedJobIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedJobIds.length === filteredJobs.length) {
      setSelectedJobIds([]);
    } else {
      setSelectedJobIds(filteredJobs.map(j => j.id));
    }
  };

  const openModal = (job?: Job) => {
    if (job) {
      setEditingJob(job);
      setFormData({
        designator: job.designator || '',
        name: job.name,
        unit: job.unit || '',
        category: job.category || '',
        materialPrice: job.materialPrice || 0,
        servicePrice: job.servicePrice || 0,
        price: job.price
      });
    } else {
      setEditingJob(null);
      setFormData({
        designator: '',
        name: '',
        unit: '',
        category: '',
        materialPrice: 0,
        servicePrice: 0,
        price: 0
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingJob(null);
    setFormData({
      designator: '',
      name: '',
      unit: '',
      category: '',
      materialPrice: 0,
      servicePrice: 0,
      price: 0
    });
  };

  const filteredJobs = jobs.filter(j => 
    j.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    j.designator?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedJobs = filteredJobs.slice(startIndex, startIndex + itemsPerPage);

  const handleDownload = () => {
    const exportData = jobs.map(j => ({
      'Designator': j.designator,
      'Nama Pekerjaan': j.name,
      'Satuan': j.unit,
      'Kategori': j.category,
      'Harga Material (Rp)': j.materialPrice,
      'Harga Jasa (Rp)': j.servicePrice,
      'Total Harga (Rp)': j.price
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BOQ');
    XLSX.writeFile(wb, `Daftar_BOQ_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Data downloaded successfully', 'success');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;

        const wb = XLSX.read(data, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json(ws) as any[];

        if (jsonData.length === 0) {
          showToast('File is empty', 'error');
          return;
        }

        const batch = writeBatch(db);
        let count = 0;

        jsonData.forEach((row) => {
          // Flexible mapping for column names
          const name = row['Nama Pekerjaan'] || row['Pekerjaan'] || row['Name'] || row['nama_pekerjaan'];
          const designator = String(row['Designator'] || row['Code'] || row['designator'] || row['kode'] || '');
          const unit = String(row['Satuan'] || row['Unit'] || row['satuan'] || '');
          const category = String(row['Kategori'] || row['Category'] || row['kategori'] || '');
          
          // Ensure prices are numbers and not NaN
          const rawMaterialPrice = row['Harga Material (Rp)'] || row['Material'] || row['material_price'] || row['harga_material'] || 0;
          const rawServicePrice = row['Harga Jasa (Rp)'] || row['Jasa'] || row['service_price'] || row['harga_jasa'] || 0;
          
          const materialPrice = isNaN(Number(rawMaterialPrice)) ? 0 : Number(rawMaterialPrice);
          const servicePrice = isNaN(Number(rawServicePrice)) ? 0 : Number(rawServicePrice);
          
          if (name && typeof name === 'string') {
            const newDocRef = doc(collection(db, 'jobs'));
            batch.set(newDocRef, {
              designator: designator.trim(),
              name: name.trim(),
              unit: unit.trim(),
              category: category.trim(),
              materialPrice,
              servicePrice,
              price: materialPrice + servicePrice,
              createdAt: serverTimestamp()
            });
            count++;
          }
        });

        if (count > 0) {
          try {
            await batch.commit();
            showToast(`Successfully uploaded ${count} BOQ`, 'success');
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'jobs/bulk');
          }
        } else {
          showToast('No valid data found in file', 'info');
        }
        
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (error) {
        console.error('Upload error:', error);
        showToast('Failed to upload data. Please check file format.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDeleteAll = async () => {
    if (jobs.length === 0) return;
    setConfirmDelete({ isOpen: true, isAll: true });
  };

  const confirmDeleteAll = async () => {
    try {
      setLoading(true);
      const batch = writeBatch(db);
      jobs.forEach(job => {
        batch.delete(doc(db, 'jobs', job.id));
      });
      await batch.commit();
      showToast('Seluruh data BOQ berhasil dihapus', 'success');
      setConfirmDelete({ isOpen: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'jobs/all');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [{
      'Designator': 'KBL-01',
      'Nama Pekerjaan': 'Instalasi Kabel Fiber Optic',
      'Satuan': 'Meter',
      'Kategori': 'FTTH',
      'Harga Material (Rp)': 15000,
      'Harga Jasa (Rp)': 5000
    }];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Template_Upload_Pekerjaan.xlsx');
    showToast('Template downloaded', 'info');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search BOQ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-black/10 text-emerald-600 rounded-xl font-medium hover:bg-emerald-50 transition-all shadow-sm"
            title="Download Template Excel"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span className="hidden sm:inline">Template</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-black/10 text-neutral-700 rounded-xl font-medium hover:bg-neutral-50 transition-all shadow-sm"
            title="Upload Data"
          >
            <Upload className="w-5 h-5" />
            <span className="hidden sm:inline">Upload</span>
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-black/10 text-neutral-700 rounded-xl font-medium hover:bg-neutral-50 transition-all shadow-sm"
            title="Download Data"
          >
            <Download className="w-5 h-5" />
            <span className="hidden sm:inline">Download</span>
          </button>
          {jobs.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-100 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-all shadow-sm"
              title="Hapus Semua Data"
            >
              <Trash2 className="w-5 h-5" />
              <span className="hidden sm:inline">Hapus Semua</span>
            </button>
          )}
          <AnimatePresence>
            {selectedJobIds.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100"
              >
                <span className="text-xs font-bold text-emerald-700 mr-2">
                  {selectedJobIds.length} Selected
                </span>
                <button
                  onClick={handleBulkDelete}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete Selected"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedJobIds([])}
                  className="p-1.5 text-neutral-400 hover:bg-neutral-100 rounded-lg transition-colors"
                  title="Clear Selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => openModal()}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-5 h-5" />
            Add BOQ
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-neutral-50 text-neutral-500 text-xs font-bold uppercase tracking-wider">
              <th className="px-6 py-4 w-10">
                <input 
                   type="checkbox" 
                   className="rounded border-black/10 text-emerald-600 focus:ring-emerald-500/20"
                   checked={filteredJobs.length > 0 && selectedJobIds.length === filteredJobs.length}
                   onChange={toggleSelectAll}
                />
              </th>
              <th className="px-6 py-4">Designator</th>
              <th className="px-6 py-4">BOQ REKONSILIASI</th>
              <th className="px-6 py-4">Satuan</th>
              <th className="px-6 py-4">Kategori</th>
              <th className="px-6 py-4">Material (Rp)</th>
              <th className="px-6 py-4">Jasa (Rp)</th>
              <th className="px-6 py-4">Total (Rp)</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {loading ? (
              [1,2,3].map(i => <tr key={i} className="animate-pulse"><td colSpan={8} className="px-6 py-8"><div className="h-4 bg-neutral-100 rounded w-full"></div></td></tr>)
            ) : paginatedJobs.length > 0 ? paginatedJobs.map((job) => (
              <tr key={job.id} className={`hover:bg-neutral-50 transition-colors group ${selectedJobIds.includes(job.id) ? 'bg-emerald-50/30' : ''}`}>
                <td className="px-6 py-4">
                  <input 
                    type="checkbox" 
                    className="rounded border-black/10 text-emerald-600 focus:ring-emerald-500/20"
                    checked={selectedJobIds.includes(job.id)}
                    onChange={() => toggleSelectJob(job.id)}
                  />
                </td>
                <td className="px-6 py-4">
                  <span className="font-mono text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                    {job.designator || '-'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <span className="font-medium text-neutral-900">{job.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-neutral-600">
                  {job.unit || '-'}
                </td>
                <td className="px-6 py-4 text-neutral-600">
                  {job.category || '-'}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1 text-neutral-900 font-medium">
                    <span className="text-neutral-400 font-bold">Rp</span>
                    <span>{(job.materialPrice || 0).toLocaleString()}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1 text-neutral-900 font-medium">
                    <span className="text-neutral-400 font-bold">Rp</span>
                    <span>{(job.servicePrice || 0).toLocaleString()}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1 text-emerald-700 font-bold">
                    <span className="text-emerald-400">Rp</span>
                    <span>{job.price.toLocaleString()}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => openModal(job)}
                      className="p-2 hover:bg-neutral-100 text-neutral-500 rounded-lg"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(job.id)}
                      className="p-2 hover:bg-red-50 text-red-600 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-neutral-500">
                  No BOQ found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination UI */}
        {!loading && filteredJobs.length > 0 && (
          <div className="px-6 py-4 bg-neutral-50 border-t border-black/5 flex items-center justify-between">
            <div className="text-sm text-neutral-500">
              Showing <span className="font-medium text-neutral-900">{startIndex + 1}</span> to{' '}
              <span className="font-medium text-neutral-900">
                {Math.min(startIndex + itemsPerPage, filteredJobs.length)}
              </span>{' '}
              of <span className="font-medium text-neutral-900">{filteredJobs.length}</span> results
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm font-medium text-neutral-600 bg-white border border-black/10 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                        currentPage === pageNum
                          ? 'bg-emerald-600 text-white'
                          : 'text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm font-medium text-neutral-600 bg-white border border-black/10 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-neutral-900">
                  {editingJob ? 'Edit BOQ' : 'Add New BOQ'}
                </h3>
                <button onClick={closeModal} className="p-2 hover:bg-neutral-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Designator</label>
                    <input
                      required
                      type="text"
                      value={formData.designator}
                      onChange={(e) => setFormData({ ...formData, designator: e.target.value })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="Contoh: KBL-01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Satuan</label>
                    <input
                      required
                      type="text"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="Contoh: Meter"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Kategori</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                    placeholder="Contoh: FTTH, OSP, dll"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Nama Pekerjaan</label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                    placeholder="Contoh: Instalasi Kabel"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Material (Rp)</label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.materialPrice}
                      onChange={(e) => setFormData({ ...formData, materialPrice: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Jasa (Rp)</label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.servicePrice}
                      onChange={(e) => setFormData({ ...formData, servicePrice: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Total Harga</span>
                    <span className="text-lg font-black text-emerald-700">
                      Rp {(formData.materialPrice + formData.servicePrice).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
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
                    {editingJob ? 'Update' : 'Add'} BOQ
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
        title={
          confirmDelete.isAll ? 'Hapus Seluruh BOQ' :
          confirmDelete.isBulk ? 'Delete Multiple BOQ' : 
          'Delete BOQ'
        }
        message={
          confirmDelete.isAll 
            ? `PERINGATAN: Anda akan menghapus SELURUH data BOQ (${jobs.length} item). Tindakan ini tidak dapat dibatalkan. Apakah Anda yakin?`
            : confirmDelete.isBulk 
              ? `Are you sure you want to delete ${selectedJobIds.length} selected BOQ? This action cannot be undone.`
              : 'Are you sure you want to delete this BOQ? This action cannot be undone.'
        }
        confirmLabel={confirmDelete.isAll ? 'Hapus Semua' : 'Delete'}
        onConfirm={
          confirmDelete.isAll ? confirmDeleteAll :
          confirmDelete.isBulk ? confirmBulkDelete : 
          confirmSingleDelete
        }
        onCancel={() => setConfirmDelete({ isOpen: false })}
        variant="danger"
      />
    </div>
  );
}
