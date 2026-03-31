import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, addDoc, updateDoc, doc, serverTimestamp, Timestamp, documentId } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { Ticket, Customer, Asset, Technician } from '../types';
import { calculateTicketPoints } from '../weights';
import { Plus, Search, Filter, MessageSquare, Clock, CheckCircle2, AlertCircle, Star, Send, X, Monitor, ChevronRight, Bot, MapPin, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidMapsKey = Boolean(API_KEY) && API_KEY !== '';

export default function CustomerPortal() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'bot', text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [assignedTechnicians, setAssignedTechnicians] = useState<Technician[]>([]);

  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    priority: 'medium' as Ticket['priority'],
    assetId: ''
  });

  useEffect(() => {
    if (!auth.currentUser) return;

    // Find customer associated with current user email
    if (auth.currentUser?.email) {
      const qCustomer = query(collection(db, 'customers'), where('email', '==', auth.currentUser.email));
      const unsubscribeCustomer = onSnapshot(qCustomer, (snapshot) => {
        if (!snapshot.empty) {
          const customerData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Customer;
          setCustomer(customerData);

          // Fetch tickets for this customer
          const qTickets = query(
            collection(db, 'tickets'),
            where('customerId', '==', customerData.id),
            orderBy('createdAt', 'desc')
          );
          const unsubscribeTickets = onSnapshot(qTickets, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket));
            setTickets(docs);
            setLoading(false);
          }, (error) => {
            handleFirestoreError(error, OperationType.LIST, 'tickets');
            setLoading(false);
          });

          // Fetch assets for this customer
          const qAssets = query(collection(db, 'assets'), where('customerId', '==', customerData.id));
          const unsubscribeAssets = onSnapshot(qAssets, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));
            setAssets(docs);
          }, (error) => {
            handleFirestoreError(error, OperationType.LIST, 'assets');
          });

          return () => {
            unsubscribeTickets();
            unsubscribeAssets();
          };
        } else {
          setLoading(false);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'customers');
        setLoading(false);
      });

      return unsubscribeCustomer;
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTicket && selectedTicket.status === 'in-progress' && selectedTicket.technicianIds && selectedTicket.technicianIds.length > 0) {
      const q = query(collection(db, 'users'), where(documentId(), 'in', selectedTicket.technicianIds));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const techs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as Technician));
        setAssignedTechnicians(techs);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      });
      return unsubscribe;
    } else {
      setAssignedTechnicians([]);
    }
  }, [selectedTicket]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = chatInput.trim();
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setChatInput('');
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";
      
      const systemInstruction = `You are a helpful support assistant. 
      The customer's name is ${customer?.name}. 
      They have ${tickets.length} tickets and ${assets.length} assets.
      Current tickets: ${tickets.map(t => `${t.title} (${t.status})`).join(', ')}.
      Current assets: ${assets.map(a => `${a.name} (${a.serialNumber})`).join(', ')}.
      Be professional, empathetic, and concise.`;

      const response = await ai.models.generateContent({
        model,
        contents: userMessage,
        config: { systemInstruction }
      });

      setChatMessages(prev => [...prev, { role: 'bot', text: response.text || "I'm sorry, I couldn't process that." }]);
    } catch (error) {
      console.error("Chat error:", error);
      setChatMessages(prev => [...prev, { role: 'bot', text: "Sorry, I'm having trouble connecting right now." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !auth.currentUser) return;

    try {
      const category = 'Other';
      const points = calculateTicketPoints(category);

      const ticketData: Omit<Ticket, 'id'> = {
        title: newTicket.title,
        description: newTicket.description,
        status: 'open',
        priority: newTicket.priority,
        category,
        points,
        ticketNumber: Math.floor(Date.now() / 1000), // Simple unique ticket number
        customerId: customer.id,
        technicianIds: [],
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
        assetId: newTicket.assetId || undefined
      };

      await addDoc(collection(db, 'tickets'), ticketData);
      setIsNewTicketModalOpen(false);
      setNewTicket({ title: '', description: '', priority: 'medium', assetId: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tickets');
    }
  };

  const handleSubmitFeedback = async (ticketId: string) => {
    if (rating === 0) return;
    try {
      await updateDoc(doc(db, 'tickets', ticketId), {
        rating,
        feedback,
        updatedAt: serverTimestamp()
      });
      setSelectedTicket(null);
      setRating(0);
      setFeedback('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tickets');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="max-w-2xl mx-auto mt-20 p-8 bg-white rounded-3xl border border-black/5 shadow-xl text-center">
        <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 mb-2">Customer Profile Not Found</h2>
        <p className="text-neutral-500 mb-6">We couldn't find a customer profile associated with your email ({auth.currentUser?.email}). Please contact support to set up your account.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-neutral-900 tracking-tight">Welcome back, {customer.name}</h1>
          <p className="text-neutral-500 font-medium">Manage your support tickets and assets</p>
        </div>
        <button
          onClick={() => setIsNewTicketModalOpen(true)}
          className="flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 font-bold text-lg group"
        >
          <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
          New Support Ticket
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Ticket List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-neutral-900">Your Tickets</h2>
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {tickets.length} Total
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {tickets.length === 0 ? (
              <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-neutral-300">
                <MessageSquare className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                <p className="text-neutral-500 font-medium">No tickets yet. Need help?</p>
              </div>
            ) : (
              tickets.map(ticket => (
                <motion.div
                  key={ticket.id}
                  layout
                  className="bg-white rounded-3xl border border-black/5 shadow-sm hover:shadow-md transition-all p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 group cursor-pointer"
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                      ticket.status === 'resolved' ? 'bg-emerald-100 text-emerald-600' :
                      ticket.status === 'in-progress' ? 'bg-indigo-100 text-indigo-600' :
                      'bg-amber-100 text-amber-600'
                    }`}>
                      {ticket.status === 'resolved' ? <CheckCircle2 className="w-6 h-6" /> :
                       ticket.status === 'in-progress' ? <Clock className="w-6 h-6" /> :
                       <AlertCircle className="w-6 h-6" />}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-neutral-900 group-hover:text-indigo-600 transition-colors">{ticket.title}</h3>
                      <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-neutral-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {ticket.createdAt instanceof Timestamp ? ticket.createdAt.toDate().toLocaleDateString() : 'Just now'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          ticket.priority === 'high' ? 'bg-red-100 text-red-700' :
                          ticket.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {ticket.priority}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {ticket.status === 'resolved' && !ticket.rating && (
                      <span className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl animate-pulse">
                        Rate Service
                      </span>
                    )}
                    <ChevronRight className="w-5 h-5 text-neutral-300 group-hover:text-indigo-600 transition-colors" />
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar: Assets & Info */}
        <div className="space-y-8">
          <div className="bg-neutral-900 rounded-3xl p-8 text-white shadow-2xl shadow-neutral-900/20">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Monitor className="w-5 h-5 text-indigo-400" />
              Your Assets
            </h3>
            <div className="space-y-4">
              {assets.length === 0 ? (
                <p className="text-neutral-400 text-sm italic">No assets registered.</p>
              ) : (
                assets.map(asset => (
                  <div key={asset.id} className="p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors">
                    <h4 className="font-bold text-sm">{asset.name}</h4>
                    <p className="text-xs text-neutral-400 mt-1 font-mono">{asset.serialNumber}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        asset.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {asset.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-black/5 p-8 shadow-sm">
            <h3 className="text-xl font-bold text-neutral-900 mb-4">Support Hours</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500 font-medium">Mon - Fri</span>
                <span className="text-neutral-900 font-bold">08:00 - 17:00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 font-medium">Sat</span>
                <span className="text-neutral-900 font-bold">09:00 - 13:00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 font-medium">Sun</span>
                <span className="text-red-500 font-bold">Closed</span>
              </div>
            </div>
            <div className="mt-8 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
              <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                Emergency support is available 24/7 for critical system failures. Please call our hotline for urgent issues.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* New Ticket Modal */}
      <AnimatePresence>
        {isNewTicketModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between bg-neutral-50">
                <h3 className="text-xl font-bold text-neutral-900">Create Support Ticket</h3>
                <button onClick={() => setIsNewTicketModalOpen(false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-neutral-500" />
                </button>
              </div>

              <form onSubmit={handleCreateTicket} className="p-6 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-neutral-700">Subject</label>
                  <input
                    required
                    type="text"
                    value={newTicket.title}
                    onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    placeholder="Briefly describe the issue"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-neutral-700">Priority</label>
                    <select
                      value={newTicket.priority}
                      onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value as Ticket['priority'] })}
                      className="w-full px-4 py-3 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    >
                      <option value="low">Low - Minor issue</option>
                      <option value="medium">Medium - Standard support</option>
                      <option value="high">High - Urgent problem</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-neutral-700">Related Asset (Optional)</label>
                    <select
                      value={newTicket.assetId}
                      onChange={(e) => setNewTicket({ ...newTicket, assetId: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    >
                      <option value="">None</option>
                      {assets.map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({a.serialNumber})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-neutral-700">Description</label>
                  <textarea
                    required
                    rows={5}
                    value={newTicket.description}
                    onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all resize-none"
                    placeholder="Provide more details about the problem..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsNewTicketModalOpen(false)}
                    className="px-6 py-2.5 text-neutral-600 font-semibold hover:bg-neutral-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
                  >
                    Submit Ticket
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ticket Detail & Feedback Modal */}
      <AnimatePresence>
        {selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between bg-neutral-50">
                <h3 className="text-xl font-bold text-neutral-900">Ticket Details</h3>
                <button onClick={() => setSelectedTicket(null)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-neutral-500" />
                </button>
              </div>

              <div className="p-6 space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      selectedTicket.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                      selectedTicket.status === 'in-progress' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {selectedTicket.status}
                    </span>
                    <span className="text-sm text-neutral-500 font-medium">
                      Created on {selectedTicket.createdAt instanceof Timestamp ? selectedTicket.createdAt.toDate().toLocaleDateString() : 'Just now'}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-neutral-900">{selectedTicket.title}</h2>
                  <p className="text-neutral-600 leading-relaxed">{selectedTicket.description}</p>
                </div>

                {/* Live Progress Tracking */}
                <div className="p-6 bg-neutral-900 rounded-3xl text-white space-y-6 shadow-2xl border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/10 rounded-xl">
                        <Monitor className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm tracking-tight">Live Progress Tracking</h4>
                        <p className="text-[10px] text-white/50 uppercase font-black tracking-widest">Real-time updates from technician</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black tracking-tighter text-emerald-400">
                        {selectedTicket.checklist?.length ? Math.round((selectedTicket.checklist.filter(i => i.completed).length / selectedTicket.checklist.length) * 100) : 0}%
                      </p>
                      <p className="text-[10px] text-white/50 uppercase font-black tracking-widest">Completed</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${selectedTicket.checklist?.length ? (selectedTicket.checklist.filter(i => i.completed).length / selectedTicket.checklist.length) * 100 : 0}%` }}
                      className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                    />
                  </div>

                  {/* Visual Progress (Photos) */}
                  {(selectedTicket.beforePhoto || selectedTicket.afterPhoto) && (
                    <div className="grid grid-cols-2 gap-4">
                      {selectedTicket.beforePhoto && (
                        <div className="space-y-2">
                          <p className="text-[10px] text-white/50 uppercase font-black tracking-widest">Before Work</p>
                          <div className="aspect-video rounded-2xl overflow-hidden border border-white/10 bg-white/5">
                            <img src={selectedTicket.beforePhoto} alt="Before" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                        </div>
                      )}
                      {selectedTicket.afterPhoto && (
                        <div className="space-y-2">
                          <p className="text-[10px] text-white/50 uppercase font-black tracking-widest">After Work</p>
                          <div className="aspect-video rounded-2xl overflow-hidden border border-white/10 bg-white/5">
                            <img src={selectedTicket.afterPhoto} alt="After" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Checklist Items */}
                  {selectedTicket.checklist && selectedTicket.checklist.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <p className="text-[10px] text-white/50 uppercase font-black tracking-widest">Current Tasks</p>
                      <div className="grid grid-cols-1 gap-2">
                        {selectedTicket.checklist.map((item, idx) => (
                          <div key={idx} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                            item.completed ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/5 border-white/5'
                          }`}>
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 ${
                              item.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/20'
                            }`}>
                              {item.completed && <CheckCircle2 className="w-3 h-3" />}
                            </div>
                            <span className={`text-xs font-bold ${item.completed ? 'text-emerald-400 line-through opacity-50' : 'text-white'}`}>
                              {item.task}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {selectedTicket.status === 'in-progress' && assignedTechnicians.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                        <Navigation className="w-5 h-5 text-indigo-600" />
                        Technician Tracking
                      </h4>
                      <span className="text-xs font-medium text-neutral-500 bg-neutral-100 px-2 py-1 rounded-lg">
                        Live Updates
                      </span>
                    </div>
                    
                    <div className="h-64 rounded-3xl overflow-hidden border border-black/5 shadow-inner bg-neutral-100 relative">
                      {hasValidMapsKey ? (
                        <APIProvider apiKey={API_KEY} version="weekly">
                          <Map
                            defaultCenter={assignedTechnicians[0].location || { lat: -6.2, lng: 106.8 }}
                            defaultZoom={15}
                            mapId="DEMO_MAP_ID"
                            // @ts-ignore
                            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                            style={{ width: '100%', height: '100%' }}
                          >
                            {assignedTechnicians.map(tech => tech.location && (
                              <AdvancedMarker key={tech.id} position={{ lat: tech.location.lat, lng: tech.location.lng }}>
                                <Pin background="#4F46E5" glyphColor="#fff" />
                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white px-2 py-1 rounded-lg shadow-lg border border-black/5 text-[10px] font-bold whitespace-nowrap">
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

                    <div className="grid grid-cols-1 gap-3">
                      {assignedTechnicians.map(tech => (
                        <div key={tech.id} className="flex items-center gap-4 p-4 bg-neutral-50 rounded-2xl border border-black/5">
                          <img 
                            src={tech.photoURL || `https://ui-avatars.com/api/?name=${tech.name}`} 
                            alt={tech.name} 
                            className="w-12 h-12 rounded-xl object-cover border border-black/5"
                          />
                          <div>
                            <p className="font-bold text-neutral-900">{tech.name}</p>
                            <p className="text-xs text-neutral-500">Your assigned technician is on the way</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTicket.status === 'resolved' && (
                  <div className="p-8 bg-neutral-50 rounded-3xl border border-black/5 space-y-6">
                    <div className="text-center">
                      <h4 className="text-lg font-bold text-neutral-900">How was our service?</h4>
                      <p className="text-sm text-neutral-500 mt-1">Your feedback helps us improve.</p>
                    </div>

                    <div className="flex justify-center gap-4">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setRating(star)}
                          className={`p-2 transition-all transform hover:scale-110 ${
                            (selectedTicket.rating || rating) >= star ? 'text-amber-400' : 'text-neutral-300'
                          }`}
                          disabled={!!selectedTicket.rating}
                        >
                          <Star className={`w-10 h-10 ${ (selectedTicket.rating || rating) >= star ? 'fill-current' : ''}`} />
                        </button>
                      ))}
                    </div>

                    {!selectedTicket.rating ? (
                      <div className="space-y-4">
                        <textarea
                          rows={3}
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          className="w-full px-4 py-3 bg-white border border-black/10 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all resize-none"
                          placeholder="Any additional comments?"
                        />
                        <button
                          onClick={() => handleSubmitFeedback(selectedTicket.id)}
                          disabled={rating === 0}
                          className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                        >
                          <Send className="w-5 h-5" />
                          Submit Feedback
                        </button>
                      </div>
                    ) : (
                      <div className="text-center p-4 bg-white rounded-2xl border border-black/5">
                        <p className="text-sm font-medium text-neutral-700 italic">"{selectedTicket.feedback}"</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Chatbot Floating Button */}
      <div className="fixed bottom-8 right-8 z-[60]">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="absolute bottom-20 right-0 w-80 md:w-96 bg-white rounded-3xl shadow-2xl border border-black/5 overflow-hidden flex flex-col h-[500px]"
            >
              <div className="p-4 bg-indigo-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold">Support Assistant</h4>
                    <p className="text-[10px] text-indigo-200 uppercase tracking-wider font-bold">Powered by Gemini AI</p>
                  </div>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-50">
                {chatMessages.length === 0 && (
                  <div className="text-center py-10">
                    <Bot className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                    <p className="text-sm text-neutral-500 font-medium">Hello! How can I help you today?</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-tr-none' 
                        : 'bg-white text-neutral-800 border border-black/5 rounded-tl-none shadow-sm'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-black/5 shadow-sm">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce"></span>
                        <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                        <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-black/5 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask anything..."
                  className="flex-1 px-4 py-2 bg-neutral-100 border-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isTyping}
                  className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all transform hover:scale-110 active:scale-95 ${
            isChatOpen ? 'bg-neutral-900 text-white' : 'bg-indigo-600 text-white'
          }`}
        >
          {isChatOpen ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
}
