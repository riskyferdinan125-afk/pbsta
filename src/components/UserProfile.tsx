import React, { useState } from 'react';
import { User, Mail, Shield, ExternalLink, ChevronRight, Send, CheckCircle2, Lock, LayoutDashboard, Ticket, Bell, AlertCircle, X, Wrench } from 'lucide-react';
import { UserProfile as IUserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

interface Props {
  profile: IUserProfile | null;
  onNavigate?: (view: any) => void;
}

export default function UserProfile({ profile, onNavigate }: Props) {
  const resolvePhotoUrl = (url: string | null | undefined) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')) return url;
    if (!url.includes('/')) {
      return `/api/telegram-photo/${url}`;
    }
    return url;
  };
  const [telegramId, setTelegramId] = useState(profile?.telegramId || '');
  const [specialization, setSpecialization] = useState(profile?.specialization || '');
  const [skills, setSkills] = useState(profile?.skills?.join(', ') || '');
  const [workingDays, setWorkingDays] = useState<string[]>(profile?.workingDays || []);
  const [workingHours, setWorkingHours] = useState(profile?.workingHours || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingSkills, setSavingSkills] = useState(false);
  const [savedSkills, setSavedSkills] = useState(false);
  
  // Change Password State
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState(profile?.notificationPreferences || {
    newTicket: true,
    ticketUpdate: true,
    newComment: true
  });
  const [savingNotif, setSavingNotif] = useState(false);
  const [savedNotif, setSavedNotif] = useState(false);

  const isPasswordUser = auth.currentUser?.providerData.some(p => p.providerId === 'password');

  if (!profile) return null;

  const handleSaveNotifPrefs = async () => {
    if (!profile.uid) return;
    setSavingNotif(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        notificationPreferences: notifPrefs
      });
      setSavedNotif(true);
      setTimeout(() => setSavedNotif(false), 3000);
    } catch (error) {
      console.error("Error saving notification preferences:", error);
    } finally {
      setSavingNotif(false);
    }
  };

  const handleSaveTelegram = async () => {
    if (!profile.uid) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        telegramId: telegramId
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Error saving telegram ID:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfessionalProfile = async () => {
    if (!profile.uid) return;
    setSavingSkills(true);
    try {
      const skillsArray = skills.split(',').map(s => s.trim()).filter(Boolean);
      await updateDoc(doc(db, 'users', profile.uid), {
        specialization,
        skills: skillsArray,
        workingDays,
        workingHours
      });
      setSavedSkills(true);
      setTimeout(() => setSavedSkills(false), 3000);
    } catch (error) {
      console.error("Error saving professional profile:", error);
    } finally {
      setSavingSkills(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }

    setPasswordLoading(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error("User not found");

      // Re-authenticate first
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);
      
      // Update password in Firestore profile too (for admin reference as requested before)
      await updateDoc(doc(db, 'users', user.uid), {
        password: newPassword,
        updatedAt: new Date()
      });

      setPasswordSuccess("Password updated successfully!");
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setIsChangingPassword(false), 2000);
    } catch (error: any) {
      console.error("Error changing password:", error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setPasswordError("Current password is incorrect. Please try again.");
      } else if (error.code === 'auth/too-many-requests') {
        setPasswordError("Too many failed attempts. Please try again later.");
      } else {
        setPasswordError(error.message || "Failed to update password.");
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
        <div className="h-32 bg-indigo-600" />
        <div className="px-8 pb-8">
          <div className="relative -mt-12 mb-6">
            <img 
              src={resolvePhotoUrl(profile.photoURL || `https://ui-avatars.com/api/?name=${profile.name}`)} 
              alt={profile.name}
              className="w-24 h-24 rounded-2xl border-4 border-white shadow-lg bg-white"
            />
          </div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">{profile.name}</h1>
              <p className="text-neutral-500 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                {profile.email}
              </p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-bold uppercase tracking-wider">
               <Shield className="w-4 h-4" />
               {profile.role}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm space-y-6"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
              <Send className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-neutral-900">Telegram Integration</h3>
          </div>
          
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 leading-relaxed">
              Link your Telegram account to receive notifications and update tickets directly from Telegram.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Telegram Chat ID</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  placeholder="Enter your Chat ID"
                  className="flex-1 px-4 py-3 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
                <button 
                  onClick={handleSaveTelegram}
                  disabled={saving}
                  className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {saved ? <CheckCircle2 className="w-4 h-4" /> : 'Save'}
                </button>
              </div>
              <p className="text-[10px] text-neutral-400 italic">
                Get your Chat ID by messaging <span className="font-bold">@ServiceDeskBot</span> (or your bot) and typing <code className="bg-neutral-100 px-1 rounded">/start</code>
              </p>
            </div>
          </div>
        </motion.div>

        {profile.role === 'teknisi' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm space-y-6 md:col-span-2"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                <Wrench className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900">Professional Skills</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Main Specialization</label>
                <input 
                  type="text" 
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  placeholder="e.g. REGULER, PSB, SQM"
                  className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
                <p className="text-[10px] text-neutral-400 italic">This helps the Smart Assignment algorithm find the best tickets for you.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Additional Skills (Comma separated)</label>
                <input 
                  type="text" 
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="Fiber Optic, ODP, Splitting, etc."
                  className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Working Hours</label>
                <input 
                  type="text" 
                  value={workingHours}
                  onChange={(e) => setWorkingHours(e.target.value)}
                  placeholder="e.g. 08:00 - 17:00"
                  className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
                <p className="text-[10px] text-neutral-400 italic">Specify your daily shift or availability hours.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Working Days</label>
                <div className="flex flex-wrap gap-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        setWorkingDays(prev => 
                          prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                        );
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        workingDays.includes(day)
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                          : 'bg-neutral-50 border-black/5 text-neutral-500 hover:border-emerald-600'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button 
                onClick={handleSaveProfessionalProfile}
                disabled={savingSkills}
                className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-600/20"
              >
                {savedSkills ? <CheckCircle2 className="w-4 h-4" /> : 'Update Professional Profile'}
              </button>
            </div>
          </motion.div>
        )}

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm space-y-6 md:col-span-2"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
              <Bell className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-neutral-900">Notification Preferences</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-2xl border border-black/5">
              <div>
                <p className="text-sm font-bold text-neutral-900">New Tickets</p>
                <p className="text-[10px] text-neutral-500">When assigned to a new ticket</p>
              </div>
              <button 
                onClick={() => setNotifPrefs(prev => ({ ...prev, newTicket: !prev.newTicket }))}
                className={`w-12 h-6 rounded-full transition-all relative ${notifPrefs.newTicket ? 'bg-emerald-500' : 'bg-neutral-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${notifPrefs.newTicket ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-2xl border border-black/5">
              <div>
                <p className="text-sm font-bold text-neutral-900">Ticket Updates</p>
                <p className="text-[10px] text-neutral-500">Status, priority, or detail changes</p>
              </div>
              <button 
                onClick={() => setNotifPrefs(prev => ({ ...prev, ticketUpdate: !prev.ticketUpdate }))}
                className={`w-12 h-6 rounded-full transition-all relative ${notifPrefs.ticketUpdate ? 'bg-emerald-500' : 'bg-neutral-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${notifPrefs.ticketUpdate ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-2xl border border-black/5">
              <div>
                <p className="text-sm font-bold text-neutral-900">New Comments</p>
                <p className="text-[10px] text-neutral-500">When someone adds a note</p>
              </div>
              <button 
                onClick={() => setNotifPrefs(prev => ({ ...prev, newComment: !prev.newComment }))}
                className={`w-12 h-6 rounded-full transition-all relative ${notifPrefs.newComment ? 'bg-emerald-500' : 'bg-neutral-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${notifPrefs.newComment ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button 
              onClick={handleSaveNotifPrefs}
              disabled={savingNotif}
              className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-indigo-600/20"
            >
              {savedNotif ? <CheckCircle2 className="w-4 h-4" /> : 'Save Preferences'}
            </button>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm space-y-6"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
              <ExternalLink className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-neutral-900">Quick Links</h3>
          </div>
          
          <div className="grid grid-cols-1 gap-3">
            {isPasswordUser && (
              <button 
                onClick={() => setIsChangingPassword(true)}
                className="flex items-center justify-between p-4 bg-neutral-50 hover:bg-neutral-100 rounded-2xl transition-all group"
              >
                <div className="flex items-center gap-3">
                  <Lock className="w-4 h-4 text-neutral-400 group-hover:text-indigo-600 transition-colors" />
                  <span className="text-sm font-medium text-neutral-700">Change Password</span>
                </div>
                <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
              </button>
            )}
            
            <button 
              onClick={() => onNavigate?.('dashboard')}
              className="flex items-center justify-between p-4 bg-neutral-50 hover:bg-neutral-100 rounded-2xl transition-all group"
            >
              <div className="flex items-center gap-3">
                <LayoutDashboard className="w-4 h-4 text-neutral-400 group-hover:text-indigo-600 transition-colors" />
                <span className="text-sm font-medium text-neutral-700">Go to Dashboard</span>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
            </button>

            <button 
              onClick={() => onNavigate?.('tickets')}
              className="flex items-center justify-between p-4 bg-neutral-50 hover:bg-neutral-100 rounded-2xl transition-all group"
            >
              <div className="flex items-center gap-3">
                <Ticket className="w-4 h-4 text-neutral-400 group-hover:text-indigo-600 transition-colors" />
                <span className="text-sm font-medium text-neutral-700">View My Tickets</span>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
            </button>

            <button 
              onClick={() => onNavigate?.('notifications')}
              className="flex items-center justify-between p-4 bg-neutral-50 hover:bg-neutral-100 rounded-2xl transition-all group"
            >
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-neutral-400 group-hover:text-indigo-600 transition-colors" />
                <span className="text-sm font-medium text-neutral-700">Notification Preferences</span>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>
      </div>

      {/* Change Password Modal */}
      <AnimatePresence>
        {isChangingPassword && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-neutral-900">Change Password</h3>
                  <button 
                    onClick={() => setIsChangingPassword(false)}
                    className="p-2 hover:bg-neutral-100 rounded-xl transition-colors"
                  >
                    <X className="w-5 h-5 text-neutral-400" />
                  </button>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Current Password</label>
                    <input 
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      placeholder="Enter current password"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">New Password</label>
                    <input 
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      placeholder="Enter new password"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Confirm New Password</label>
                    <input 
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      placeholder="Confirm new password"
                    />
                  </div>

                  {passwordError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <p>{passwordError}</p>
                    </div>
                  )}

                  {passwordSuccess && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-600 rounded-xl text-xs">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <p>{passwordSuccess}</p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setIsChangingPassword(false)}
                      className="flex-1 px-6 py-3 bg-neutral-100 text-neutral-600 font-bold rounded-xl hover:bg-neutral-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={passwordLoading}
                      className="flex-1 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {passwordLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        'Update Password'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
