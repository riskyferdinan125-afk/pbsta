import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { Asset, Customer } from '../types';
import { Search, Monitor, Plus, Edit2, Trash2, X, ChevronRight, Clock, Tag, User, Hash, Calendar, ShieldCheck, QrCode, Scan } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import ConfirmationModal from './ConfirmationModal';

export default function AssetManagement() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedAssetQR, setSelectedAssetQR] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id?: string }>({ isOpen: false });

  // Scanner logic
  useEffect(() => {
    if (isScannerOpen) {
      let scanner: Html5QrcodeScanner | null = null;
      try {
        scanner = new Html5QrcodeScanner(
          "reader",
          { fps: 10, qrbox: { width: 250, height: 250 } },
          /* verbose= */ false
        );

        scanner.render((decodedText) => {
          const assetId = decodedText.startsWith('asset:') ? decodedText.replace('asset:', '') : decodedText;
          setSearchQuery(assetId);
          setIsScannerOpen(false);
          if (scanner) {
            scanner.clear().catch(err => console.error("Failed to clear scanner on success", err));
          }
        }, (error) => {
          // Silent error for scanning frames
        });
      } catch (err) {
        console.error("Failed to initialize scanner:", err);
        setIsScannerOpen(false);
      }

      return () => {
        if (scanner) {
          scanner.clear().catch(err => {
            // Only log if it's not already cleared
            if (!err?.message?.includes("not found")) {
              console.error("Failed to clear scanner on unmount", err);
            }
          });
        }
      };
    }
  }, [isScannerOpen]);

  const [formData, setFormData] = useState({
    name: '',
    type: '',
    serialNumber: '',
    customerId: '',
    purchaseDate: '',
    warrantyExpiry: '',
    status: 'active' as Asset['status'],
    specs: ''
  });

  useEffect(() => {
    // Fetch Assets
    const qAssets = query(collection(db, 'assets'), orderBy('updatedAt', 'desc'));
    const unsubscribeAssets = onSnapshot(qAssets, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));
      setAssets(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'assets');
      setLoading(false);
    });

    // Fetch Customers for selection
    const qCustomers = query(collection(db, 'customers'), orderBy('name', 'asc'));
    const unsubscribeCustomers = onSnapshot(qCustomers, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(docs);
    });

    return () => {
      unsubscribeAssets();
      unsubscribeCustomers();
    };
  }, []);

  const filteredAssets = assets.filter(asset => {
    const name = asset.name || '';
    const serial = asset.serialNumber || '';
    const type = asset.type || '';
    const query = searchQuery.toLowerCase();
    
    return name.toLowerCase().includes(query) ||
           serial.toLowerCase().includes(query) ||
           type.toLowerCase().includes(query);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    const assetData = {
      ...formData,
      purchaseDate: formData.purchaseDate ? Timestamp.fromDate(new Date(formData.purchaseDate)) : null,
      warrantyExpiry: formData.warrantyExpiry ? Timestamp.fromDate(new Date(formData.warrantyExpiry)) : null,
      specs: formData.specs.split('\n').reduce((acc, line) => {
        const [key, value] = line.split(':').map(s => s.trim());
        if (key && value) acc[key] = value;
        return acc;
      }, {} as Record<string, string>),
      updatedAt: serverTimestamp()
    };

    try {
      if (editingAsset) {
        await updateDoc(doc(db, 'assets', editingAsset.id), assetData);
      } else {
        await addDoc(collection(db, 'assets'), {
          ...assetData,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      setEditingAsset(null);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'assets');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: '',
      serialNumber: '',
      customerId: '',
      purchaseDate: '',
      warrantyExpiry: '',
      status: 'active',
      specs: ''
    });
  };

  const handleDelete = async (id: string) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const confirmDeleteAsset = async () => {
    if (!confirmDelete.id) return;
    try {
      await deleteDoc(doc(db, 'assets', confirmDelete.id));
      setConfirmDelete({ isOpen: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'assets');
    }
  };

  const openEditModal = (asset: Asset) => {
    setEditingAsset(asset);
    
    // Defensive check for specs: handle both object and legacy string formats
    let specsString = '';
    if (asset.specs) {
      if (typeof asset.specs === 'object' && !Array.isArray(asset.specs)) {
        specsString = Object.entries(asset.specs).map(([k, v]) => `${k}: ${v}`).join('\n');
      } else if (typeof asset.specs === 'string') {
        specsString = asset.specs;
      }
    }

    setFormData({
      name: asset.name,
      type: asset.type || '',
      serialNumber: asset.serialNumber,
      customerId: asset.customerId,
      purchaseDate: asset.purchaseDate instanceof Timestamp ? asset.purchaseDate.toDate().toISOString().split('T')[0] : '',
      warrantyExpiry: asset.warrantyExpiry instanceof Timestamp ? asset.warrantyExpiry.toDate().toISOString().split('T')[0] : '',
      status: asset.status,
      specs: specsString
    });
    setIsModalOpen(true);
  };

  const downloadQR = (asset: Asset) => {
    const svg = document.getElementById(`qr-${asset.id}`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `QR-${asset.name}-${asset.serialNumber}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Asset Management</h1>
          <p className="text-neutral-500">Track and manage customer hardware</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsScannerOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-indigo-600 text-indigo-600 rounded-xl hover:bg-indigo-50 transition-all font-semibold"
          >
            <Scan className="w-5 h-5" />
            Scan QR
          </button>
          <button
            onClick={() => {
              setEditingAsset(null);
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 font-semibold"
          >
            <Plus className="w-5 h-5" />
            Add Asset
          </button>
        </div>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
        <input
          type="text"
          placeholder="Search by name, serial number, or type..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white border border-black/10 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-neutral-500">Loading assets...</div>
        ) : filteredAssets.length === 0 ? (
          <div className="col-span-full py-12 text-center text-neutral-500 bg-white rounded-3xl border border-dashed border-neutral-300">
            No assets found.
          </div>
        ) : (
          filteredAssets.map(asset => (
            <motion.div
              key={asset.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl border border-black/5 shadow-sm hover:shadow-md transition-all overflow-hidden group"
            >
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                    <Monitor className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      asset.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      asset.status === 'maintenance' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {asset.status}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-neutral-900 group-hover:text-indigo-600 transition-colors">{asset.name}</h3>
                  <p className="text-sm text-neutral-500">{asset.type}</p>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2 text-xs text-neutral-600">
                    <Hash className="w-3.5 h-3.5" />
                    <span className="font-mono">{asset.serialNumber}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-600">
                    <User className="w-3.5 h-3.5" />
                    <span>{customers.find(c => c.id === asset.customerId)?.name || 'Unknown Customer'}</span>
                  </div>
                  {asset.warrantyExpiry && (
                    <div className="flex items-center gap-2 text-xs text-neutral-600">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Warranty until: {asset.warrantyExpiry instanceof Timestamp ? asset.warrantyExpiry.toDate().toLocaleDateString() : 'N/A'}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 flex items-center justify-between gap-2 border-t border-black/5">
                  <button
                    onClick={() => setSelectedAssetQR(asset)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    <QrCode className="w-4 h-4" />
                    View QR
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(asset)}
                      className="p-2 hover:bg-neutral-100 rounded-lg transition-colors text-neutral-600"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(asset.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between bg-neutral-50">
                <h3 className="text-xl font-bold text-neutral-900">
                  {editingAsset ? 'Edit Asset' : 'Add New Asset'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-neutral-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-neutral-700">Asset Name</label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                      placeholder="e.g., MacBook Pro 16"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-neutral-700">Asset Type</label>
                    <input
                      required
                      type="text"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                      placeholder="e.g., Laptop, Printer"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-neutral-700">Serial Number</label>
                    <input
                      required
                      type="text"
                      value={formData.serialNumber}
                      onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-mono"
                      placeholder="SN-123456789"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-neutral-700">Owner (Customer)</label>
                    <select
                      required
                      value={formData.customerId}
                      onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    >
                      <option value="">Select customer</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-neutral-700">Purchase Date</label>
                    <input
                      type="date"
                      value={formData.purchaseDate}
                      onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-neutral-700">Warranty Expiry</label>
                    <input
                      type="date"
                      value={formData.warrantyExpiry}
                      onChange={(e) => setFormData({ ...formData, warrantyExpiry: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-neutral-700">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as Asset['status'] })}
                      className="w-full px-4 py-2.5 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    >
                      <option value="active">Active</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="retired">Retired</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-neutral-700">Specifications (Key: Value per line)</label>
                  <textarea
                    rows={4}
                    value={formData.specs}
                    onChange={(e) => setFormData({ ...formData, specs: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all resize-none font-mono text-sm"
                    placeholder="CPU: Intel i7&#10;RAM: 16GB&#10;Storage: 512GB SSD"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 text-neutral-600 font-semibold hover:bg-neutral-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
                  >
                    {editingAsset ? 'Update Asset' : 'Add Asset'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR Code Viewer Modal */}
      <AnimatePresence>
        {selectedAssetQR && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-8 text-center"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-neutral-900">Asset QR Code</h3>
                <button onClick={() => setSelectedAssetQR(null)} className="p-2 hover:bg-neutral-100 rounded-xl">
                  <X className="w-5 h-5 text-neutral-500" />
                </button>
              </div>
              
              <div className="bg-neutral-50 p-8 rounded-2xl flex justify-center mb-6">
                <QRCodeSVG 
                  id={`qr-${selectedAssetQR.id}`}
                  value={`asset:${selectedAssetQR.id}`} 
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>

              <div className="mb-8">
                <h4 className="font-bold text-neutral-900">{selectedAssetQR.name}</h4>
                <p className="text-sm text-neutral-500 font-mono">{selectedAssetQR.serialNumber}</p>
              </div>

              <button
                onClick={() => downloadQR(selectedAssetQR)}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
              >
                Download QR Image
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR Scanner Modal */}
      <AnimatePresence>
        {isScannerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-neutral-900">Scan Asset QR</h3>
                <button onClick={() => setIsScannerOpen(false)} className="p-2 hover:bg-neutral-100 rounded-xl">
                  <X className="w-5 h-5 text-neutral-500" />
                </button>
              </div>
              <div className="p-6">
                <div id="reader" className="overflow-hidden rounded-2xl border-2 border-dashed border-neutral-200"></div>
                <p className="mt-4 text-center text-sm text-neutral-500">
                  Point your camera at the asset's QR code to quickly find it.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        title="Delete Asset"
        message="Are you sure you want to delete this asset? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDeleteAsset}
        onCancel={() => setConfirmDelete({ isOpen: false })}
        variant="danger"
      />
    </div>
  );
}
