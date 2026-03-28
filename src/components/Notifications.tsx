import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, updateDoc, doc, serverTimestamp, Timestamp, limit } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, Notification } from '../types';
import { Bell, BellOff, X, CheckCircle2, AlertCircle, Info, ChevronRight, Clock, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';

export default function Notifications({ profile }: { profile: UserProfile | null }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser || !profile) return;

    // Fetch notifications for current user (or 'admin' if admin)
    const userIds = [auth.currentUser.uid];
    if (profile.role === 'admin' || profile.role === 'superadmin') {
      userIds.push('admin');
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', 'in', userIds),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      setNotifications(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), {
        read: true,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'notifications');
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    try {
      await Promise.all(unread.map(n => 
        updateDoc(doc(db, 'notifications', n.id), {
          read: true,
          updatedAt: serverTimestamp()
        })
      ));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'notifications');
    }
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'warning': return <AlertCircle className="w-5 h-5 text-amber-500" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-500" />;
      default: return <Info className="w-5 h-5 text-indigo-500" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Notifications</h1>
          <p className="text-neutral-500">Stay updated with your ticket activity</p>
        </div>
        {notifications.some(n => !n.read) && (
          <button
            onClick={markAllAsRead}
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="py-20 text-center text-neutral-500">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-neutral-300">
            <BellOff className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-neutral-900 mb-2">No notifications</h3>
            <p className="text-neutral-500">We'll let you know when something happens.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {notifications.map(notification => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className={`bg-white rounded-2xl border border-black/5 shadow-sm p-5 flex items-start gap-4 group transition-all ${!notification.read ? 'bg-indigo-50/30 border-indigo-100 ring-1 ring-indigo-500/10' : ''}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  !notification.read ? 'bg-white shadow-sm' : 'bg-neutral-50'
                }`}>
                  {getIcon(notification.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className={`font-bold text-neutral-900 truncate ${!notification.read ? 'text-indigo-900' : ''}`}>
                      {notification.title}
                    </h4>
                    <span className="text-[10px] font-medium text-neutral-400 whitespace-nowrap flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3" />
                      {notification.createdAt instanceof Timestamp ? notification.createdAt.toDate().toLocaleDateString() : 'Just now'}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-600 mt-1 leading-relaxed">{notification.message}</p>
                  
                  {notification.link && (
                    <Link
                      to={notification.link}
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 mt-3 hover:text-indigo-700 transition-colors"
                      onClick={() => markAsRead(notification.id)}
                    >
                      View Details
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>

                {!notification.read && (
                  <button
                    onClick={() => markAsRead(notification.id)}
                    className="p-2 hover:bg-white rounded-lg transition-colors text-neutral-400 hover:text-indigo-600 shadow-sm opacity-0 group-hover:opacity-100"
                    title="Mark as read"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
