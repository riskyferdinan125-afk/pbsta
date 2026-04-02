import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, Timestamp, addDoc, serverTimestamp, updateDoc, doc, getDoc, getDocs } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { 
  calculateTicketPoints, 
  specificCategoryWeights,
  projectSubCategoryWeights,
  regulerSubCategoryWeights,
  psbSubCategoryWeights,
  sqmSubCategoryWeights,
  unspeksSubCategoryWeights,
  exbisSubCategoryWeights,
  correctiveSubCategoryWeights,
  preventiveSubCategoryWeights
} from '../weights';
import { Ticket, TicketHistory, Technician, Customer, TicketStatus, TicketPriority, TicketCategory, RepairRecord, TicketNote, UserProfile, ChecklistItem, Notification, Material } from '../types';
import { X, Edit2, Check, TrendingUp, Clock, User, ArrowRight, History, Info, Wrench, Send, MessageSquare, UserPlus, RefreshCw, PlusCircle, Link as LinkIcon, AlertTriangle, CheckCircle, Package, StickyNote, ChevronRight, Loader2, Hash, Box, MapPin, Phone, Mail, Camera, Play, Square, Navigation, Timer, HelpCircle, Trash2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from './Toast';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidMapsKey = Boolean(API_KEY) && API_KEY !== '';

import DependencyManagerModal from './DependencyManagerModal';
import TechnicianGuide from './TechnicianGuide';

interface TicketDetailsModalProps {
  ticket: Ticket & { customerName?: string };
  onClose: () => void;
  technicians: Technician[];
  allTickets?: Ticket[];
  profile?: UserProfile | null;
}

export default function TicketDetailsModal({ ticket, onClose, technicians, allTickets = [], profile }: TicketDetailsModalProps) {
  const { showToast } = useToast();
  const resolvePhotoUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')) return url;
    if (!url.includes('/')) {
      return `/api/telegram-photo/${url}`;
    }
    return url;
  };
  const [history, setHistory] = useState<TicketHistory[]>([]);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [repairRecords, setRepairRecords] = useState<RepairRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dependencyTickets, setDependencyTickets] = useState<Ticket[]>([]);
  const [isManageDepsModalOpen, setIsManageDepsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'notes' | 'assignments' | 'materials'>('details');
  const [materialsUsed, setMaterialsUsed] = useState<any[]>([]);
  const [availableMaterials, setAvailableMaterials] = useState<Material[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [materialQuantity, setMaterialQuantity] = useState(1);
  const [materialPrice, setMaterialPrice] = useState(0);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [statusComment, setStatusComment] = useState('');

  const assignedTechnicians = technicians.filter(tech => ticket.technicianIds?.includes(tech.id));
  const hasLocationData = assignedTechnicians.some(tech => tech.location);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const canManage = profile?.role === 'superadmin' || profile?.role === 'admin';
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [isEditingSubCategory, setIsEditingSubCategory] = useState(false);
  const [tempCategory, setTempCategory] = useState<TicketCategory>(ticket.category);
  const [tempSubCategory, setTempSubCategory] = useState(ticket.subCategory || '');

  useEffect(() => {
    const material = availableMaterials.find(m => m.id === selectedMaterialId);
    if (material) {
      setMaterialPrice(material.price);
    } else {
      setMaterialPrice(0);
    }
  }, [selectedMaterialId, availableMaterials]);

  const handleAddMaterial = async () => {
    const material = availableMaterials.find(m => m.id === selectedMaterialId);
    if (!material) return;

    try {
      await addDoc(collection(db, 'tickets', ticket.id, 'materialsUsed'), {
        materialId: material.id,
        name: material.name,
        quantity: materialQuantity,
        unitPrice: materialPrice,
        addedBy: auth.currentUser?.email || 'Unknown',
        createdAt: serverTimestamp()
      });
      
      setSelectedMaterialId('');
      setMaterialQuantity(1);
      setMaterialPrice(0);
      showToast('Material added to ticket', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `tickets/${ticket.id}/materialsUsed`);
    }
  };

  const handleRemoveMaterial = async (id: string) => {
    try {
      await updateDoc(doc(db, 'tickets', ticket.id, 'materialsUsed', id), {
        deleted: true // Or just delete it
      });
      // Actually let's just delete it for simplicity as per request
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'tickets', ticket.id, 'materialsUsed', id));
      showToast('Material removed from ticket', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tickets/${ticket.id}/materialsUsed/${id}`);
    }
  };
  const sendNotification = async (userId: string, title: string, message: string, type: string, link?: string) => {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId,
        title,
        message,
        type,
        link,
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error sending notification:", error);
    }
  };

  useEffect(() => {
    if (ticket.customerId) {
      const fetchCustomer = async () => {
        const docSnap = await getDoc(doc(db, 'customers', ticket.customerId));
        if (docSnap.exists()) {
          setCustomer({ id: docSnap.id, ...docSnap.data() } as Customer);
        }
      };
      fetchCustomer();
    }
  }, [ticket.customerId]);

  useEffect(() => {
    if (ticket.dependsOn && ticket.dependsOn.length > 0) {
      const fetchDeps = async () => {
        const deps = await Promise.all(ticket.dependsOn!.map(async (id) => {
          const docSnap = await getDoc(doc(db, 'tickets', id));
          return { id: docSnap.id, ...docSnap.data() } as Ticket;
        }));
        setDependencyTickets(deps);
      };
      fetchDeps();
    } else {
      setDependencyTickets([]);
    }
  }, [ticket.dependsOn]);

  useEffect(() => {
    const q = query(
      collection(db, 'ticketHistory'),
      where('ticketId', '==', ticket.id),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TicketHistory)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ticketHistory');
    });

    const repairQ = query(
      collection(db, 'repairRecords'),
      where('ticketId', '==', ticket.id),
      orderBy('startTime', 'desc')
    );

    const unsubRepairs = onSnapshot(repairQ, (snapshot) => {
      setRepairRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RepairRecord)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'repairRecords');
    });

    const notesQ = query(
      collection(db, 'ticketNotes'),
      where('ticketId', '==', ticket.id),
      orderBy('createdAt', 'desc')
    );

    const unsubNotes = onSnapshot(notesQ, (snapshot) => {
      setNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TicketNote)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ticketNotes');
    });

    const unsubMaterialsUsed = onSnapshot(collection(db, 'tickets', ticket.id, 'materialsUsed'), (snapshot) => {
      setMaterialsUsed(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubAvailableMaterials = onSnapshot(collection(db, 'materials'), (snapshot) => {
      setAvailableMaterials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Material)));
    });

    return () => {
      unsubscribe();
      unsubRepairs();
      unsubNotes();
      unsubMaterialsUsed();
      unsubAvailableMaterials();
    };
  }, [ticket.id]);

  const getTechnicianName = (id: string) => {
    return technicians.find(t => t.id === id)?.name || 'Unknown';
  };

  const formatValue = (value: string | string[]) => {
    if (Array.isArray(value)) {
      if (value.length === 0) return 'Unassigned';
      return value.map(id => getTechnicianName(id)).join(', ');
    }
    if (!value) return 'Unassigned';
    return getTechnicianName(value);
  };

  const handleUpdateTechnician = async (technicianId: string) => {
    try {
      const oldTechIds = ticket.technicianIds || [];
      const currentStatus = ticket.status;

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

      await updateDoc(doc(db, 'tickets', ticket.id), updates);

      // Notify newly assigned technicians
      for (const tid of newTechIds) {
        if (!oldTechIds.includes(tid)) {
          const tech = technicians.find(t => t.id === tid);
          if (tech && tech.email) {
            const userQuery = query(collection(db, 'users'), where('email', '==', tech.email), where('role', '==', 'teknisi'));
            const userSnap = await getDocs(userQuery);
            if (!userSnap.empty) {
              await sendNotification(
                userSnap.docs[0].id,
                'New Ticket Assigned',
                `You have been assigned to ticket #${ticket.id.slice(0, 8)}: ${ticket.title}`,
                'info',
                `/tickets?id=${ticket.id}`
              );
            }
          }
        }
      }

      await addDoc(collection(db, 'ticketHistory'), {
        ticketId: ticket.id,
        type: 'assignment_change',
        fromValue: oldTechIds,
        toValue: newTechIds,
        changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp()
      });

      if (statusChanged) {
        await addDoc(collection(db, 'ticketHistory'), {
          ticketId: ticket.id,
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
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
      showToast('Failed to update assignment', 'error');
    }
  };

  const handleAssignToMe = async () => {
    const myTech = technicians.find(t => t.email === auth.currentUser?.email);
    if (myTech) {
      if (ticket.technicianIds?.includes(myTech.id)) {
        showToast('You are already assigned to this ticket', 'info');
        return;
      }
      await handleUpdateTechnician(myTech.id);
    } else {
      showToast('You are not registered as a technician', 'error');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setIsSubmitting(true);
    try {
      // Add to dedicated notes collection
      await addDoc(collection(db, 'ticketNotes'), {
        ticketId: ticket.id,
        note: newNote,
        createdBy: profile?.name || auth.currentUser?.email || 'Unknown',
        createdAt: serverTimestamp()
      });

      // Also log to history for audit trail
      await addDoc(collection(db, 'ticketHistory'), {
        ticketId: ticket.id,
        type: 'note_added',
        toValue: newNote,
        changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp()
      });

      // Notify admins if technician added a note
      if (profile?.role === 'teknisi') {
        await sendNotification(
          'admin',
          'New Technician Note',
          `${profile.name} added a note to ticket #${ticket.id.slice(0, 8)}`,
          'info',
          `/tickets?id=${ticket.id}`
        );
      }

      setNewNote('');
      showToast('Note added successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'ticketNotes');
      showToast('Failed to add note', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateDueDate = async (dateStr: string) => {
    try {
      const newDueDate = dateStr ? Timestamp.fromDate(new Date(dateStr)) : null;
      await updateDoc(doc(db, 'tickets', ticket.id), {
        dueDate: newDueDate,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'ticketHistory'), {
        ticketId: ticket.id,
        type: 'note_added',
        toValue: `Updated due date to: ${dateStr || 'Not Set'}`,
        changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp()
      });

      showToast(`Due date updated to ${dateStr || 'Not Set'}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
      showToast('Failed to update due date', 'error');
    }
  };

  const handleUpdatePriority = async (priority: TicketPriority) => {
    try {
      const oldPriority = ticket.priority;
      if (oldPriority === priority) return;

      await updateDoc(doc(db, 'tickets', ticket.id), {
        priority,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'ticketHistory'), {
        ticketId: ticket.id,
        type: 'priority_change',
        fromValue: oldPriority,
        toValue: priority,
        changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp()
      });

      showToast(`Priority updated to ${priority}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
      showToast('Failed to update priority', 'error');
    }
  };

  const handleUpdateCategory = async (category: TicketCategory) => {
    try {
      const oldCategory = ticket.category;
      if (oldCategory === category) {
        setIsEditingCategory(false);
        return;
      }

      const newPoints = calculateTicketPoints(category, ticket.subCategory);

      await updateDoc(doc(db, 'tickets', ticket.id), {
        category,
        points: newPoints,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'ticketHistory'), {
        ticketId: ticket.id,
        type: 'status_change',
        fromValue: oldCategory,
        toValue: category,
        changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp(),
        note: `Category updated. Points recalculated to ${newPoints}`
      });

      setIsEditingCategory(false);
      showToast(`Category updated to ${category}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
      showToast('Failed to update category', 'error');
    }
  };

  const handleUpdateSubCategory = async () => {
    try {
      const oldSubCategory = ticket.subCategory || '';
      if (oldSubCategory === tempSubCategory) {
        setIsEditingSubCategory(false);
        return;
      }

      const newPoints = calculateTicketPoints(ticket.category, tempSubCategory);

      await updateDoc(doc(db, 'tickets', ticket.id), {
        subCategory: tempSubCategory,
        points: newPoints,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'ticketHistory'), {
        ticketId: ticket.id,
        type: 'status_change',
        fromValue: oldSubCategory,
        toValue: tempSubCategory,
        changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp(),
        note: `Sub-category updated. Points recalculated to ${newPoints}`
      });

      setIsEditingSubCategory(false);
      showToast(`Sub-category updated to ${tempSubCategory}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
      showToast('Failed to update sub-category', 'error');
    }
  };

  const getCurrentLocation = (): Promise<{ lat: number, lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  };

  const handleStartTimer = async () => {
    try {
      await updateDoc(doc(db, 'tickets', ticket.id), {
        isTimerRunning: true,
        timerStartedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      showToast('Work timer started');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
      showToast('Failed to start timer', 'error');
    }
  };

  const handleStopTimer = async () => {
    if (!ticket.timerStartedAt) return;
    
    try {
      const startTime = ticket.timerStartedAt.toDate();
      const endTime = new Date();
      const diffMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
      const totalTime = (ticket.totalTimeSpent || 0) + diffMinutes;

      await updateDoc(doc(db, 'tickets', ticket.id), {
        isTimerRunning: false,
        timerStartedAt: null,
        totalTimeSpent: totalTime,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'ticketHistory'), {
        ticketId: ticket.id,
        type: 'note_added',
        toValue: `Work session ended: ${diffMinutes} minutes. Total: ${totalTime} minutes.`,
        changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp()
      });

      showToast(`Work timer stopped. Added ${diffMinutes} minutes.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
      showToast('Failed to stop timer', 'error');
    }
  };

  const handleUploadPhoto = async (type: 'before' | 'after') => {
    // Simulated photo upload
    const mockUrl = `https://picsum.photos/seed/${ticket.id}-${type}/800/600`;
    try {
      await updateDoc(doc(db, 'tickets', ticket.id), {
        [type === 'before' ? 'beforePhoto' : 'afterPhoto']: mockUrl,
        updatedAt: serverTimestamp()
      });
      showToast(`${type === 'before' ? 'Before' : 'After'} photo uploaded`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
      showToast('Failed to upload photo', 'error');
    }
  };

  const handleAddChecklistItem = async () => {
    if (!newChecklistItem.trim()) return;
    const newItem: ChecklistItem = { task: newChecklistItem.trim(), completed: false };
    const updatedChecklist = [...(ticket.checklist || []), newItem];
    
    try {
      await updateDoc(doc(db, 'tickets', ticket.id), {
        checklist: updatedChecklist,
        updatedAt: serverTimestamp()
      });
      setNewChecklistItem('');
      showToast('Checklist item added');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
      showToast('Failed to add checklist item', 'error');
    }
  };

  const handleToggleChecklistItem = async (index: number) => {
    const updatedChecklist = [...(ticket.checklist || [])];
    const item = updatedChecklist[index];
    item.completed = !item.completed;
    
    if (item.completed) {
      item.completedAt = Timestamp.now();
      item.completedBy = profile?.name || auth.currentUser?.email || 'Unknown';
      const loc = await getCurrentLocation();
      if (loc) item.location = loc;
    } else {
      delete item.completedAt;
      delete item.completedBy;
      delete item.location;
    }
    
    try {
      const updates: any = {
        checklist: updatedChecklist,
        updatedAt: serverTimestamp()
      };
      
      const loc = await getCurrentLocation();
      if (loc) {
        updates.lastLocation = { ...loc, updatedAt: serverTimestamp() };
      }

      await updateDoc(doc(db, 'tickets', ticket.id), updates);

      // Notify admins if all checklist items are completed
      if (updatedChecklist.length > 0 && updatedChecklist.every(item => item.completed)) {
        await sendNotification(
          'admin',
          'Checklist Completed',
          `All checklist items for ticket #${ticket.id.slice(0, 8)} have been completed by ${profile?.name || 'Technician'}`,
          'success',
          `/tickets?id=${ticket.id}`
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
      showToast('Failed to update checklist item', 'error');
    }
  };

  const handleRemoveChecklistItem = async (index: number) => {
    const updatedChecklist = (ticket.checklist || []).filter((_, i) => i !== index);
    
    try {
      await updateDoc(doc(db, 'tickets', ticket.id), {
        checklist: updatedChecklist,
        updatedAt: serverTimestamp()
      });
      showToast('Checklist item removed');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
      showToast('Failed to remove checklist item', 'error');
    }
  };

  const handleUpdateStatus = async (status: TicketStatus) => {
    if (ticket.status === status) return;
    setPendingStatus(status);
    setIsUpdatingStatus(true);
  };

  const confirmStatusUpdate = async () => {
    if (!pendingStatus || !statusComment.trim()) {
      showToast('Please provide a comment for the status change', 'error');
      return;
    }

    try {
      const oldStatus = ticket.status;
      const status = pendingStatus;

      // Dependency Check
      if ((status === 'in-progress' || status === 'resolved') && ticket.dependsOn && ticket.dependsOn.length > 0) {
        const deps = await Promise.all(ticket.dependsOn.map(async (depId) => {
          const depDoc = await getDoc(doc(db, 'tickets', depId));
          return { id: depDoc.id, ...depDoc.data() } as Ticket;
        }));
        
        const unfinished = deps.filter(d => d.status !== 'resolved' && d.status !== 'closed');
        if (unfinished.length > 0) {
          showToast(`Cannot update status. Blocked by: ${unfinished.map(u => `#${u.ticketNumber}`).join(', ')}`, 'error');
          setIsUpdatingStatus(false);
          return;
        }
      }

      const updates: any = {
        status,
        updatedAt: serverTimestamp()
      };

      const loc = await getCurrentLocation();
      if (loc) {
        updates.lastLocation = { ...loc, updatedAt: serverTimestamp() };
      }

      await updateDoc(doc(db, 'tickets', ticket.id), updates);

      // Notify customer if status changed
      if (ticket.customerId) {
        const customerDoc = await getDoc(doc(db, 'customers', ticket.customerId));
        if (customerDoc.exists()) {
          const customerData = customerDoc.data();
          if (customerData.email) {
            const userQuery = query(collection(db, 'users'), where('email', '==', customerData.email));
            const userSnap = await getDocs(userQuery);
            if (!userSnap.empty) {
              await sendNotification(
                userSnap.docs[0].id,
                'Ticket Status Updated',
                `Your ticket #${ticket.id.slice(0, 8)} status has been updated to ${status}`,
                'info',
                `/portal`
              );
            }
          }
        }
      }

      // Notify admins if technician updated status
      if (profile?.role === 'teknisi') {
        await sendNotification(
          'admin',
          'Ticket Status Updated',
          `${profile.name} updated ticket #${ticket.id.slice(0, 8)} to ${status}`,
          'info',
          `/tickets?id=${ticket.id}`
        );
      }

      await addDoc(collection(db, 'ticketHistory'), {
        ticketId: ticket.id,
        type: 'status_change',
        fromValue: oldStatus,
        toValue: status,
        changedBy: profile?.name || auth.currentUser?.email || 'Unknown',
        timestamp: serverTimestamp(),
        description: statusComment
      });

      // Also add as a note
      await addDoc(collection(db, 'ticketNotes'), {
        ticketId: ticket.id,
        note: `Status changed to ${status}: ${statusComment}`,
        createdBy: profile?.name || auth.currentUser?.email || 'Unknown',
        createdAt: serverTimestamp()
      });

      showToast(`Status updated to ${status.replace('-', ' ')}`);
      setIsUpdatingStatus(false);
      setPendingStatus(null);
      setStatusComment('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
      showToast('Failed to update status', 'error');
    }
  };

  const getSubCategories = (category: TicketCategory) => {
    switch (category) {
      case 'PROJECT': return Object.keys(projectSubCategoryWeights);
      case 'REGULER': return Object.keys(regulerSubCategoryWeights);
      case 'PSB': return Object.keys(psbSubCategoryWeights);
      case 'SQM': return Object.keys(sqmSubCategoryWeights);
      case 'UNSPEKS': return Object.keys(unspeksSubCategoryWeights);
      case 'EXBIS': return Object.keys(exbisSubCategoryWeights);
      case 'CORRECTIVE': return Object.keys(correctiveSubCategoryWeights);
      case 'PREVENTIVE': return Object.keys(preventiveSubCategoryWeights);
      default: return [];
    }
  };

  const subCategories = getSubCategories(ticket.category);

  const getPriorityColor = (priority: TicketPriority) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-600';
      case 'high': return 'bg-orange-100 text-orange-600';
      case 'medium': return 'bg-blue-100 text-blue-600';
      case 'low': return 'bg-neutral-100 text-neutral-600';
      default: return 'bg-neutral-100 text-neutral-600';
    }
  };

  const getHistoryIcon = (type: string) => {
    switch (type) {
      case 'created': return <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />;
      case 'status_change': return <RefreshCw className="w-3.5 h-3.5 text-blue-500" />;
      case 'assignment_change': return <UserPlus className="w-3.5 h-3.5 text-purple-500" />;
      case 'priority_change': return <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />;
      case 'dependency_change': return <LinkIcon className="w-3.5 h-3.5 text-blue-500" />;
      case 'note_added': return <MessageSquare className="w-3.5 h-3.5 text-orange-500" />;
      default: return <History className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  const formatHistoryMessage = (item: TicketHistory) => {
    switch (item.type) {
      case 'created':
        return <span className="text-neutral-900 font-medium">Ticket created</span>;
      case 'status_change':
        return (
          <div className="flex flex-col gap-1">
            <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider">Status Update</span>
            <div className="flex items-center gap-2">
              <span className="font-bold uppercase text-[10px] px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-md border border-black/5">{item.fromValue}</span>
              <ArrowRight className="w-3 h-3 text-neutral-400" />
              <span className="font-bold uppercase text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md border border-emerald-200">{item.toValue}</span>
            </div>
          </div>
        );
      case 'assignment_change':
        return (
          <div className="flex flex-col gap-1">
            <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider">Assignment Update</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-600 font-medium">{formatValue(item.fromValue)}</span>
              <ArrowRight className="w-3 h-3 text-neutral-400" />
              <span className="text-sm text-emerald-700 font-bold">{formatValue(item.toValue)}</span>
            </div>
          </div>
        );
      case 'priority_change':
        return (
          <div className="flex flex-col gap-1">
            <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider">Priority Update</span>
            <div className="flex items-center gap-2">
              <span className="font-bold uppercase text-[10px] px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-md border border-black/5">{item.fromValue}</span>
              <ArrowRight className="w-3 h-3 text-neutral-400" />
              <span className="font-bold uppercase text-[10px] px-2 py-0.5 bg-orange-100 text-orange-700 rounded-md border border-orange-200">{item.toValue}</span>
            </div>
          </div>
        );
      case 'dependency_change':
        return (
          <div className="flex flex-col gap-1">
            <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider">Dependency Update</span>
            <p className="text-sm text-neutral-700">
              Total linked tickets changed from <span className="font-bold">{item.fromValue}</span> to <span className="font-bold">{item.toValue}</span>
            </p>
          </div>
        );
      case 'note_added':
        return (
          <div className="flex flex-col gap-1">
            <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider">Internal Note</span>
            <p className="text-sm text-neutral-700 bg-orange-50/50 p-3 rounded-xl border border-orange-100 italic leading-relaxed">
              "{item.toValue}"
            </p>
          </div>
        );
      default:
        return <span className="text-sm text-neutral-700">{item.toValue}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-black/5 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <Info className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-neutral-900">Ticket Details</h3>
              <div className="flex items-center gap-2">
                <p className="text-xs text-neutral-500 font-mono">#{ticket.ticketNumber} • ID: {ticket.id}</p>
                {dependencyTickets.some(d => d.status !== 'resolved' && d.status !== 'closed') && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold uppercase rounded-md border border-orange-200 animate-pulse">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Blocked
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {profile?.role === 'teknisi' && (
              <button
                onClick={() => setIsGuideOpen(true)}
                className="p-2 hover:bg-neutral-100 rounded-xl text-indigo-600 transition-colors flex items-center gap-2"
                title="Technician Guide"
              >
                <HelpCircle className="w-5 h-5" />
                <span className="text-xs font-bold hidden sm:inline">Guide</span>
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors">
              <X className="w-5 h-5 text-neutral-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Tabs */}
          <div className="px-8 pt-6 flex gap-8 border-b border-black/5 bg-white sticky top-0 z-20">
            <button
              onClick={() => setActiveTab('details')}
              className={`pb-4 text-xs font-bold uppercase tracking-widest transition-all relative ${
                activeTab === 'details' ? 'text-emerald-600' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Details
              {activeTab === 'details' && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-4 text-xs font-bold uppercase tracking-widest transition-all relative ${
                activeTab === 'history' ? 'text-emerald-600' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              History
              {activeTab === 'history' && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('assignments')}
              className={`pb-4 text-xs font-bold uppercase tracking-widest transition-all relative ${
                activeTab === 'assignments' ? 'text-emerald-600' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Assignments
              {activeTab === 'assignments' && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`pb-4 text-xs font-bold uppercase tracking-widest transition-all relative ${
                activeTab === 'notes' ? 'text-emerald-600' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Notes
              {activeTab === 'notes' && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('materials')}
              className={`pb-4 text-xs font-bold uppercase tracking-widest transition-all relative ${
                activeTab === 'materials' ? 'text-emerald-600' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Materials
              {activeTab === 'materials' && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
              )}
            </button>
          </div>

          <div className="p-8 space-y-10">
            {activeTab === 'details' ? (
              <div className="space-y-10">
                {/* Advanced Progress Tracking Header */}
                <div className="flex items-center justify-between bg-neutral-900 text-white p-4 rounded-2xl shadow-xl border border-white/10">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${ticket.isTimerRunning ? 'bg-red-500 animate-pulse' : 'bg-white/10'}`}>
                      <Timer className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-black tracking-widest text-white/50">Work Timer</p>
                      <p className="text-lg font-black tracking-tighter">
                        {ticket.totalTimeSpent || 0} <span className="text-xs text-white/50">MINS TOTAL</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ticket.isTimerRunning ? (
                      <button
                        onClick={handleStopTimer}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-red-900/20"
                      >
                        <Square className="w-3 h-3 fill-current" /> Stop Work
                      </button>
                    ) : (
                      <button
                        onClick={handleStartTimer}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-900/20"
                      >
                        <Play className="w-3 h-3 fill-current" /> Start Work
                      </button>
                    )}
                  </div>
                </div>

                {/* Overview Section */}
                <section className="space-y-4">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <Info className="w-3 h-3" /> Overview
                  </h4>
                  <div className="grid grid-cols-2 gap-8 bg-neutral-50 p-6 rounded-2xl border border-black/5">
                    <div className="space-y-1">
                      <p className="text-xs text-neutral-500">Customer</p>
                      <p className="font-bold text-neutral-900">{ticket.customerName}</p>
                      {customer && (
                        <div className="mt-2 space-y-1.5 p-3 bg-white rounded-xl border border-black/5">
                          <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                            <Hash className="w-3 h-3 text-emerald-500" />
                            <span className="font-mono font-bold text-emerald-600">{customer.customerId || 'No ID'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                            <Phone className="w-3 h-3 text-neutral-400" />
                            <span>{customer.phone}</span>
                          </div>
                          {(customer.email || ticket.email) && (
                            <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                              <Mail className="w-3 h-3 text-neutral-400" />
                              <span>{ticket.email || customer.email}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                            <Box className="w-3 h-3 text-neutral-400" />
                            <span className="font-bold">{customer.odp || 'Not Set'}</span>
                          </div>
                          <div className="flex items-start gap-2 text-[10px] text-neutral-500">
                            <MapPin className="w-3 h-3 mt-0.5 text-neutral-400" />
                            <span className="line-clamp-2">{customer.address}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-neutral-500">Status</p>
                      <div className="relative inline-block group/status">
                        <select
                          value={ticket.status}
                          onChange={(e) => handleUpdateStatus(e.target.value as TicketStatus)}
                          className="text-[10px] font-black uppercase tracking-tighter px-3 py-1 rounded-full border-none focus:ring-0 cursor-pointer transition-all appearance-none pr-7 bg-emerald-100 text-emerald-700"
                        >
                          <option value="open">Open</option>
                          <option value="in-progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                        <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-50 rotate-90 pointer-events-none" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-neutral-500">Priority</p>
                      <div className="relative inline-block group/priority">
                        <select
                          value={ticket.priority}
                          onChange={(e) => handleUpdatePriority(e.target.value as TicketPriority)}
                          className={`text-[10px] font-black uppercase tracking-tighter px-3 py-1 rounded-full border-none focus:ring-0 cursor-pointer transition-all appearance-none pr-7 ${getPriorityColor(ticket.priority)}`}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                        <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-50 rotate-90 pointer-events-none" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-neutral-500">Category</p>
                        {canManage && !isEditingCategory && (
                          <button onClick={() => setIsEditingCategory(true)} className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-emerald-600 transition-colors">
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        {isEditingCategory ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={tempCategory}
                              onChange={(e) => handleUpdateCategory(e.target.value as TicketCategory)}
                              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-neutral-100 border-none rounded focus:ring-0 w-full"
                            >
                              <option value="PROJECT">PROJECT</option>
                              <option value="REGULER">REGULER</option>
                              <option value="PSB">PSB</option>
                              <option value="SQM">SQM</option>
                              <option value="UNSPEKS">UNSPEKS</option>
                              <option value="EXBIS">EXBIS</option>
                              <option value="CORRECTIVE">CORRECTIVE</option>
                              <option value="PREVENTIVE">PREVENTIVE</option>
                              <option value="Other">Other</option>
                            </select>
                            <button onClick={() => setIsEditingCategory(false)} className="p-1 text-neutral-400 hover:text-red-500">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <PlusCircle className="w-3 h-3 text-neutral-400" />
                            <p className="font-bold text-neutral-900">{ticket.category}</p>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider ml-5">Sub Category</p>
                          {canManage && !isEditingSubCategory && (
                            <button onClick={() => setIsEditingSubCategory(true)} className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-emerald-600 transition-colors">
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        
                        {isEditingSubCategory ? (
                          <div className="flex items-center gap-2 ml-5">
                            <select
                              value={tempSubCategory}
                              onChange={(e) => setTempSubCategory(e.target.value)}
                              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-neutral-100 border-none rounded focus:ring-0 w-full appearance-none"
                            >
                              <option value="">Select Sub-Category...</option>
                              {subCategories.map(sub => (
                                <option key={sub} value={sub}>{sub}</option>
                              ))}
                              <option value="Other">Other</option>
                            </select>
                            <button onClick={handleUpdateSubCategory} className="p-1 text-emerald-600">
                              <Check className="w-3 h-3" />
                            </button>
                            <button onClick={() => setIsEditingSubCategory(false)} className="p-1 text-neutral-400">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          ticket.subCategory && (
                            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider ml-5">
                              {ticket.subCategory}
                            </span>
                          )
                        )}
                        
                        <div className="mt-1 ml-5 flex items-center gap-2">
                          <TrendingUp className="w-3 h-3 text-emerald-500" />
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-tighter">
                            Points: {ticket.points || 0}
                          </span>
                        </div>
                        
                        {ticket.inseraTicketId && (
                          <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-[10px] font-bold border border-blue-100 w-fit ml-5">
                            <Box className="w-3 h-3 text-blue-500" />
                            INSERA: {ticket.inseraTicketId}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-neutral-500">Assigned Technicians</p>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2">
                          {ticket.technicianIds && ticket.technicianIds.length > 0 ? (
                            ticket.technicianIds.map(techId => {
                              const tech = technicians.find(t => t.id === techId);
                              if (!tech) return null;
                              return (
                                <div key={techId} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-black/5 shadow-sm">
                                  <div className="relative">
                                    <div className="w-6 h-6 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400 border border-black/5">
                                      {tech.photoURL ? (
                                        <img src={resolvePhotoUrl(tech.photoURL)} alt={tech.name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                                      ) : (
                                        <User className="w-3 h-3" />
                                      )}
                                    </div>
                                    <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
                                      tech.availabilityStatus === 'Available' ? 'bg-emerald-500' :
                                      tech.availabilityStatus === 'Busy' ? 'bg-yellow-400' : 
                                      tech.availabilityStatus === 'On Leave' ? 'bg-red-500' : 'bg-neutral-400'
                                    }`} />
                                  </div>
                                  <span className="text-xs font-bold text-neutral-900">{tech.name}</span>
                                  <button 
                                    onClick={() => handleUpdateTechnician(techId)}
                                    className="p-1 hover:bg-red-50 text-neutral-300 hover:text-red-500 rounded-md transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-sm text-neutral-400 italic">No technicians assigned</span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 mt-1">
                          <select
                            value=""
                            onChange={(e) => e.target.value && handleUpdateTechnician(e.target.value)}
                            className="flex-1 bg-neutral-100 border-none rounded-lg px-3 py-1.5 font-bold text-neutral-700 focus:ring-2 focus:ring-emerald-500/20 cursor-pointer text-[10px] uppercase tracking-wider"
                          >
                            <option value="">+ Add Technician</option>
                            {technicians
                              .filter(tech => !ticket.technicianIds?.includes(tech.id))
                              .map(tech => (
                                <option key={tech.id} value={tech.id}>
                                  {tech.name} ({tech.availabilityStatus || 'Available'})
                                </option>
                              ))
                            }
                          </select>
                          {(!ticket.technicianIds || !ticket.technicianIds.includes(technicians.find(t => t.email === auth.currentUser?.email)?.id || '')) && (
                            <button
                              onClick={handleAssignToMe}
                              className="text-[10px] font-bold uppercase text-emerald-600 hover:bg-emerald-50 px-2 py-1.5 rounded-lg transition-all border border-emerald-100 whitespace-nowrap"
                            >
                              Assign to Me
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Technician Location Map */}
                    {assignedTechnicians.length > 0 && hasLocationData && (
                      <div className="col-span-2 space-y-3 mt-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                            <Navigation className="w-3 h-3" /> Technician Live Location
                          </h4>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                            Live Tracking Active
                          </span>
                        </div>
                        
                        <div className="h-64 rounded-2xl overflow-hidden border border-black/5 shadow-inner bg-neutral-100 relative">
                          {hasValidMapsKey ? (
                            <APIProvider apiKey={API_KEY} version="weekly">
                              <Map
                                defaultCenter={assignedTechnicians.find(t => t.location)?.location || { lat: -6.2, lng: 106.8 }}
                                defaultZoom={14}
                                mapId="TECHNICIAN_TRACKING_MAP"
                                // @ts-ignore
                                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                                style={{ width: '100%', height: '100%' }}
                              >
                                {assignedTechnicians.map(tech => tech.location && (
                                  <AdvancedMarker 
                                    key={tech.id} 
                                    position={{ lat: tech.location.lat, lng: tech.location.lng }}
                                  >
                                    <Pin background="#10b981" glyphColor="#fff" borderColor="#065f46" />
                                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white px-2 py-1 rounded-lg shadow-lg border border-black/5 text-[10px] font-bold whitespace-nowrap flex items-center gap-2">
                                      <div className="w-4 h-4 rounded-full overflow-hidden border border-black/5">
                                        <img 
                                          src={resolvePhotoUrl(tech.photoURL || `https://ui-avatars.com/api/?name=${tech.name}`)} 
                                          alt={tech.name} 
                                          className="w-full h-full object-cover"
                                          referrerPolicy="no-referrer"
                                        />
                                      </div>
                                      {tech.name}
                                    </div>
                                  </AdvancedMarker>
                                ))}
                              </Map>
                            </APIProvider>
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                              <MapPin className="w-10 h-10 text-neutral-300 mb-2" />
                              <p className="text-sm text-neutral-500 font-medium">Map tracking is unavailable. Please configure Google Maps API key.</p>
                            </div>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {assignedTechnicians.filter(t => t.location).map(tech => (
                            <div key={tech.id} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl border border-black/5">
                              <div className="w-10 h-10 rounded-lg overflow-hidden border border-black/5">
                                <img 
                                  src={resolvePhotoUrl(tech.photoURL || `https://ui-avatars.com/api/?name=${tech.name}`)} 
                                  alt={tech.name} 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-neutral-900 truncate">{tech.name}</p>
                                <p className="text-[10px] text-neutral-500 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  Last seen: {tech.location?.updatedAt?.toDate().toLocaleTimeString() || 'Just now'}
                                </p>
                              </div>
                              <a 
                                href={`https://www.google.com/maps?q=${tech.location?.lat},${tech.location?.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-white text-neutral-400 hover:text-indigo-600 rounded-lg border border-black/5 transition-all"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <p className="text-xs text-neutral-500">Timeline</p>
                      <div className="space-y-2 p-3 bg-white rounded-xl border border-black/5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-neutral-500">Created:</span>
                          <span className="font-bold text-neutral-700">{ticket.createdAt?.toDate().toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-neutral-500">Last Updated:</span>
                          <span className="font-bold text-neutral-700">{ticket.updatedAt?.toDate().toLocaleString() || '---'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-neutral-500">Due Date</p>
                      <input
                        type="date"
                        value={ticket.dueDate ? ticket.dueDate.toDate().toISOString().split('T')[0] : ''}
                        onChange={(e) => handleUpdateDueDate(e.target.value)}
                        className={`bg-transparent border-none p-0 font-bold focus:ring-0 cursor-pointer transition-colors text-sm w-full ${
                          ticket.dueDate && ticket.dueDate.toDate() < new Date() && ticket.status !== 'resolved' && ticket.status !== 'closed'
                            ? 'text-red-600'
                            : 'text-neutral-900 hover:text-emerald-600'
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-neutral-500">Created At</p>
                      <p className="text-sm font-bold text-neutral-900">
                        {ticket.createdAt?.toDate().toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-neutral-500">Last Updated</p>
                      <p className="text-sm font-bold text-neutral-900">
                        {ticket.updatedAt?.toDate().toLocaleString() || '---'}
                      </p>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <p className="text-xs text-neutral-500">Description</p>
                      <p className="text-sm text-neutral-700 leading-relaxed">{ticket.description}</p>
                    </div>
                  </div>
                </section>

                {/* Photos Section */}
                <section className="space-y-4">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <Camera className="w-3 h-3" /> Visual Progress
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Before Work</p>
                      {ticket.beforePhoto ? (
                        <div className="relative group aspect-video rounded-xl overflow-hidden border border-black/5 bg-neutral-100">
                          <img src={resolvePhotoUrl(ticket.beforePhoto)} alt="Before" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <button 
                            onClick={() => handleUploadPhoto('before')}
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-white text-xs font-bold"
                          >
                            <RefreshCw className="w-4 h-4 mr-2" /> Retake
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => handleUploadPhoto('before')}
                          className="w-full aspect-video rounded-xl border-2 border-dashed border-neutral-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all flex flex-col items-center justify-center gap-2 text-neutral-400 hover:text-emerald-600"
                        >
                          <Camera className="w-6 h-6" />
                          <span className="text-[10px] font-bold uppercase">Upload Before Photo</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">After Work</p>
                      {ticket.afterPhoto ? (
                        <div className="relative group aspect-video rounded-xl overflow-hidden border border-black/5 bg-neutral-100">
                          <img src={resolvePhotoUrl(ticket.afterPhoto)} alt="After" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <button 
                            onClick={() => handleUploadPhoto('after')}
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-white text-xs font-bold"
                          >
                            <RefreshCw className="w-4 h-4 mr-2" /> Retake
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => handleUploadPhoto('after')}
                          className="w-full aspect-video rounded-xl border-2 border-dashed border-neutral-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all flex flex-col items-center justify-center gap-2 text-neutral-400 hover:text-emerald-600"
                        >
                          <Camera className="w-6 h-6" />
                          <span className="text-[10px] font-bold uppercase">Upload After Photo</span>
                        </button>
                      )}
                    </div>
                  </div>
                </section>

                {/* Checklist Section */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                      <CheckCircle className="w-3 h-3" /> Progress Checklist
                    </h4>
                    <span className="text-[10px] font-bold text-neutral-400">
                      {ticket.checklist?.filter(i => i.completed).length || 0} / {ticket.checklist?.length || 0} Completed
                    </span>
                  </div>
                  
                  <div className="bg-white border border-black/5 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-4 space-y-3">
                      {ticket.checklist && ticket.checklist.length > 0 ? (
                        ticket.checklist.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-3 group">
                            <button
                              onClick={() => handleToggleChecklistItem(idx)}
                              className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                item.completed 
                                  ? 'bg-emerald-500 border-emerald-500 text-white' 
                                  : 'bg-white border-neutral-200 text-transparent hover:border-emerald-500'
                              }`}
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                            <div className="flex-1">
                              <span className={`text-sm transition-all block ${
                                item.completed ? 'text-neutral-400 line-through' : 'text-neutral-700 font-medium'
                              }`}>
                                {item.task}
                              </span>
                              {item.completed && (
                                <div className="flex items-center gap-3 mt-1 text-[9px] text-neutral-400 font-bold uppercase tracking-wider">
                                  <span className="flex items-center gap-1">
                                    <User className="w-2.5 h-2.5" /> {item.completedBy}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5" /> {item.completedAt?.toDate().toLocaleString()}
                                  </span>
                                  {item.location && (
                                    <span className="flex items-center gap-1 text-emerald-600">
                                      <Navigation className="w-2.5 h-2.5" /> Verified Location
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleRemoveChecklistItem(idx)}
                              className="p-1 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-neutral-400 italic text-center py-2">No tasks added yet.</p>
                      )}
                    </div>
                    
                    <div className="p-3 bg-neutral-50 border-t border-black/5 flex gap-2">
                      <input
                        type="text"
                        value={newChecklistItem}
                        onChange={(e) => setNewChecklistItem(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                        placeholder="Add a task..."
                        className="flex-1 bg-white border border-black/5 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      />
                      <button
                        onClick={handleAddChecklistItem}
                        className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                      >
                        <PlusCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </section>

                {/* Dependencies Section */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                      <LinkIcon className="w-3 h-3" /> Dependencies
                    </h4>
                    <button
                      onClick={() => setIsManageDepsModalOpen(true)}
                      className="text-[10px] font-bold uppercase px-3 py-1 bg-neutral-50 text-neutral-500 border border-black/5 rounded-md hover:bg-neutral-100 transition-all"
                    >
                      Manage Dependencies
                    </button>
                  </div>

                  <AnimatePresence>
                    {isManageDepsModalOpen && (
                      <DependencyManagerModal
                        ticket={ticket}
                        allTickets={allTickets}
                        onClose={() => setIsManageDepsModalOpen(false)}
                      />
                    )}
                  </AnimatePresence>

                  {dependencyTickets.some(d => d.status !== 'resolved' && d.status !== 'closed') && (
                    <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-orange-900">Blocking Dependencies</p>
                        <p className="text-xs text-orange-700">This ticket cannot be started or resolved until all linked dependencies are finished.</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {dependencyTickets.length > 0 ? (
                      dependencyTickets.map(dep => (
                        <div key={dep.id} className="flex items-center justify-between p-4 bg-neutral-50 rounded-2xl border border-black/5 group/dep">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                              dep.status === 'resolved' || dep.status === 'closed' 
                                ? 'bg-emerald-100 text-emerald-600' 
                                : 'bg-orange-100 text-orange-600'
                            }`}>
                              {dep.status === 'resolved' || dep.status === 'closed' ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-neutral-900">
                                <span className="font-mono text-neutral-400 mr-2">#{dep.ticketNumber}</span>
                                {dep.description.substring(0, 40)}...
                              </p>
                              <p className="text-[10px] uppercase font-black tracking-tighter text-neutral-500">
                                Status: {dep.status.replace('-', ' ')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {dep.status !== 'resolved' && dep.status !== 'closed' && (
                              <div className="flex items-center gap-1 text-orange-600">
                                <AlertTriangle className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase">Blocking</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-neutral-400 italic">No dependencies defined for this ticket.</p>
                    )}
                  </div>
                </section>

                {/* Repair Records Section */}
                <section className="space-y-4">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <Wrench className="w-3 h-3" /> Repair Records
                  </h4>
                  <div className="space-y-4">
                    {repairRecords.length > 0 ? (
                      repairRecords.map(record => (
                        <div key={record.id} className="bg-neutral-50 rounded-2xl border border-black/5 overflow-hidden">
                          <div className="p-4 border-b border-black/5 flex items-center justify-between bg-white/50">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                                <User className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-neutral-900">{getTechnicianName(record.technicianId)}</p>
                                <p className="text-[10px] text-neutral-500 font-medium">
                                  {record.startTime.toDate().toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="p-4 space-y-4">
                            <p className="text-sm text-neutral-700 italic">"{record.notes}"</p>
                            
                            {record.materialsUsed && record.materialsUsed.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase text-neutral-400 tracking-wider flex items-center gap-1.5">
                                  <Package className="w-3 h-3" /> Materials Used
                                </p>
                                <div className="grid grid-cols-1 gap-2">
                                  {record.materialsUsed.map((m, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs p-2 bg-white rounded-lg border border-black/5">
                                      <span className="text-neutral-700 font-medium">{m.name} <span className="text-neutral-400 font-normal">× {m.quantity}</span></span>
                                      <span className="font-bold text-neutral-900">${(m.quantity * m.unitPrice).toFixed(2)}</span>
                                    </div>
                                  ))}
                                  <div className="flex justify-between items-center pt-2 px-2 border-t border-black/5">
                                    <span className="text-[10px] font-bold uppercase text-neutral-400">Total Materials</span>
                                    <span className="text-sm font-black text-emerald-600">
                                      ${record.materialsUsed.reduce((sum, m) => sum + (m.quantity * m.unitPrice), 0).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-neutral-400 italic">No repair records found for this ticket.</p>
                    )}
                  </div>
                </section>
              </div>
            ) : activeTab === 'materials' ? (
              /* Materials Tab */
              <section className="space-y-8">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <Package className="w-3 h-3" /> Materials Used for this Ticket
                  </h4>
                </div>

                {/* Add Material Form */}
                <div className="bg-neutral-50 p-6 rounded-2xl border border-black/5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-neutral-400 ml-1">Select Material</label>
                      <select
                        value={selectedMaterialId}
                        onChange={(e) => setSelectedMaterialId(e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-sm"
                      >
                        <option value="">Choose material...</option>
                        {availableMaterials.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.unit}) - Rp {m.price.toLocaleString()}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-neutral-400 ml-1">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={materialQuantity}
                        onChange={(e) => setMaterialQuantity(parseInt(e.target.value) || 0)}
                        className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-neutral-400 ml-1">Unit Price (Rp)</label>
                      <input
                        type="number"
                        value={materialPrice}
                        onChange={(e) => setMaterialPrice(parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-2 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-sm"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAddMaterial}
                    disabled={!selectedMaterialId || materialQuantity <= 0}
                    className="w-full py-3 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-neutral-900/10"
                  >
                    <PlusCircle className="w-4 h-4" /> Add Material
                  </button>
                </div>

                {/* Materials List */}
                <div className="space-y-3">
                  {materialsUsed.length > 0 ? (
                    materialsUsed.map((m) => (
                      <div key={m.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-black/5 shadow-sm group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-neutral-100 rounded-xl flex items-center justify-center text-neutral-400">
                            <Package className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-neutral-900">{m.name}</p>
                            <p className="text-[10px] uppercase font-black tracking-tighter text-neutral-500">
                              {m.quantity} Units × Rp {m.unitPrice.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-sm font-black text-emerald-600">Rp {(m.quantity * m.unitPrice).toLocaleString()}</p>
                            <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">Subtotal</p>
                          </div>
                          <button
                            onClick={() => handleRemoveMaterial(m.id)}
                            className="p-2 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 bg-neutral-50 rounded-3xl border border-dashed border-neutral-200">
                      <Package className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                      <p className="text-neutral-500 text-sm">No materials recorded for this ticket yet.</p>
                    </div>
                  )}

                  {materialsUsed.length > 0 && (
                    <div className="mt-6 p-6 bg-emerald-600 rounded-2xl text-white flex justify-between items-center shadow-xl shadow-emerald-600/20">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Total Materials Value</p>
                        <p className="text-2xl font-black tracking-tighter">
                          Rp {materialsUsed.reduce((sum, m) => sum + (m.quantity * m.unitPrice), 0).toLocaleString()}
                        </p>
                      </div>
                      <Package className="w-8 h-8 text-white/20" />
                    </div>
                  )}
                </div>
              </section>
            ) : activeTab === 'notes' ? (
              /* Notes Section */
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <StickyNote className="w-3 h-3" /> Internal Notes
                  </h4>
                </div>

                <form onSubmit={handleAddNote} className="relative">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Type a new internal note..."
                    rows={3}
                    className="w-full pl-4 pr-12 py-4 bg-neutral-50 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none"
                  />
                  <button
                    type="submit"
                    disabled={!newNote.trim() || isSubmitting}
                    className="absolute right-3 bottom-3 p-2 bg-emerald-600 text-white rounded-xl disabled:opacity-50 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>

                <div className="space-y-4">
                  {notes.length > 0 ? (
                    notes.map(note => (
                      <div key={note.id} className="p-6 bg-orange-50/30 border border-orange-100/50 rounded-2xl space-y-3">
                        <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap">{note.note}</p>
                        <div className="flex items-center justify-between pt-2 border-t border-orange-100/30">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center">
                              <User className="w-3 h-3 text-orange-600" />
                            </div>
                            <span className="text-xs font-bold text-neutral-600">{note.createdBy}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-neutral-400">
                            <Clock className="w-3 h-3" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">
                              {note.createdAt?.toDate().toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 bg-neutral-50 rounded-3xl border border-dashed border-neutral-200">
                      <StickyNote className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                      <p className="text-neutral-500 text-sm">No internal notes yet.</p>
                    </div>
                  )}
                </div>
              </section>
            ) : activeTab === 'assignments' ? (
              /* Assignment History Section */
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <UserPlus className="w-3 h-3" /> Assignment History
                  </h4>
                </div>

                <div className="relative space-y-8 before:absolute before:inset-0 before:left-4 before:w-0.5 before:bg-neutral-100 before:h-full">
                  {loading ? (
                    <div className="pl-10 py-4 text-neutral-400 text-sm italic">Loading history...</div>
                  ) : history.filter(h => h.type === 'assignment_change').length > 0 ? (
                    history.filter(h => h.type === 'assignment_change').map((item, idx) => (
                      <div key={item.id} className="relative pl-10 group">
                        {/* Timeline Dot */}
                        <div className={`absolute left-[10px] top-1 w-6 h-6 rounded-full border-4 border-white shadow-sm z-10 flex items-center justify-center transition-transform group-hover:scale-110 ${
                          idx === 0 ? 'bg-purple-50 ring-2 ring-purple-500/20' : 'bg-neutral-50'
                        }`}>
                          <UserPlus className="w-3.5 h-3.5 text-purple-500" />
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-neutral-600 font-medium">{formatValue(item.fromValue)}</span>
                                  <ArrowRight className="w-3 h-3 text-neutral-400" />
                                  <span className="text-sm text-emerald-700 font-bold">{formatValue(item.toValue)}</span>
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] text-neutral-400 font-mono whitespace-nowrap pt-1">
                              {item.timestamp?.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-neutral-100 rounded-full flex items-center justify-center">
                              <User className="w-2.5 h-2.5 text-neutral-400" />
                            </div>
                            <p className="text-[10px] text-neutral-500 font-medium">
                              Changed by: <span className="text-neutral-700 font-bold">{item.changedBy}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="pl-10 py-4 text-neutral-400 text-sm italic">No assignment changes recorded yet.</div>
                  )}
                </div>
              </section>
            ) : (
              /* History Section */
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <History className="w-3 h-3" /> Activity History
                  </h4>
                </div>

                <div className="relative space-y-8 before:absolute before:inset-0 before:left-4 before:w-0.5 before:bg-neutral-100 before:h-full">
                  {loading ? (
                    <div className="pl-10 py-4 text-neutral-400 text-sm italic">Loading history...</div>
                  ) : history.length > 0 ? (
                    history.map((item, idx) => (
                      <div key={item.id} className="relative pl-10 group">
                        {/* Timeline Dot */}
                        <div className={`absolute left-[10px] top-1 w-6 h-6 rounded-full border-4 border-white shadow-sm z-10 flex items-center justify-center transition-transform group-hover:scale-110 ${
                          idx === 0 ? 'bg-emerald-50 ring-2 ring-emerald-500/20' : 'bg-neutral-50'
                        }`}>
                          {getHistoryIcon(item.type)}
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              {formatHistoryMessage(item)}
                            </div>
                            <span className="text-[10px] text-neutral-400 font-mono whitespace-nowrap pt-1">
                              {item.timestamp?.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-neutral-100 rounded-full flex items-center justify-center">
                              <User className="w-2.5 h-2.5 text-neutral-400" />
                            </div>
                            <p className="text-[10px] text-neutral-500 font-medium">
                              {item.changedBy}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="pl-10 py-4 text-neutral-400 text-sm italic">No history recorded yet.</div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-black/5 bg-neutral-50">
          <button
            onClick={onClose}
            className="w-full py-3 px-4 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-900/10"
          >
            Close Details
          </button>
        </div>
      </motion.div>

      {/* Status Update Modal */}
      <AnimatePresence>
        {isUpdatingStatus && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-black/5"
            >
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black tracking-tighter text-neutral-900">Update Status</h3>
                  <button onClick={() => setIsUpdatingStatus(false)} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
                    <X className="w-5 h-5 text-neutral-400" />
                  </button>
                </div>

                <div className="flex items-center gap-4 p-4 bg-neutral-50 rounded-2xl border border-black/5">
                  <div className="flex-1 text-center">
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Current</p>
                    <span className="px-3 py-1 bg-neutral-200 text-neutral-600 rounded-full text-[10px] font-black uppercase">{ticket.status}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-neutral-300" />
                  <div className="flex-1 text-center">
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">New</p>
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase">{pendingStatus}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                    <StickyNote className="w-3 h-3" /> Status Change Comment
                  </label>
                  <textarea
                    value={statusComment}
                    onChange={(e) => setStatusComment(e.target.value)}
                    placeholder="Describe the progress or reason for this status change..."
                    className="w-full bg-neutral-50 border border-black/5 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none min-h-[120px] resize-none"
                  />
                  <p className="text-[10px] text-neutral-400 italic">* Comment is mandatory for status updates.</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setIsUpdatingStatus(false)}
                    className="flex-1 px-6 py-3 rounded-2xl text-sm font-bold text-neutral-500 hover:bg-neutral-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmStatusUpdate}
                    disabled={!statusComment.trim()}
                    className="flex-1 px-6 py-3 rounded-2xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-900/20"
                  >
                    Confirm Update
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <TechnicianGuide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}
