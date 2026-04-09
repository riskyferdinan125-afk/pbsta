import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Customer, Ticket, Asset } from '../types';
import { X, Ticket as TicketIcon, Box, Clock, MapPin, Phone, Mail, Hash, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CustomerDetailsModalProps {
  customer: Customer;
  onClose: () => void;
}

export default function CustomerDetailsModal({ customer, onClose }: CustomerDetailsModalProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activeTab, setActiveTab] = useState<'info' | 'tickets' | 'assets'>('info');
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(true);

  useEffect(() => {
    // Fetch tickets for this customer
    const ticketsQuery = query(
      collection(db, 'tickets'),
      where('customerId', '==', customer.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeTickets = onSnapshot(ticketsQuery, (snapshot) => {
      setTickets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket)));
      setLoadingTickets(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `tickets?customerId=${customer.id}`);
      setLoadingTickets(false);
    });

    // Fetch assets for this customer
    const assetsQuery = query(
      collection(db, 'assets'),
      where('customerId', '==', customer.id)
    );

    const unsubscribeAssets = onSnapshot(assetsQuery, (snapshot) => {
      setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset)));
      setLoadingAssets(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `assets?customerId=${customer.id}`);
      setLoadingAssets(false);
    });

    return () => {
      unsubscribeTickets();
      unsubscribeAssets();
    };
  }, [customer.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-700';
      case 'in-progress': return 'bg-amber-100 text-amber-700';
      case 'resolved': return 'bg-emerald-100 text-emerald-700';
      case 'closed': return 'bg-neutral-100 text-neutral-700';
      default: return 'bg-neutral-100 text-neutral-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-black/5 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
              <Hash className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-neutral-900">{customer.name}</h3>
              <p className="text-sm text-neutral-500 font-mono">{customer.customerId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-xl transition-colors shadow-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-black/5 px-6 bg-neutral-50">
          {[
            { id: 'info', label: 'Basic Details', icon: MapPin },
            { id: 'tickets', label: `Ticket History (${tickets.length})`, icon: TicketIcon },
            { id: 'assets', label: `Asset List (${assets.length})`, icon: Box },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'info' && (
              <motion.div
                key="info"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                <div className="space-y-6">
                  <section>
                    <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4">Contact Details</h4>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl">
                        <Phone className="w-5 h-5 text-neutral-400" />
                        <div>
                          <p className="text-xs text-neutral-500">Phone Number</p>
                          <p className="text-sm font-bold text-neutral-900">{customer.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl">
                        <Mail className="w-5 h-5 text-neutral-400" />
                        <div>
                          <p className="text-xs text-neutral-500">Email Address</p>
                          <p className="text-sm font-bold text-neutral-900">{customer.email || 'Not provided'}</p>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
                <div className="space-y-6">
                  <section>
                    <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4">Service Location</h4>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl">
                        <Box className="w-5 h-5 text-neutral-400" />
                        <div>
                          <p className="text-xs text-neutral-500">ODP Point</p>
                          <p className="text-sm font-bold text-neutral-900">{customer.odp || 'Not set'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-neutral-50 rounded-xl">
                        <MapPin className="w-5 h-5 text-neutral-400 mt-1" />
                        <div>
                          <p className="text-xs text-neutral-500">Address</p>
                          <p className="text-sm font-bold text-neutral-900 leading-relaxed">{customer.address}</p>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'tickets' && (
              <motion.div
                key="tickets"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                {loadingTickets ? (
                  <div className="space-y-4">
                    {[1, 2].map(i => (
                      <div key={i} className="h-32 bg-neutral-50 rounded-2xl animate-pulse" />
                    ))}
                  </div>
                ) : tickets.length > 0 ? (
                  tickets.map((ticket) => (
                    <div key={ticket.id} className="p-4 bg-white border border-black/5 rounded-2xl hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                              #{ticket.ticketNumber}
                            </span>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${getStatusColor(ticket.status)}`}>
                              {ticket.status}
                            </span>
                          </div>
                          <h5 className="font-bold text-neutral-900">{ticket.title || 'Service Ticket'}</h5>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-neutral-400 flex items-center gap-1 justify-end">
                            <Calendar className="w-3 h-3" />
                            {ticket.createdAt.toDate().toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-neutral-500 line-clamp-2 mb-3">{ticket.description}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-neutral-400 bg-neutral-50 px-2 py-1 rounded">
                          {ticket.category}
                        </span>
                        {ticket.priority === 'urgent' && (
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded">
                            URGENT
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center">
                    <TicketIcon className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
                    <p className="text-neutral-500 font-medium">No ticket history found.</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'assets' && (
              <motion.div
                key="assets"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {loadingAssets ? (
                  <div className="col-span-full space-y-4">
                    {[1, 2].map(i => (
                      <div key={i} className="h-24 bg-neutral-50 rounded-2xl animate-pulse" />
                    ))}
                  </div>
                ) : assets.length > 0 ? (
                  assets.map((asset) => (
                    <div key={asset.id} className="p-4 bg-white border border-black/5 rounded-2xl hover:shadow-md transition-all flex items-start gap-4">
                      <div className="w-10 h-10 bg-neutral-50 text-neutral-400 rounded-xl flex items-center justify-center shrink-0">
                        <Box className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="font-bold text-neutral-900 truncate">{asset.name}</h5>
                        <p className="text-xs text-neutral-500 mb-2">{asset.model}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-neutral-400 bg-neutral-50 px-2 py-0.5 rounded">
                            S/N: {asset.serialNumber}
                          </span>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            asset.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-700'
                          }`}>
                            {asset.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-12 text-center">
                    <Box className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
                    <p className="text-neutral-500 font-medium">No assets registered.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
