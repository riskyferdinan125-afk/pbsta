import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, runTransaction, increment, Timestamp, writeBatch } from 'firebase/firestore';
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
import { calculateSLAStatus, getSLAStatusColor, getSLAStatusLabel, getSLARemainingTime } from '../lib/slaUtils';
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
import { getTechnicianSuggestions } from '../lib/assignmentUtils';
import { notifyTechnicians } from '../lib/notificationService';

import { useToast } from './Toast';

interface TicketListProps {
  initialCustomerId?: string | null;
  initialTicketId?: string | null;
  onClearInitialCustomer?: () => void;
  onClearInitialTicket?: () => void;
  profile?: UserProfile | null;
}

export default function TicketList({ 
  initialCustomerId, 
  initialTicketId,
  onClearInitialCustomer, 
  onClearInitialTicket,
  profile 
}: TicketListProps) {
  const resolvePhotoUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')) return url;
    if (!url.includes('/')) {
      return `/api/telegram-photo/${url}`;
    }
    return url;
  };
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
    technicianIds: string[];
  }>({
    status: '',
    technicianIds: [],
  });
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [showFilters, setShowFilters] = useState(false);
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
    category: '' as any,
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
    if (initialTicketId && tickets.length > 0) {
      const ticket = tickets.find(t => t.id === initialTicketId);
      if (ticket) {
        setSelectedTicket(ticket);
        setIsDetailsModalOpen(true);
        onClearInitialTicket?.();
      }
    }
  }, [initialTicketId, tickets, onClearInitialTicket]);

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

  useEffect(() => {
    if (tickets.length > 0) {
      const targetTicket = tickets.find(t => t.ticketNumber === 87324);
      if (targetTicket) {
        setSelectedTicketId(targetTicket.id);
        setIsRepairModalOpen(true);
      }
    }
  }, [tickets]);

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

    const techQuery = query(collection(db, 'users'), where('role', '==', 'teknisi'));
    const techUnsubscribe = onSnapshot(techQuery, (snapshot) => {
      setTechnicians(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as Technician)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => {
      unsubscribe();
      custUnsubscribe();
      techUnsubscribe();
    };
  }, []);

  const canManage = profile?.role === 'superadmin' || profile?.role === 'admin';
  const isTechnician = profile?.role === 'teknisi';
  const myTechnicianId = profile?.uid;

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

      // Calculate SLA Deadline based on priority
      const slaHours = {
        urgent: 4,
        high: 8,
        medium: 24,
        low: 48
      }[newTicket.priority] || 24;
      
      const slaDeadline = new Date();
      slaDeadline.setHours(slaDeadline.getHours() + slaHours);

      const ticketRef = await addDoc(collection(db, 'tickets'), {
        ...newTicket,
        ticketNumber,
        points,
        slaDeadline: Timestamp.fromDate(slaDeadline),
        slaStatus: 'within-sla',
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

      // Notify assigned technicians
      if (newTicket.technicianIds.length > 0) {
        await notifyTechnicians(
          newTicket.technicianIds,
          'New Ticket Assigned',
          `You have been assigned to a new ticket #${ticketNumber}: ${newTicket.description.slice(0, 50)}...`,
          'info',
          'newTicket',
          `/tickets?id=${ticketRef.id}`
        );
      }

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
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;

      // Use the smart ranking utility
      const suggestions = getTechnicianSuggestions(ticket, technicians, tickets);
      
      // Filter for available technicians first
      const availableSuggestions = suggestions.filter(s => s.technician.availabilityStatus === 'Available');
      
      if (availableSuggestions.length === 0) {
        showToast('No available technicians found for smart assignment', 'error');
        return;
      }

      // Pick the top match
      const bestMatch = availableSuggestions[0];

      // Assign
      await updateTechnician(ticketId, bestMatch.technician.id);
      
      const skillReason = bestMatch.reasons.find(r => r.includes('Skill Match') || r.includes('Specialization Match'));
      const workloadReason = bestMatch.reasons.find(r => r.includes('Workload'));
      
      let reasonText = '';
      if (skillReason) reasonText = ` (${skillReason})`;
      else if (workloadReason) reasonText = ` (${workloadReason})`;

      showToast(`Smart Assigned to ${bestMatch.technician.name}${reasonText}`, 'success');
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
          timestamp: serverTimestamp(),
          description: 'Status updated manually'
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

      // Notify newly assigned technicians
      const newlyAssigned = newTechIds.filter(tid => !oldTechIds.includes(tid));
      if (newlyAssigned.length > 0) {
        await notifyTechnicians(
          newlyAssigned,
          'New Ticket Assigned',
          `You have been assigned to ticket #${ticketData.ticketNumber}: ${ticketData.description.slice(0, 50)}...`,
          'info',
          'newTicket',
          `/tickets?id=${id}`
        );
      }

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

  const handleStartTimer = async (id: string) => {
    try {
      const ticket = tickets.find(t => t.id === id);
      if (!ticket) return;

      await updateDoc(doc(db, 'tickets', id), {
        isTimerRunning: true,
        timerStartedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'ticketHistory'), {
        ticketId: id,
        type: 'timer_event',
        toValue: 'started',
        changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp(),
        description: 'Work timer started'
      });
      showToast('Work timer started');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${id}`);
      showToast('Failed to start timer', 'error');
    }
  };

  const handleStopTimer = async (id: string) => {
    try {
      const ticket = tickets.find(t => t.id === id);
      if (!ticket || !ticket.timerStartedAt) return;

      const timerStartedAt = ticket.timerStartedAt;
      const startTime = typeof timerStartedAt === 'string' 
        ? new Date(timerStartedAt) 
        : (timerStartedAt as any).toDate();
      
      const endTime = new Date();
      const diffMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
      const totalTime = (ticket.totalTimeSpent || 0) + diffMinutes;

      await updateDoc(doc(db, 'tickets', id), {
        isTimerRunning: false,
        timerStartedAt: null,
        totalTimeSpent: totalTime,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'ticketHistory'), {
        ticketId: id,
        type: 'timer_event',
        fromValue: 'started',
        toValue: 'stopped',
        changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp(),
        description: `Work session ended: ${diffMinutes} minutes. Total: ${totalTime} minutes.`
      });

      showToast(`Work timer stopped. Added ${diffMinutes} minutes.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${id}`);
      showToast('Failed to stop timer', 'error');
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
          changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
          timestamp: serverTimestamp(),
          description: 'Priority updated manually'
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
        const techRef = await addDoc(collection(db, 'users'), {
          name: 'Andi Wijaya (Demo)',
          email: 'andi.tech@example.com',
          phone: '089876543210',
          role: 'teknisi',
          availabilityStatus: 'Available',
          specialization: 'Fiber Optic',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
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
        points: calculateTicketPoints('REGULER', 'REGULER'),
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
    if (!bulkData.status && bulkData.technicianIds.length === 0) {
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
        
        if (bulkData.technicianIds.length > 0) {
          const oldTicket = tickets.find(t => t.id === id);
          const oldTechIds = oldTicket?.technicianIds || [];
          let newTechIds: string[];

          if (bulkData.technicianIds.includes('unassigned')) {
            newTechIds = [];
          } else {
            // For bulk, we replace with the selected technicians
            newTechIds = bulkData.technicianIds;
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
      setBulkData({ status: '', technicianIds: [] });
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'tickets/bulk');
      showToast('Failed to apply bulk updates', 'error');
    }
  };

  const openBulkModal = () => {
    setBulkData({ status: '', technicianIds: [] });
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

  const getSLAStatus = (ticket: Ticket) => calculateSLAStatus(ticket);

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
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search tickets or customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>
          {/^\d+$/.test(searchQuery) && (
            <button
              onClick={() => {
                const target = tickets.find(t => t.ticketNumber === parseInt(searchQuery));
                if (target) {
                  setSelectedTicketId(target.id);
                  setIsRepairModalOpen(true);
                } else {
                  showToast(`Ticket #${searchQuery} not found`, 'error');
                }
              }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 whitespace-nowrap"
            >
              Open Repair
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
              showFilters || statusFilter !== 'all' || priorityFilter !== 'all' || categoryFilter !== 'all' || technicianFilter !== 'all'
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-white text-neutral-600 border-black/5 hover:bg-neutral-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {(statusFilter !== 'all' || priorityFilter !== 'all' || categoryFilter !== 'all' || technicianFilter !== 'all') && (
              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
            )}
          </button>

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

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider ml-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-black/5 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="all">All Status</option>
                  <option value="open">Open</option>
                  <option value="in-progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider ml-1">Priority</label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as any)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-black/5 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="all">All Priority</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider ml-1">Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value as any);
                    setSubCategoryFilter('all');
                  }}
                  className="w-full px-3 py-2 bg-neutral-50 border border-black/5 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="all">All Category</option>
                  <option value="PROJECT">Project</option>
                  <option value="REGULER">Reguler</option>
                  <option value="PSB">PSB</option>
                  <option value="SQM">SQM</option>
                  <option value="UNSPEKS">Unspeks</option>
                  <option value="EXBIS">Exbis</option>
                  <option value="CORRECTIVE">Corrective</option>
                  <option value="PREVENTIVE">Preventive</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider ml-1">Technician</label>
                <select
                  value={technicianFilter}
                  onChange={(e) => setTechnicianFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-black/5 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="all">All Technicians</option>
                  <option value="my">My Tickets</option>
                  <option value="unassigned">Unassigned</option>
                  {technicians.map(tech => (
                    <option key={tech.id} value={tech.id}>{tech.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={resetFilters}
                  className="w-full px-4 py-2 bg-neutral-100 text-neutral-600 rounded-xl text-xs font-bold hover:bg-neutral-200 transition-all flex items-center justify-center gap-2"
                >
                  <X className="w-3.5 h-3.5" />
                  Reset Filters
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {viewMode === 'kanban' ? (
        <KanbanView 
          filteredTickets={filteredTickets}
          handleSmartAssign={handleSmartAssign}
          handleAssignToMe={handleAssignToMe}
          setIsDetailsModalOpen={setIsDetailsModalOpen}
          setSelectedTicket={setSelectedTicket}
          setNewTicket={setNewTicket}
          setIsModalOpen={setIsModalOpen}
          getPriorityColor={getPriorityColor}
          getSLAStatus={getSLAStatus}
          isTechnician={isTechnician}
          myTechnicianId={myTechnicianId}
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
                  handleStartTimer={handleStartTimer}
                handleStopTimer={handleStopTimer}
                getStatusColor={getStatusColor}
                  getPriorityColor={getPriorityColor}
                  getSLAStatus={getSLAStatus as any}
                  tickets={tickets}
                  isTechnician={isTechnician}
                  myTechnicianId={myTechnicianId}
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
        allTickets={tickets}
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
