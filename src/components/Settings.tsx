import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Shield, Bell, Database, Globe, ChevronLeft, Send, CheckCircle2, Loader2, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function Settings({ profile, onNavigate }: { profile: UserProfile | null, onNavigate?: (view: string) => void }) {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [notifPrefs, setNotifPrefs] = useState({
    newTicket: profile?.notificationPreferences?.newTicket ?? true,
    ticketUpdate: profile?.notificationPreferences?.ticketUpdate ?? true,
    newComment: profile?.notificationPreferences?.newComment ?? true
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile?.notificationPreferences) {
      setNotifPrefs({
        newTicket: profile.notificationPreferences.newTicket,
        ticketUpdate: profile.notificationPreferences.ticketUpdate,
        newComment: profile.notificationPreferences.newComment
      });
    }
  }, [profile]);

  const handleSaveNotifPrefs = async () => {
    if (!profile?.uid) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        notificationPreferences: notifPrefs
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Error saving notification preferences:", error);
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    {
      id: 'system',
      title: 'System Configuration',
      icon: Database,
      description: 'Manage database backups, retention policies, and system-wide defaults.',
      items: [
        { label: 'Database Backup', action: () => {} },
        { label: 'Auto-Archive Tickets', action: () => {} },
        { label: 'Default Priority', action: () => {} }
      ]
    },
    {
      id: 'security',
      title: 'Security & Access',
      icon: Shield,
      description: 'Configure multi-factor authentication, IP whitelisting, and role permissions.',
      items: [
        { label: 'MFA Settings', action: () => {} },
        { label: 'IP Access Control', action: () => {} },
        { label: 'Audit Logs', action: () => {} }
      ]
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: Bell,
      description: 'Set up email, SMS, and push notification templates for ticket updates.',
      items: [
        { label: 'Email Templates', action: () => {} },
        { label: 'SMS Gateway', action: () => {} },
        { label: 'Push Notifications', action: () => {} }
      ]
    },
    {
      id: 'localization',
      title: 'Localization',
      icon: Globe,
      description: 'Change system language, timezone, and currency formats.',
      items: [
        { label: 'Language', action: () => {} },
        { label: 'Timezone', action: () => {} },
        { label: 'Currency', action: () => {} }
      ]
    },
    {
      id: 'integrations',
      title: 'Integrations',
      icon: Send,
      description: 'Connect with external services like Telegram for automated notifications.',
      items: [
        { label: 'Telegram Bot Settings', action: () => onNavigate?.('telegram') },
        { label: 'Email Gateway', action: () => {} },
        { label: 'API Access', action: () => {} }
      ]
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">System Settings</h1>
          <p className="text-neutral-500">Configure global application parameters and security.</p>
        </div>
        <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
          <SettingsIcon className="w-6 h-6" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Notification Preferences Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm space-y-6"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-indigo-100 text-indigo-600">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900">Notification Preferences</h3>
              <p className="text-sm text-neutral-500">Manage how you receive alerts for ticket activities.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl border border-black/5">
              <div>
                <p className="text-sm font-bold text-neutral-900">New Tickets</p>
                <p className="text-[10px] text-neutral-500">When assigned to a new ticket</p>
              </div>
              <button 
                onClick={() => setNotifPrefs(prev => ({ ...prev, newTicket: !prev.newTicket }))}
                className={`w-10 h-5 rounded-full transition-all relative ${notifPrefs.newTicket ? 'bg-emerald-500' : 'bg-neutral-300'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${notifPrefs.newTicket ? 'left-5.5' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl border border-black/5">
              <div>
                <p className="text-sm font-bold text-neutral-900">Ticket Updates</p>
                <p className="text-[10px] text-neutral-500">Status, priority, or detail changes</p>
              </div>
              <button 
                onClick={() => setNotifPrefs(prev => ({ ...prev, ticketUpdate: !prev.ticketUpdate }))}
                className={`w-10 h-5 rounded-full transition-all relative ${notifPrefs.ticketUpdate ? 'bg-emerald-500' : 'bg-neutral-300'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${notifPrefs.ticketUpdate ? 'left-5.5' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl border border-black/5">
              <div>
                <p className="text-sm font-bold text-neutral-900">New Comments</p>
                <p className="text-[10px] text-neutral-500">When someone adds a note</p>
              </div>
              <button 
                onClick={() => setNotifPrefs(prev => ({ ...prev, newComment: !prev.newComment }))}
                className={`w-10 h-5 rounded-full transition-all relative ${notifPrefs.newComment ? 'bg-emerald-500' : 'bg-neutral-300'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${notifPrefs.newComment ? 'left-5.5' : 'left-0.5'}`} />
              </button>
            </div>

            <button
              onClick={handleSaveNotifPrefs}
              disabled={saving}
              className="w-full py-2.5 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : null}
              {saved ? 'Preferences Saved' : 'Save Preferences'}
            </button>
          </div>
        </motion.div>

        {sections.map((section, idx) => (
          <motion.div
            key={section.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 rounded-xl bg-neutral-100 text-neutral-600">
                <section.icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-900">{section.title}</h3>
                <p className="text-sm text-neutral-500">{section.description}</p>
              </div>
            </div>
            <div className="space-y-2">
              {section.items.map(item => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full text-left px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 rounded-lg transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-orange-50 border border-orange-100 p-6 rounded-3xl flex items-start gap-4">
        <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-orange-900">Superadmin Access Only</h4>
          <p className="text-sm text-orange-800">
            These settings are critical for system stability. Only users with the <strong>Superadmin</strong> role can modify these parameters.
          </p>
        </div>
      </div>
    </div>
  );
}
