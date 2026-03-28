import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, runTransaction, increment, Timestamp, writeBatch } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { Ticket, Customer, TicketStatus, TicketPriority, Technician, TicketCategory, UserProfile } from '../types';
import { calculateTicketPoints } from '../weights';
import { 
  Plus, 
  Search, 
  Filter, 
  Tag,
  Info,
  Link as LinkIcon,
  MoreVertical, 
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  User,
  Mail,
  Calendar,
  FileText,
  Plane,
  Briefcase,
  X,
  Check,
  Wrench,
  Trash2,
  UserPlus,
  Users,
  Edit2,
  Zap,
  UserCheck,
  ArrowRight,
  LayoutGrid,
  List as ListIcon,
  TrendingUp,
  AlertCircle as AlertIcon,
  CheckCircle as CheckIcon,
  Activity as ActivityIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import RepairRecordForm from './RepairRecordForm';
import TicketDetailsModal from './TicketDetailsModal';
import TicketSelector from './TicketSelector';
import DependencyManagerModal from './DependencyManagerModal';
import DashboardSummary from './DashboardSummary';
import TicketRow from './TicketRow';
import KanbanView from './KanbanView';
import NewTicketModal from './NewTicketModal';
import BulkUpdateModal from './BulkUpdateModal';
import AssignmentModal from './AssignmentModal';
import ConfirmationModal from './ConfirmationModal';

import { useToast } from './Toast';

interface TicketListProps {
  initialCustomerId?: string | null;
  onClearInitialCustomer?: () => void;
  profile?: UserProfile | null;
}

export default function TicketList({ initialCustomerId, onClearInitialCustomer, profile }: TicketListProps) {
  const [tickets, setTickets] = useState<(Ticket & { customerName?: string })[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | 'all'>('all');
  const [subCategoryFilter, setSubCategoryFilter] = useState<string | 'all'>('all');
  const [technicianFilter, setTechnicianFilter] = useState<string | 'all' | 'my'>('all');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isDependencyModalOpen, setIsDependencyModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<(Ticket & { customerName?: string }) | null>(null);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkData, setBulkData] = useState<{
    status: TicketStatus | '';
    technicianId: string | '';
  }>({
    status: '',
    technicianId: '',
  });
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // New Ticket Form State
  const [newTicket, setNewTicket] = useState({
    customerId: '',
    description: '',
    priority: 'medium' as TicketPriority,
    category: 'PROJECT' as TicketCategory,
    subCategory: '',
    status: 'open' as TicketStatus,
    technicianIds: [] as string[],
    dueDate: '',
    dependsOn: [] as string[],
    email: '',
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  useEffect(() => {
    if (selectedTicket) {
      const updatedTicket = tickets.find(t => t.id === selectedTicket.id);
      if (updatedTicket) {
        setSelectedTicket(updatedTicket);
      }
    }
  }, [tickets]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.customer-dropdown-container')) {
        setIsCustomerDropdownOpen(false);
      }
    };

    if (isCustomerDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCustomerDropdownOpen]);

  useEffect(() => {
    if (!isModalOpen) {
      setCustomerSearch('');
      setIsCustomerDropdownOpen(false);
    }
  }, [isModalOpen]);

  const { showToast } = useToast();
  
  useEffect(() => {
    if (initialCustomerId) {
      const customer = customers.find(c => c.id === initialCustomerId);
      if (customer) {
        setCustomerSearch(customer.name);
        setNewTicket(prev => ({ ...prev, customerId: initialCustomerId }));
        setIsModalOpen(true);
        onClearInitialCustomer?.();
      }
    }
  }, [initialCustomerId, customers]);

  useEffect(() => {
    const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const ticketData = await Promise.all(snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data() as Ticket;
        let customerName = 'Unknown';
        if (data.customerId) {
          const custDoc = await getDoc(doc(db, 'customers', data.customerId));
          if (custDoc.exists()) {
            customerName = custDoc.data().name;
          }
        }
        return { id: docSnap.id, ...data, customerName };
      }));
      setTickets(ticketData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tickets');
    });

    const custUnsubscribe = onSnapshot(collection(db, 'customers'), (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    });

    const techUnsubscribe = onSnapshot(collection(db, 'technicians'), (snapshot) => {
      setTechnicians(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician)));
    });

    return () => {
      unsubscribe();
      custUnsubscribe();
      techUnsubscribe();
    };
  }, []);

  const canManage = profile?.role === 'superadmin' || profile?.role === 'admin';
  const isTechnician = profile?.role === 'teknisi';
  const myTechnicianId = technicians.find(t => t.email === auth.currentUser?.email)?.id;

  const saveTicket = async () => {
    try {
      // Use a transaction to get a unique sequential ticket number
      const ticketNumber = await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, 'counters', 'tickets');
        const counterSnap = await transaction.get(counterRef);
        
        let nextNumber = 1001; // Start from 1001
        if (counterSnap.exists()) {
          nextNumber = counterSnap.data().current + 1;
        }
        
        transaction.set(counterRef, { current: nextNumber }, { merge: true });
        return nextNumber;
      });

      const points = calculateTicketPoints(newTicket.category, newTicket.subCategory);

      const ticketRef = await addDoc(collection(db, 'tickets'), {
        ...newTicket,
        ticketNumber,
        points,
        dueDate: newTicket.dueDate ? Timestamp.fromDate(new Date(newTicket.dueDate)) : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Log History
      await addDoc(collection(db, 'ticketHistory'), {
        ticketId: ticketRef.id,
        type: 'created',
        toValue: 'open',
        changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp()
      });

      setIsModalOpen(false);
      setNewTicket({ customerId: '', description: '', priority: 'medium', category: 'PROJECT', subCategory: '', status: 'open', technicianIds: [], dueDate: '', dependsOn: [], email: '' });
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
      showToast('Ticket created successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tickets');
      showToast('Failed to create ticket', 'error');
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicket.customerId) {
      showToast('Please select a customer', 'error');
      return;
    }
    
    setConfirmModal({
      isOpen: true,
      title: 'Create New Ticket?',
      message: 'Are you sure you want to create this service ticket? This will assign a ticket number and notify the relevant team.',
      onConfirm: saveTicket
    });
  };

  const handleStatusChange = (id: string, status: TicketStatus) => {
    if (status === 'resolved' || status === 'closed') {
      setConfirmModal({
        isOpen: true,
        title: `Mark as ${status.charAt(0).toUpperCase() + status.slice(1)}?`,
        message: `Are you sure you want to mark this ticket as ${status}? This will update the ticket status and record it in the history.`,
        onConfirm: () => {
          updateStatus(id, status);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      });
    } else {
      updateStatus(id, status);
    }
  };

  const handleSmartAssign = async (ticketId: string) => {
    try {
      // 1. Get available technicians
      const availableTechs = technicians.filter(t => t.availabilityStatus === 'Available');
      
      if (availableTechs.length === 0) {
        showToast('No available technicians found', 'error');
        return;
      }

      // 2. Calculate workload (active tickets) for each available technician
      const techWorkloads = availableTechs.map(tech => {
        const activeTicketsCount = tickets.filter(t => 
          t.technicianIds?.includes(tech.id) && 
          (t.status === 'open' || t.status === 'in-progress')
        ).length;
        return { tech, count: activeTicketsCount };
      });

      // 3. Sort by workload (ascending)
      techWorkloads.sort((a, b) => a.count - b.count);

      // 4. Pick the best one
      const bestTech = techWorkloads[0].tech;

      // 5. Assign
      await updateTechnician(ticketId, bestTech.id);
      showToast(`Smart Assigned to ${bestTech.name} (Workload: ${techWorkloads[0].count} active tickets)`);
    } catch (error) {
      console.error('Smart assignment error:', error);
      showToast('Smart assignment failed', 'error');
    }
  };

  const updateStatus = async (id: string, status: TicketStatus) => {
    try {
      const ticketDoc = await getDoc(doc(db, 'tickets', id));
      const ticketData = ticketDoc.data() as Ticket;
      const oldStatus = ticketData?.status;

      // Dependency Check
      if ((status === 'in-progress' || status === 'resolved') && ticketData.dependsOn && ticketData.dependsOn.length > 0) {
        const deps = await Promise.all(ticketData.dependsOn.map(async (depId) => {
          const depDoc = await getDoc(doc(db, 'tickets', depId));
          return depDoc.data() as Ticket;
        }));
        
        const unfinished = deps.filter(d => d.status !== 'resolved' && d.status !== 'closed');
        if (unfinished.length > 0) {
          showToast(`Cannot update status. Blocked by: ${unfinished.map(u => `#${u.ticketNumber}`).join(', ')}`, 'error');
          return;
        }
      }

      await updateDoc(doc(db, 'tickets', id), {
        status,
        updatedAt: serverTimestamp()
      });

      if (oldStatus !== status) {
        await addDoc(collection(db, 'ticketHistory'), {
          ticketId: id,
          type: 'status_change',
          fromValue: oldStatus,
          toValue: status,
          changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
          timestamp: serverTimestamp()
        });
        showToast(`Status updated to ${status.replace('-', ' ')}`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${id}`);
      showToast('Failed to update status', 'error');
    }
  };

  const updateTechnician = async (id: string, technicianId: string) => {
    try {
      const ticketDoc = await getDoc(doc(db, 'tickets', id));
      const ticketData = ticketDoc.data() as Ticket;
      const oldTechIds = ticketData?.technicianIds || [];
      const currentStatus = ticketData?.status;

      let newTechIds: string[];
      if (oldTechIds.includes(technicianId)) {
        newTechIds = oldTechIds.filter(tid => tid !== technicianId);
      } else {
        newTechIds = [...oldTechIds, technicianId];
      }

      const updates: any = {
        technicianIds: newTechIds,
        updatedAt: serverTimestamp()
      };

      // Auto-update status to in-progress if it was open and now assigned
      let statusChanged = false;
      if (oldTechIds.length === 0 && newTechIds.length > 0 && currentStatus === 'open') {
        updates.status = 'in-progress';
        statusChanged = true;
      }

      await updateDoc(doc(db, 'tickets', id), updates);

      const type = oldTechIds.includes(technicianId) ? 'technician_removed' : 'technician_added';
      
      await addDoc(collection(db, 'ticketHistory'), {
        ticketId: id,
        type: 'assignment_change',
        fromValue: oldTechIds,
        toValue: newTechIds,
        changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp()
      });

      if (statusChanged) {
        await addDoc(collection(db, 'ticketHistory'), {
          ticketId: id,
          type: 'status_change',
          fromValue: 'open',
          toValue: 'in-progress',
          changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
          timestamp: serverTimestamp(),
          note: 'Auto-updated on assignment'
        });
      }
      
      const techName = technicians.find(t => t.id === technicianId)?.name || 'Technician';
      showToast(`${techName} ${oldTechIds.includes(technicianId) ? 'removed from' : 'assigned to'} ticket${statusChanged ? ' and moved to In Progress' : ''}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${id}`);
      showToast('Failed to update assignment', 'error');
    }
  };

  const updatePriority = async (id: string, priority: TicketPriority) => {
    try {
      const ticketDoc = await getDoc(doc(db, 'tickets', id));
      const oldPriority = ticketDoc.data()?.priority;

      await updateDoc(doc(db, 'tickets', id), {
        priority,
        updatedAt: serverTimestamp()
      });

      if (oldPriority !== priority) {
        await addDoc(collection(db, 'ticketHistory'), {
          ticketId: id,
          type: 'priority_change',
          fromValue: oldPriority,
          toValue: priority,
          changedBy: auth.currentUser?.email || 'Unknown',
          timestamp: serverTimestamp()
        });
        showToast(`Priority updated to ${priority}`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${id}`);
      showToast('Failed to update priority', 'error');
    }
  };

  const handleGenerateDemo = async () => {
    try {
      showToast('Generating demo scenario...', 'info');
      
      // 1. Ensure we have a customer
      let demoCustomerId = customers[0]?.id;
      if (!demoCustomerId) {
        const custRef = await addDoc(collection(db, 'customers'), {
          name: 'Bpk. Budi Santoso (Demo)',
          phone: '081234567890',
          address: 'Jl. Merdeka No. 123, Jakarta',
          email: 'budi.demo@example.com'
        });
        demoCustomerId = custRef.id;
      }

      // 2. Ensure we have a technician
      let demoTechId = technicians[0]?.id;
      if (!demoTechId) {
        const techRef = await addDoc(collection(db, 'technicians'), {
          name: 'Andi Wijaya (Demo)',
          email: 'andi.tech@example.com',
          phone: '089876543210',
          availabilityStatus: 'Available',
          specialization: 'Fiber Optic'
        });
        demoTechId = techRef.id;
      }

      // 3. Create a Ticket
      const ticketNumber = await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, 'counters', 'tickets');
        const counterSnap = await transaction.get(counterRef);
        let nextNumber = 1001;
        if (counterSnap.exists()) {
          nextNumber = counterSnap.data().current + 1;
        }
        transaction.set(counterRef, { current: nextNumber }, { merge: true });
        return nextNumber;
      });

      const ticketRef = await addDoc(collection(db, 'tickets'), {
        customerId: demoCustomerId,
        description: 'Internet lambat dan sering terputus sejak pagi ini. Sudah coba restart ONT tapi masih sama.',
        priority: 'high',
        category: 'REGULER',
        subCategory: 'REGULER',
        status: 'resolved',
        technicianIds: [demoTechId],
        ticketNumber,
        dueDate: Timestamp.fromDate(new Date(Date.now() + 86400000)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 4. Add History
      const historyBatch = writeBatch(db);
      
      // Created
      historyBatch.set(doc(collection(db, 'ticketHistory')), {
        ticketId: ticketRef.id,
        type: 'created',
        toValue: 'open',
        changedBy: 'System Demo',
        timestamp: serverTimestamp()
      });

      // Assigned
      historyBatch.set(doc(collection(db, 'ticketHistory')), {
        ticketId: ticketRef.id,
        type: 'assignment_change',
        fromValue: '',
        toValue: demoTechId,
        changedBy: 'System Demo',
        timestamp: serverTimestamp()
      });

      // Status Change to In Progress
      historyBatch.set(doc(collection(db, 'ticketHistory')), {
        ticketId: ticketRef.id,
        type: 'status_change',
        fromValue: 'open',
        toValue: 'in-progress',
        changedBy: 'System Demo',
        timestamp: serverTimestamp()
      });

      // Status Change to Resolved
      historyBatch.set(doc(collection(db, 'ticketHistory')), {
        ticketId: ticketRef.id,
        type: 'status_change',
        fromValue: 'in-progress',
        toValue: 'resolved',
        changedBy: 'System Demo',
        timestamp: serverTimestamp()
      });

      await historyBatch.commit();

      // 5. Create Repair Record
      await addDoc(collection(db, 'repairRecords'), {
        ticketId: ticketRef.id,
        technicianId: demoTechId,
        startTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        endTime: new Date().toISOString(),
        notes: 'Ditemukan redaman tinggi pada konektor ODP. Dilakukan pembersihan konektor dan penggantian patchcord di sisi pelanggan. Hasil test: 50Mbps (Sesuai paket).',
        materialsUsed: [
          { name: 'Patchcord 3M', quantity: 1, unitPrice: 25000, materialId: 'demo_mat_1' },
          { name: 'Alcohol Swab', quantity: 2, unitPrice: 500, materialId: 'demo_mat_2' }
        ],
        createdAt: serverTimestamp()
      });

      showToast('Demo ticket generated successfully!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to generate demo scenario', 'error');
    }
  };

  const handleAssignToMe = async (id: string) => {
    const myTech = technicians.find(t => t.email === auth.currentUser?.email);
    if (myTech) {
      await updateTechnician(id, myTech.id);
    } else {
      showToast('You are not registered as a technician', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTicketIds.length === 0) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'Bulk Delete Tickets',
      message: `Are you sure you want to delete ${selectedTicketIds.length} tickets? This action is permanent and cannot be undone.`,
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          selectedTicketIds.forEach(id => {
            batch.delete(doc(db, 'tickets', id));
          });
          await batch.commit();
          setSelectedTicketIds([]);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          showToast(`Successfully deleted ${selectedTicketIds.length} tickets`);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'tickets/bulk');
          showToast('Failed to delete tickets', 'error');
        }
      }
    });
  };

  const handleBulkUpdate = async () => {
    if (selectedTicketIds.length === 0) return;
    if (!bulkData.status && !bulkData.technicianId) {
      showToast('Please select at least one change to apply', 'error');
      return;
    }

    try {
      const batch = writeBatch(db);
      
      for (const id of selectedTicketIds) {
        const updates: any = {
          updatedAt: serverTimestamp()
        };
        
        if (bulkData.status) {
          const oldTicket = tickets.find(t => t.id === id);
          updates.status = bulkData.status;
          
          const historyRef = doc(collection(db, 'ticketHistory'));
          batch.set(historyRef, {
            ticketId: id,
            type: 'status_change',
            fromValue: oldTicket?.status,
            toValue: bulkData.status,
            changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
            timestamp: serverTimestamp(),
            note: 'Bulk update'
          });
        }
        
        if (bulkData.technicianId) {
          const oldTicket = tickets.find(t => t.id === id);
          const oldTechIds = oldTicket?.technicianIds || [];
          let newTechIds: string[];

          if (bulkData.technicianId === 'unassigned') {
            newTechIds = [];
          } else {
            // For bulk, we replace with the selected technician
            newTechIds = [bulkData.technicianId];
          }
          
          updates.technicianIds = newTechIds;
          
          const historyRef = doc(collection(db, 'ticketHistory'));
          batch.set(historyRef, {
            ticketId: id,
            type: 'assignment_change',
            fromValue: oldTechIds,
            toValue: newTechIds,
            changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
            timestamp: serverTimestamp(),
            note: 'Bulk assignment'
          });
        }

        batch.update(doc(db, 'tickets', id), updates);
      }

      await batch.commit();
      showToast(`Successfully updated ${selectedTicketIds.length} tickets`);
      setSelectedTicketIds([]);
      setIsBulkModalOpen(false);
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'tickets/bulk');
      showToast('Failed to apply bulk updates', 'error');
    }
  };

  const openBulkModal = () => {
    setBulkData({ status: '', technicianId: '' });
    setIsBulkModalOpen(true);
  };

  const toggleSelectAll = () => {
    if (selectedTicketIds.length === filteredTickets.length) {
      setSelectedTicketIds([]);
    } else {
      setSelectedTicketIds(filteredTickets.map(t => t.id));
    }
  };

  const toggleSelectTicket = (id: string) => {
    setSelectedTicketIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
    setSubCategoryFilter('all');
    setTechnicianFilter('all');
  };

  const uniqueSubCategories = Array.from(new Set(
    tickets
      .filter(t => categoryFilter === 'all' || t.category === categoryFilter)
      .map(t => t.subCategory)
      .filter(Boolean)
  )) as string[];

  const getSLAStatus = (ticket: Ticket) => {
    if (ticket.status === 'resolved' || ticket.status === 'closed') return 'met';
    if (!ticket.dueDate) return 'met';

    const now = new Date();
    const due = ticket.dueDate instanceof Timestamp ? ticket.dueDate.toDate() : new Date(ticket.dueDate);
    
    if (now > due) return 'breached';
    
    // Warning if less than 2 hours remaining
    const diff = due.getTime() - now.getTime();
    if (diff < 2 * 60 * 60 * 1000) return 'warning';
    
    return 'met';
  };

  const filteredTickets = tickets.filter(t => {
    const customer = customers.find(c => c.id === t.customerId);
    const matchesSearch = t.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         t.ticketNumber?.toString().includes(searchQuery) ||
                         customer?.customerId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         customer?.odp?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    const matchesSubCategory = subCategoryFilter === 'all' || t.subCategory === subCategoryFilter;
    const matchesTechnician = technicianFilter === 'all' || 
                             (technicianFilter === 'unassigned' ? (!t.technicianIds || t.technicianIds.length === 0) : 
                             (technicianFilter === 'my' ? t.technicianIds?.includes(myTechnicianId || '') : t.technicianIds?.includes(technicianFilter)));
    return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesSubCategory && matchesTechnician;
  });

  const getStatusColor = (status: TicketStatus) => {
    switch (status) {
      case 'open': return 'bg-sky-50 text-sky-600 border-sky-100';
      case 'in-progress': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'resolved': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'closed': return 'bg-slate-50 text-slate-600 border-slate-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const getPriorityColor = (priority: TicketPriority) => {
    switch (priority) {
      case 'urgent': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'high': return 'bg-orange-50 text-orange-600 border-orange-100';
      case 'medium': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case 'low': return 'bg-slate-50 text-slate-600 border-slate-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <div className="space-y-6">
      <DashboardSummary tickets={tickets} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search tickets or customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AnimatePresence>
            {selectedTicketIds.length > 0 && canManage && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100"
              >
                <span className="text-xs font-bold text-emerald-700 mr-2">
                  {selectedTicketIds.length} Selected
                </span>
                <button
                  onClick={openBulkModal}
                  className="flex items-center gap-1.5 px-3 py-1 bg-white border border-emerald-200 rounded-lg text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Bulk Edit
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete Selected"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedTicketIds([])}
                  className="p-1.5 text-neutral-400 hover:bg-neutral-100 rounded-lg transition-colors"
                  title="Clear Selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {profile?.role === 'teknisi' && (
            <button
              onClick={() => setTechnicianFilter(technicianFilter === 'my' ? 'all' : 'my')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                technicianFilter === 'my'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20'
                  : 'bg-white text-neutral-600 border-black/5 hover:bg-neutral-50'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              My Tickets
            </button>
          )}
          <div className="flex items-center bg-white border border-black/5 rounded-xl p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="List View"
            >
              <ListIcon size={18} />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'kanban' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="Kanban View"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
          {canManage && (
            <>
              <button
                onClick={handleGenerateDemo}
                className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl font-medium hover:bg-amber-100 transition-all border border-amber-200"
                title="Generate a complete example ticket flow"
              >
                <Zap className="w-4 h-4" />
                Demo Flow
              </button>
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
              >
                <Plus className="w-5 h-5" />
                New Ticket
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <KanbanView 
          filteredTickets={filteredTickets}
          handleSmartAssign={handleSmartAssign}
          setIsDetailsModalOpen={setIsDetailsModalOpen}
          setSelectedTicket={setSelectedTicket}
          setNewTicket={setNewTicket}
          setIsModalOpen={setIsModalOpen}
          getPriorityColor={getPriorityColor}
          getSLAStatus={getSLAStatus}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50 text-neutral-500 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    className="rounded border-black/10 text-emerald-600 focus:ring-emerald-500/20"
                    checked={filteredTickets.length > 0 && selectedTicketIds.length === filteredTickets.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-6 py-4">#</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">SLA</th>
                <th className="px-6 py-4">Deps</th>
                <th className="px-6 py-4">Technician</th>
                <th className="px-6 py-4">Priority</th>
                <th className="px-6 py-4">Due Date</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4">Updated</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {loading ? (
                [1,2,3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={14} className="px-6 py-8"><div className="h-4 bg-neutral-100 rounded w-full"></div></td>
                  </tr>
                ))
              ) : filteredTickets.length > 0 ? filteredTickets.map((ticket) => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  technicians={technicians}
                  selectedTicketIds={selectedTicketIds}
                  toggleSelect={toggleSelectTicket}
                  handleStatusChange={handleStatusChange}
                  handleSmartAssign={handleSmartAssign}
                  handleAssignToMe={handleAssignToMe}
                  setIsAssignModalOpen={setIsAssignModalOpen}
                  setIsDependencyModalOpen={setIsDependencyModalOpen}
                  setIsRepairModalOpen={setIsRepairModalOpen}
                  setIsDetailsModalOpen={setIsDetailsModalOpen}
                  setSelectedTicket={setSelectedTicket}
                  setSelectedTicketId={setSelectedTicketId}
                  updatePriority={updatePriority}
                  updateTechnician={updateTechnician}
                  getStatusColor={getStatusColor}
                  getPriorityColor={getPriorityColor}
                  getSLAStatus={getSLAStatus as any}
                  tickets={tickets}
                />
              )) : (
                <tr>
                  <td colSpan={14} className="px-6 py-12 text-center text-neutral-500 italic">
                    No tickets found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )}

      <NewTicketModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        newTicket={newTicket}
        setNewTicket={setNewTicket}
        customerSearch={customerSearch}
        setCustomerSearch={setCustomerSearch}
        isCustomerDropdownOpen={isCustomerDropdownOpen}
        setIsCustomerDropdownOpen={setIsCustomerDropdownOpen}
        customers={customers}
        technicians={technicians}
        tickets={tickets}
        saveTicket={handleCreateTicket}
      />

      <BulkUpdateModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        bulkData={bulkData}
        setBulkData={setBulkData}
        technicians={technicians}
        handleBulkUpdate={handleBulkUpdate}
        selectedCount={selectedTicketIds.length}
      />

      {/* Assignment Modal */}
      <AnimatePresence>
        {isAssignModalOpen && selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between bg-neutral-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900">Assign Technician</h3>
                    <p className="text-xs text-neutral-500">Ticket #{selectedTicket.ticketNumber} • {selectedTicket.customerName}</p>
                  </div>
                </div>
                <button onClick={() => setIsAssignModalOpen(false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-neutral-500" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {technicians.map(tech => {
                    const isAssigned = selectedTicket.technicianIds?.includes(tech.id);
                    return (
                      <button
                        key={tech.id}
                        onClick={() => updateTechnician(selectedTicket.id, tech.id)}
                        className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                          isAssigned 
                            ? 'bg-emerald-50 border-emerald-200 shadow-sm' 
                            : 'bg-white border-black/5 hover:border-emerald-500/30 hover:shadow-md group'
                        }`}
                      >
                        <div className="relative">
                          <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400 border border-black/5 overflow-hidden">
                            {tech.photoURL ? (
                              <img src={tech.photoURL} alt={tech.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <User className="w-6 h-6" />
                            )}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                            tech.availabilityStatus === 'Available' ? 'bg-emerald-500' :
                            tech.availabilityStatus === 'Busy' ? 'bg-yellow-400' : 'bg-red-500'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-neutral-900 truncate">{tech.name}</h4>
                          <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">{tech.availabilityStatus || 'Available'}</p>
                        </div>
                        {isAssigned ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <ArrowRight className="w-5 h-5 text-neutral-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-6 border-t border-black/5 bg-neutral-50 flex justify-end">
                <button
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-6 py-2 text-sm font-bold text-neutral-500 hover:text-neutral-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dependency Manager Modal */}
      <AnimatePresence>
        {isDependencyModalOpen && selectedTicket && (
          <DependencyManagerModal
            ticket={selectedTicket}
            allTickets={tickets}
            onClose={() => {
              setIsDependencyModalOpen(false);
              setSelectedTicket(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Repair Record Modal */}
      <AnimatePresence>
        {isRepairModalOpen && selectedTicketId && (
          <RepairRecordForm 
            ticketId={selectedTicketId} 
            onClose={() => {
              setIsRepairModalOpen(false);
              setSelectedTicketId(null);
            }} 
            onSuccess={() => {
              // Optionally update ticket status to in-progress or resolved
              updateStatus(selectedTicketId, 'in-progress');
            }}
          />
        )}
      </AnimatePresence>
      {/* Ticket Details Modal */}
      <AnimatePresence>
        {isDetailsModalOpen && selectedTicket && (
          <TicketDetailsModal
            ticket={selectedTicket}
            technicians={technicians}
            allTickets={tickets}
            profile={profile}
            onClose={() => {
              setIsDetailsModalOpen(false);
              setSelectedTicket(null);
            }}
          />
        )}
      </AnimatePresence>

      <AssignmentModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        ticket={selectedTicket!}
        technicians={technicians}
        onUpdateTechnician={updateTechnician}
      />

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
      />
    </div>
  );
}
