import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Customer } from '../types';
import { Plus, Search, User, Phone, MapPin, Mail, Edit2, Trash2, X, Hash, Box, Download, Upload, Eye, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import CustomerDetailsModal from './CustomerDetailsModal';
import ConfirmationModal from './ConfirmationModal';

interface CustomerListProps {
  onCreateTicket?: (customerId: string) => void;
}

export default function CustomerList({ onCreateTicket }: CustomerListProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [selectedCustomerForDetails, setSelectedCustomerForDetails] = useState<Customer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id?: string; isBulk?: boolean }>({ isOpen: false });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    customerId: '',
    name: '',
    phone: '',
    address: '',
    odp: '',
    email: ''
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'customers'), (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });
    return unsubscribe;
  }, []);

  const validateEmail = (email: string) => {
    if (!email) return true;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleExport = () => {
    const exportData = customers.map(({ id, ...rest }) => ({
      'Customer ID': rest.customerId,
      'Name': rest.name,
      'Phone': rest.phone,
      'Email': rest.email || '',
      'ODP': rest.odp || '',
      'Address': rest.address
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    XLSX.writeFile(wb, `Customers_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const batch = writeBatch(db);
        let count = 0;

        for (const row of data) {
          const newCustomer = {
            customerId: String(row['Customer ID'] || row['customerId'] || ''),
            name: String(row['Name'] || row['name'] || ''),
            phone: String(row['Phone'] || row['phone'] || ''),
            email: String(row['Email'] || row['email'] || ''),
            odp: String(row['ODP'] || row['odp'] || ''),
            address: String(row['Address'] || row['address'] || '')
          };

          if (newCustomer.name && newCustomer.phone) {
            const docRef = doc(collection(db, 'customers'));
            batch.set(docRef, newCustomer);
            count++;
          }
        }

        if (count > 0) {
          await batch.commit();
          alert(`Successfully imported ${count} customers.`);
        } else {
          alert('No valid customer data found in the file.');
        }
      } catch (error) {
        console.error('Import error:', error);
        alert('Failed to import customers. Please check the file format.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.email && !validateEmail(formData.email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    try {
      if (editingCustomer) {
        await updateDoc(doc(db, 'customers', editingCustomer.id), formData);
      } else {
        await addDoc(collection(db, 'customers'), formData);
      }
      closeModal();
    } catch (error) {
      handleFirestoreError(error, editingCustomer ? OperationType.UPDATE : OperationType.CREATE, 'customers');
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const confirmSingleDelete = async () => {
    if (!confirmDelete.id) return;
    try {
      await deleteDoc(doc(db, 'customers', confirmDelete.id));
      setConfirmDelete({ isOpen: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `customers/${confirmDelete.id}`);
    }
  };

  const handleBulkDelete = async () => {
    setConfirmDelete({ isOpen: true, isBulk: true });
  };

  const confirmBulkDelete = async () => {
    try {
      const batch = writeBatch(db);
      selectedCustomerIds.forEach(id => {
        batch.delete(doc(db, 'customers', id));
      });
      await batch.commit();
      setSelectedCustomerIds([]);
      setConfirmDelete({ isOpen: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'customers/bulk');
    }
  };

  const toggleSelectCustomer = (id: string) => {
    setSelectedCustomerIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const openModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        customerId: customer.customerId || '',
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        odp: customer.odp || '',
        email: customer.email || ''
      });
    } else {
      setEditingCustomer(null);
      setFormData({ customerId: '', name: '', phone: '', address: '', odp: '', email: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
    setEmailError(null);
    setFormData({ customerId: '', name: '', phone: '', address: '', odp: '', email: '' });
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery) ||
    c.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.customerId && c.customerId.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (c.odp && c.odp.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-black/5 text-neutral-600 rounded-xl font-medium hover:bg-neutral-50 transition-all"
            title="Import from Excel"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-black/5 text-neutral-600 rounded-xl font-medium hover:bg-neutral-50 transition-all"
            title="Export to Excel"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <AnimatePresence>
            {selectedCustomerIds.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100"
              >
                <span className="text-xs font-bold text-emerald-700 mr-2">
                  {selectedCustomerIds.length} Selected
                </span>
                <button
                  onClick={handleBulkDelete}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete Selected"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedCustomerIds([])}
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
            Add Customer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-48 bg-white rounded-2xl border border-black/5 animate-pulse"></div>)
        ) : filteredCustomers.length > 0 ? filteredCustomers.map((customer) => (
          <motion.div
            layout
            key={customer.id}
            className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  className="rounded border-black/10 text-emerald-600 focus:ring-emerald-500/20"
                  checked={selectedCustomerIds.includes(customer.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleSelectCustomer(customer.id);
                  }}
                />
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                  <User className="w-6 h-6" />
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCustomerForDetails(customer);
                  }}
                  className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg"
                  title="View Details"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    openModal(customer);
                  }}
                  className="p-2 hover:bg-neutral-100 text-neutral-500 rounded-lg"
                  title="Edit Customer"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(customer.id);
                  }}
                  className="p-2 hover:bg-red-50 text-red-600 rounded-lg"
                  title="Delete Customer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div 
              className="cursor-pointer"
              onClick={() => setSelectedCustomerForDetails(customer)}
            >
              <h3 className="text-lg font-bold text-neutral-900 mb-4">{customer.name}</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm text-neutral-500">
                  <Hash className="w-4 h-4" />
                  <span className="font-mono font-bold text-emerald-600">{customer.customerId || 'No ID'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-neutral-500">
                  <Phone className="w-4 h-4" />
                  <span>{customer.phone}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-neutral-500">
                  <Box className="w-4 h-4" />
                  <span className="font-bold">{customer.odp || 'Not Set'}</span>
                </div>
                {customer.email && (
                  <div className="flex items-center gap-3 text-sm text-neutral-500">
                    <Mail className="w-4 h-4" />
                    <span>{customer.email}</span>
                  </div>
                )}
                <div className="flex items-start gap-3 text-sm text-neutral-500">
                  <MapPin className="w-4 h-4 mt-0.5" />
                  <span className="line-clamp-2">{customer.address}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-black/5 flex gap-2">
              <button
                onClick={() => setSelectedCustomerForDetails(customer)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-neutral-50 text-neutral-600 rounded-xl text-sm font-bold hover:bg-neutral-100 transition-all border border-black/5"
              >
                <Eye className="w-4 h-4" />
                Details
              </button>
              <button
                onClick={() => onCreateTicket?.(customer.id)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-all border border-emerald-100/50"
              >
                <Plus className="w-4 h-4" />
                Ticket
              </button>
            </div>
          </motion.div>
        )) : (
          <div className="col-span-full py-12 text-center text-neutral-500">
            No customers found.
          </div>
        )}
      </div>

      {/* Details Modal */}
      <AnimatePresence>
        {selectedCustomerForDetails && (
          <CustomerDetailsModal
            customer={selectedCustomerForDetails}
            onClose={() => setSelectedCustomerForDetails(null)}
          />
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        title={confirmDelete.isBulk ? 'Delete Multiple Customers' : 'Delete Customer'}
        message={
          confirmDelete.isBulk 
            ? `Are you sure you want to delete ${selectedCustomerIds.length} selected customers? This action cannot be undone.`
            : 'Are you sure you want to delete this customer? This action cannot be undone.'
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete.isBulk ? confirmBulkDelete : confirmSingleDelete}
        onCancel={() => setConfirmDelete({ isOpen: false })}
        variant="danger"
      />

      {/* Edit/Add Modal */}
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
                  {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
                </h3>
                <button onClick={closeModal} className="p-2 hover:bg-neutral-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Customer ID</label>
                    <input
                      required
                      type="text"
                      value={formData.customerId}
                      onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="e.g. 12345678"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Full Name</label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="John Doe"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Phone Number</label>
                    <input
                      required
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="+62..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">ODP</label>
                    <input
                      required
                      type="text"
                      value={formData.odp}
                      onChange={(e) => setFormData({ ...formData, odp: e.target.value })}
                      className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      placeholder="e.g. ODP-JKT-01"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      if (emailError) setEmailError(null);
                    }}
                    className={`w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none ${
                      emailError ? 'border-red-500' : 'border-black/10'
                    }`}
                    placeholder="john@example.com"
                  />
                  {emailError && (
                    <p className="mt-1 text-xs text-red-500">{emailError}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Address</label>
                  <textarea
                    required
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none resize-none"
                    placeholder="Service address..."
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
                    {editingCustomer ? 'Update' : 'Add'} Customer
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
