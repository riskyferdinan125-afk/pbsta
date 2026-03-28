import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Material } from '../types';
import { Plus, Search, Package, Tag, Edit2, Trash2, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from './Toast';
import ConfirmationModal from './ConfirmationModal';

export default function MaterialList() {
  const { showToast } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id?: string; isBulk?: boolean }>({ isOpen: false });

  const [formData, setFormData] = useState({
    name: '',
    unit: '',
    price: 0,
    quantity: 0
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'materials'), (snapshot) => {
      setMaterials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Material)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'materials');
    });
    return unsubscribe;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.price < 0) {
      showToast('Price cannot be negative', 'error');
      return;
    }

    try {
      if (editingMaterial) {
        await updateDoc(doc(db, 'materials', editingMaterial.id), formData);
      } else {
        await addDoc(collection(db, 'materials'), formData);
      }
      closeModal();
    } catch (error) {
      handleFirestoreError(error, editingMaterial ? OperationType.UPDATE : OperationType.CREATE, 'materials');
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const confirmSingleDelete = async () => {
    if (!confirmDelete.id) return;
    try {
      await deleteDoc(doc(db, 'materials', confirmDelete.id));
      showToast('Material deleted successfully', 'success');
      setConfirmDelete({ isOpen: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `materials/${confirmDelete.id}`);
    }
  };

  const handleBulkDelete = async () => {
    setConfirmDelete({ isOpen: true, isBulk: true });
  };

  const confirmBulkDelete = async () => {
    try {
      const batch = writeBatch(db);
      selectedMaterialIds.forEach(id => {
        batch.delete(doc(db, 'materials', id));
      });
      await batch.commit();
      setSelectedMaterialIds([]);
      showToast(`${selectedMaterialIds.length} materials deleted`, 'success');
      setConfirmDelete({ isOpen: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'materials/bulk');
    }
  };

  const toggleSelectMaterial = (id: string) => {
    setSelectedMaterialIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedMaterialIds.length === filteredMaterials.length) {
      setSelectedMaterialIds([]);
    } else {
      setSelectedMaterialIds(filteredMaterials.map(m => m.id));
    }
  };

  const openModal = (material?: Material) => {
    if (material) {
      setEditingMaterial(material);
      setFormData({
        name: material.name,
        unit: material.unit,
        price: material.price,
        quantity: material.quantity || 0
      });
    } else {
      setEditingMaterial(null);
      setFormData({ name: '', unit: '', price: 0, quantity: 0 });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingMaterial(null);
    setFormData({ name: '', unit: '', price: 0, quantity: 0 });
  };

  const filteredMaterials = materials.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.unit.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search materials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {selectedMaterialIds.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100"
              >
                <span className="text-xs font-bold text-emerald-700 mr-2">
                  {selectedMaterialIds.length} Selected
                </span>
                <button
                  onClick={handleBulkDelete}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete Selected"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedMaterialIds([])}
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
            Add Material
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
                  checked={filteredMaterials.length > 0 && selectedMaterialIds.length === filteredMaterials.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-6 py-4">Material Name</th>
              <th className="px-6 py-4">Unit</th>
              <th className="px-6 py-4">Price per Unit (Rp)</th>
              <th className="px-6 py-4">Stock Quantity</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {loading ? (
              [1,2,3].map(i => <tr key={i} className="animate-pulse"><td colSpan={5} className="px-6 py-8"><div className="h-4 bg-neutral-100 rounded w-full"></div></td></tr>)
            ) : filteredMaterials.length > 0 ? filteredMaterials.map((material) => (
              <tr key={material.id} className={`hover:bg-neutral-50 transition-colors group ${selectedMaterialIds.includes(material.id) ? 'bg-emerald-50/30' : ''}`}>
                <td className="px-6 py-4">
                  <input 
                    type="checkbox" 
                    className="rounded border-black/10 text-emerald-600 focus:ring-emerald-500/20"
                    checked={selectedMaterialIds.includes(material.id)}
                    onChange={() => toggleSelectMaterial(material.id)}
                  />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                      <Package className="w-4 h-4" />
                    </div>
                    <span className="font-medium text-neutral-900">{material.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-neutral-500">
                    <Tag className="w-4 h-4" />
                    <span>{material.unit}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1 text-neutral-900 font-medium">
                    <span className="text-neutral-400 font-bold">Rp</span>
                    <span>{material.price.toLocaleString()}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                      (material.quantity || 0) <= 5 
                        ? 'bg-red-50 text-red-600 ring-1 ring-red-200 animate-pulse' 
                        : 'bg-neutral-100 text-neutral-700'
                    }`}>
                      {(material.quantity || 0) <= 5 && <AlertTriangle className="w-3 h-3" />}
                      {material.quantity || 0}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => openModal(material)}
                      className="p-2 hover:bg-neutral-100 text-neutral-500 rounded-lg"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(material.id)}
                      className="p-2 hover:bg-red-50 text-red-600 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-neutral-500">
                  No materials found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
                  {editingMaterial ? 'Edit Material' : 'Add New Material'}
                </h3>
                <button onClick={closeModal} className="p-2 hover:bg-neutral-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Material Name</label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                    placeholder="Fiber Optic Cable"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Unit</label>
                    <input
                      required
                      type="text"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="meters, pcs, etc."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Price per Unit (Rp)</label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Stock Quantity</label>
                  <input
                    required
                    type="number"
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                    placeholder="0"
                  />
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
                    {editingMaterial ? 'Update' : 'Add'} Material
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
        title={confirmDelete.isBulk ? 'Delete Multiple Materials' : 'Delete Material'}
        message={
          confirmDelete.isBulk 
            ? `Are you sure you want to delete ${selectedMaterialIds.length} selected materials? This action cannot be undone.`
            : 'Are you sure you want to delete this material? This action cannot be undone.'
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete.isBulk ? confirmBulkDelete : confirmSingleDelete}
        onCancel={() => setConfirmDelete({ isOpen: false })}
        variant="danger"
      />
    </div>
  );
}
