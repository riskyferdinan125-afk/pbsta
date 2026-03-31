import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, updateDoc, doc, deleteDoc, query, orderBy, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';
import { Search, UserCog, Mail, Shield, Edit2, Trash2, X, UserCircle, CheckCircle2, AlertCircle, Lock, UserPlus, Eye, Fingerprint } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from './Toast';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

interface UserManagementProps {
  profile: UserProfile | null;
}

export default function UserManagement({ profile }: UserManagementProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [viewingUser, setViewingUser] = useState<UserProfile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id?: string; name?: string }>({ isOpen: false });

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    nik: '',
    role: 'staf' as UserProfile['role'],
    password: ''
  });

  const ROLES: UserProfile['role'][] = ['superadmin', 'admin', 'staf', 'teknisi'];

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ ...doc.data() } as UserProfile)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return unsubscribe;
  }, []);

  const handleBulkCleanup = async () => {
    const targetEmails = [
      'tg_1097862411@telegram.bot',
      'tg_436950647@telegram.bot',
      'adityawibowo110@gmail.com',
      'tg_98681282@telegram.bot'
    ];
    const targetNiks = ['109786241', '436950647', '98681282'];
    
    const usersToDelete = users.filter(u => 
      (targetEmails.includes(u.email) || targetNiks.includes(u.nik || '') || u.role === 'staf') && 
      u.uid !== profile?.uid
    );

    if (usersToDelete.length === 0) {
      showToast('No matching users found for cleanup', 'info');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${usersToDelete.length} users (Target Emails, NIKs, and all Staff)?`)) {
      return;
    }

    setLoading(true);
    let deletedCount = 0;
    try {
      for (const user of usersToDelete) {
        await deleteDoc(doc(db, 'users', user.uid));
        deletedCount++;
      }
      showToast(`Successfully deleted ${deletedCount} users`, 'success');
    } catch (error) {
      console.error("Error in bulk cleanup:", error);
      showToast('Failed to complete bulk cleanup', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.name) {
      showToast('Please fill all fields', 'error');
      return;
    }

    setLoading(true);
    
    // Check if email already exists in Firestore users collection first
    const emailExists = users.some(u => u.email.toLowerCase() === formData.email.toLowerCase());
    if (emailExists) {
      showToast('This email address is already in use by another account.', 'error');
      setLoading(false);
      return;
    }

    let secondaryApp;
    try {
      // Create a secondary Firebase app to avoid signing out the admin
      const secondaryAppName = `SecondaryApp-${Date.now()}`;
      secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);

      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        formData.email,
        formData.password
      );

      const newUser = userCredential.user;

      // Create profile in Firestore
      const userProfile: UserProfile = {
        uid: newUser.uid,
        name: formData.name,
        email: formData.email,
        nik: formData.nik,
        role: formData.role,
        password: formData.password, // Store for reference as requested
        createdAt: new Date(),
        updatedAt: new Date(),
        photoURL: null,
        telegramId: ''
      };

      await setDoc(doc(db, 'users', newUser.uid), userProfile);

      // Sign out from secondary app and delete it
      await signOut(secondaryAuth);
      
      showToast('User created successfully', 'success');
      closeAddModal();
    } catch (error: any) {
      console.error("Error adding user:", error);
      let errorMessage = 'Failed to create user';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email address is already in use by another account.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'The email address is not valid.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'The password is too weak. Please use at least 6 characters.';
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'Email/password accounts are not enabled. Please enable them in Firebase Console.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showToast(errorMessage, 'error');
    } finally {
      if (secondaryApp) {
        await deleteApp(secondaryApp);
      }
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      await updateDoc(doc(db, 'users', editingUser.uid), {
        name: formData.name,
        nik: formData.nik,
        role: formData.role,
        password: formData.password,
        updatedAt: new Date()
      });
      showToast('User updated successfully', 'success');
      closeModal();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingUser.uid}`);
      showToast('Failed to update user role', 'error');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setConfirmDelete({ isOpen: true, id, name });
  };

  const confirmSingleDelete = async () => {
    if (!confirmDelete.id) return;
    try {
      await deleteDoc(doc(db, 'users', confirmDelete.id));
      setConfirmDelete({ isOpen: false });
      showToast('User deleted successfully', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${confirmDelete.id}`);
      showToast('Failed to delete user', 'error');
    }
  };

  const openModal = (user: UserProfile) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      nik: user.nik || '',
      role: user.role,
      password: user.password || ''
    });
    setIsModalOpen(true);
  };

  const openViewModal = (user: UserProfile) => {
    setViewingUser(user);
  };

  const closeViewModal = () => {
    setViewingUser(null);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const openAddModal = () => {
    setFormData({
      name: '',
      email: '',
      nik: '',
      role: 'staf',
      password: ''
    });
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = roleFilter === 'All' || u.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const canManage = profile?.role === 'superadmin';

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Shield className="w-16 h-16 text-red-200 mb-4" />
        <h3 className="text-xl font-bold text-neutral-900 mb-2">Access Denied</h3>
        <p className="text-neutral-500 max-w-md">Only Superadmins can manage users and roles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col md:flex-row gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search users by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="All">All Roles</option>
            {ROLES.map(role => (
              <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleBulkCleanup}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-all border border-red-100 disabled:opacity-50"
            title="Clean up default users and staff"
          >
            <Trash2 className="w-5 h-5" />
            <span className="hidden sm:inline">Cleanup</span>
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
          >
            <UserPlus className="w-5 h-5" />
            Add User
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50 border-b border-black/5">
                <th className="px-6 py-4 text-xs font-bold text-neutral-400 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-400 uppercase tracking-wider">NIK</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-400 uppercase tracking-wider">Email</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-400 uppercase tracking-wider">Password</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-400 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 w-32 bg-neutral-100 rounded"></div></td>
                    <td className="px-6 py-4"><div className="h-4 w-48 bg-neutral-100 rounded"></div></td>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-neutral-100 rounded"></div></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-neutral-100 rounded ml-auto"></div></td>
                  </tr>
                ))
              ) : filteredUsers.length > 0 ? filteredUsers.map((u) => (
                <tr key={u.uid} className="hover:bg-neutral-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-neutral-100 border border-black/5 overflow-hidden shrink-0">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <UserCircle className="w-full h-full p-2 text-neutral-400" />
                        )}
                      </div>
                      <span className="font-medium text-neutral-900">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-500">{u.nik || '-'}</td>
                  <td className="px-6 py-4 text-sm text-neutral-500">{u.email}</td>
                  <td className="px-6 py-4 text-sm font-mono text-neutral-500">
                    {u.password ? (
                      <span className="bg-neutral-100 px-2 py-1 rounded select-all">{u.password}</span>
                    ) : (
                      <span className="italic text-neutral-300">Not set</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      u.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                      u.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                      u.role === 'staf' ? 'bg-emerald-100 text-emerald-700' :
                      u.role === 'teknisi' ? 'bg-orange-100 text-orange-700' :
                      'bg-neutral-100 text-neutral-700'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 transition-opacity">
                      <button
                        onClick={() => openViewModal(u)}
                        className="p-2 hover:bg-neutral-100 text-neutral-500 rounded-lg transition-colors border border-black/5"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openModal(u)}
                        className="p-2 hover:bg-neutral-100 text-neutral-500 rounded-lg transition-colors border border-black/5"
                        title="Edit User"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {u.uid !== profile?.uid && (
                        <button
                          onClick={() => handleDelete(u.uid, u.name)}
                          className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors border border-red-100"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-neutral-500">
                    No users found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Role Modal */}
      <AnimatePresence>
        {isModalOpen && editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-neutral-900">Manage User</h3>
                <button onClick={closeModal} className="p-2 hover:bg-neutral-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="flex items-center gap-4 p-4 bg-neutral-50 rounded-2xl border border-black/5">
                  <div className="w-12 h-12 rounded-full bg-white border border-black/5 overflow-hidden shrink-0">
                    {editingUser.photoURL ? (
                      <img src={editingUser.photoURL} alt={editingUser.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <UserCircle className="w-full h-full p-2 text-neutral-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-neutral-900 truncate">{editingUser.name}</p>
                    <p className="text-sm text-neutral-500 truncate">{editingUser.email}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-2 uppercase tracking-wider">Full Name</label>
                  <div className="relative">
                    <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      placeholder="Enter full name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-2 uppercase tracking-wider">NIK</label>
                  <div className="relative">
                    <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input
                      type="text"
                      value={formData.nik}
                      onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      placeholder="Enter NIK"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-2 uppercase tracking-wider">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input
                      type="text"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      placeholder="Enter user password"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-neutral-400 italic">Note: This is for reference and login. Changing it here won't automatically update Firebase Auth password if it was set via Auth.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-3 uppercase tracking-wider">Select Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setFormData({ ...formData, role })}
                        className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                          formData.role === role
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-black/5 hover:border-emerald-200 text-neutral-600'
                        }`}
                      >
                        <span className="text-xs font-bold capitalize">{role}</span>
                        {formData.role === role && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 py-3 px-4 border border-black/10 rounded-xl font-bold hover:bg-neutral-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                  >
                    Update User
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add User Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-neutral-900">Add New User</h3>
                <button onClick={closeAddModal} className="p-2 hover:bg-neutral-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-2 uppercase tracking-wider">Full Name</label>
                  <div className="relative">
                    <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      placeholder="Enter full name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-2 uppercase tracking-wider">NIK</label>
                  <div className="relative">
                    <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input
                      type="text"
                      value={formData.nik}
                      onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      placeholder="Enter NIK"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-2 uppercase tracking-wider">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      placeholder="Enter email address"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-2 uppercase tracking-wider">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      placeholder="Enter password"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-3 uppercase tracking-wider">Select Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setFormData({ ...formData, role })}
                        className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                          formData.role === role
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-black/5 hover:border-emerald-200 text-neutral-600'
                        }`}
                      >
                        <span className="text-xs font-bold capitalize">{role}</span>
                        {formData.role === role && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeAddModal}
                    className="flex-1 py-3 px-4 border border-black/10 rounded-xl font-bold hover:bg-neutral-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View User Modal */}
      <AnimatePresence>
        {viewingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-neutral-900">User Details</h3>
                <button onClick={closeViewModal} className="p-2 hover:bg-neutral-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-24 h-24 rounded-full bg-neutral-100 border-4 border-emerald-50 overflow-hidden shadow-inner">
                    {viewingUser.photoURL ? (
                      <img src={viewingUser.photoURL} alt={viewingUser.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <UserCircle className="w-full h-full p-4 text-neutral-400" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-2xl font-bold text-neutral-900">{viewingUser.name}</h4>
                    <span className={`mt-2 inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${
                      viewingUser.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                      viewingUser.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                      viewingUser.role === 'staf' ? 'bg-emerald-100 text-emerald-700' :
                      viewingUser.role === 'teknisi' ? 'bg-orange-100 text-orange-700' :
                      'bg-neutral-100 text-neutral-700'
                    }`}>
                      {viewingUser.role}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="p-4 bg-neutral-50 rounded-xl border border-black/5">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Email Address</p>
                    <div className="flex items-center gap-2 text-neutral-900 font-medium">
                      <Mail className="w-4 h-4 text-emerald-500" />
                      {viewingUser.email}
                    </div>
                  </div>

                  <div className="p-4 bg-neutral-50 rounded-xl border border-black/5">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">NIK (National ID)</p>
                    <div className="flex items-center gap-2 text-neutral-900 font-medium">
                      <Fingerprint className="w-4 h-4 text-emerald-500" />
                      {viewingUser.nik || 'Not set'}
                    </div>
                  </div>

                  <div className="p-4 bg-neutral-50 rounded-xl border border-black/5">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Password (Reference)</p>
                    <div className="flex items-center gap-2 text-neutral-900 font-medium">
                      <Lock className="w-4 h-4 text-emerald-500" />
                      {viewingUser.password || 'Not set'}
                    </div>
                  </div>

                  {viewingUser.telegramId && (
                    <div className="p-4 bg-neutral-50 rounded-xl border border-black/5">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Telegram ID</p>
                      <div className="flex items-center gap-2 text-neutral-900 font-medium">
                        <Shield className="w-4 h-4 text-emerald-500" />
                        {viewingUser.telegramId}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={closeViewModal}
                  className="w-full py-3 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        title="Delete User"
        message={`Are you sure you want to delete ${confirmDelete.name}? This will remove their profile and access to the system.`}
        confirmLabel="Delete User"
        onConfirm={confirmSingleDelete}
        onCancel={() => setConfirmDelete({ isOpen: false })}
        variant="danger"
      />
    </div>
  );
}
