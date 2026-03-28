import { useState, useEffect } from 'react';
import { onAuthStateChanged, User, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, logout, testConnection } from './firebase';
import { UserProfile } from './types';
import { 
  LayoutDashboard, 
  Ticket as TicketIcon, 
  Users, 
  Package, 
  Briefcase,
  Wrench, 
  BarChart3, 
  LogOut, 
  LogIn,
  Menu,
  X,
  Activity,
  Settings as SettingsIcon,
  UserPlus,
  ClipboardList,
  Bell,
  Book,
  Monitor,
  UserCircle,
  HelpCircle,
  Send,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Components (to be implemented in separate files)
import Dashboard from './components/Dashboard';
import TicketList from './components/TicketList';
import CustomerList from './components/CustomerList';
import MaterialList from './components/MaterialList';
import TechnicianList from './components/TechnicianList';
import Reports from './components/Reports';
import TicketProgress from './components/TicketProgress';
import TicketAssignment from './components/TicketAssignment';
import Settings from './components/Settings';
import KnowledgeBase from './components/KnowledgeBase';
import AssetManagement from './components/AssetManagement';
import CustomerPortal from './components/CustomerPortal';
import Notifications from './components/Notifications';
import TechnicianGuide from './components/TechnicianGuide';
import UserProfileView from './components/UserProfile';
import TelegramSettings from './components/TelegramSettings';
import ProjectList from './components/ProjectList';
import PekerjaanList from './components/PekerjaanList';
import Login from './components/Login';
import { signInAnonymously } from 'firebase/auth';
import UserManagement from './components/UserManagement';
// import Login from './components/Login'; // Removed Google Login

type View = 'dashboard' | 'tickets' | 'assignments' | 'customers' | 'materials' | 'pekerjaan' | 'technicians' | 'reports' | 'progress' | 'settings' | 'knowledge' | 'assets' | 'portal' | 'notifications' | 'profile' | 'telegram' | 'projects' | 'users';

import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [pendingTicketCustomer, setPendingTicketCustomer] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Technician Location Tracking
  useEffect(() => {
    if (!profile || profile.role !== 'teknisi') return;

    const updateLocation = async (position: GeolocationPosition) => {
      try {
        if (!profile.email) return;
        const techQuery = query(collection(db, 'technicians'), where('email', '==', profile.email));
        const techSnap = await getDocs(techQuery);
        if (!techSnap.empty) {
          const techId = techSnap.docs[0].id;
          await updateDoc(doc(db, 'technicians', techId), {
            location: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              updatedAt: serverTimestamp()
            }
          });
        }
      } catch (error) {
        console.error("Error updating technician location:", error);
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      updateLocation,
      (error) => console.error("Geolocation error:", error),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [profile]);

  useEffect(() => {
    if (!user || !profile) return;
    
    const userIds = [user.uid];
    if (profile.role === 'admin' || profile.role === 'superadmin') {
      userIds.push('admin');
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', 'in', userIds),
      where('read', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadNotifications(snapshot.size);
    }, (error) => {
      console.error("Notification listener error:", error);
    });
    return unsubscribe;
  }, [user, profile]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 1024;
      setIsMobile(mobile);
      if (!mobile) setIsSidebarOpen(true);
      else setIsSidebarOpen(false);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isMobile) setIsSidebarOpen(false);
  }, [activeView, isMobile]);

  useEffect(() => {
    const checkConnection = async () => {
      const isConnected = await testConnection();
      if (!isConnected) {
        setTimeout(checkConnection, 5000);
      }
    };
    checkConnection();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile);
          } else {
            const isBootstrap = firebaseUser.email === "rafandanetid@gmail.com";
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || (isBootstrap ? 'Super Admin' : 'Staff'),
              email: firebaseUser.email || 'user@example.com',
              role: isBootstrap ? 'superadmin' : 'staf',
            };
            
            await setDoc(doc(db, 'users', firebaseUser.uid), {
              ...newProfile,
              updatedAt: serverTimestamp()
            }, { merge: true });
            
            setProfile(newProfile);
          }
        } catch (error: any) {
          console.error("Error fetching profile:", error);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const allNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['superadmin', 'admin', 'staf'] },
    { id: 'tickets', label: 'Tickets', icon: TicketIcon, roles: ['superadmin', 'admin', 'staf', 'teknisi'] },
    { id: 'customers', label: 'Customers', icon: Users, roles: ['superadmin', 'admin', 'staf'] },
    { id: 'materials', label: 'Materials', icon: Package, roles: ['superadmin', 'admin', 'staf'] },
    { id: 'pekerjaan', label: 'BOQ REKONSILIASI', icon: Briefcase, roles: ['superadmin', 'admin', 'staf'] },
    { id: 'technicians', label: 'Technicians', icon: Wrench, roles: ['superadmin', 'admin', 'staf'] },
    { id: 'assignments', label: 'Ticket Assignment', icon: ClipboardList, roles: ['superadmin', 'admin', 'staf'] },
    { id: 'progress', label: 'Ticket Progress', icon: Activity, roles: ['superadmin', 'admin', 'staf', 'teknisi'] },
    { id: 'projects', label: 'Projects', icon: Zap, roles: ['superadmin', 'admin', 'staf', 'teknisi'] },
    { id: 'assets', label: 'Assets', icon: Monitor, roles: ['superadmin', 'admin', 'staf'] },
    { id: 'knowledge', label: 'Knowledge Base', icon: Book, roles: ['superadmin', 'admin', 'staf', 'teknisi'] },
    { id: 'portal', label: 'Customer Portal', icon: UserCircle, roles: ['staf'] },
    { id: 'profile', label: 'My Profile', icon: UserCircle, roles: ['superadmin', 'admin', 'staf', 'teknisi'] },
    { id: 'reports', label: 'Reports', icon: BarChart3, roles: ['superadmin', 'admin', 'staf', 'teknisi'] },
    { id: 'users', label: 'User Management', icon: Users, roles: ['superadmin'] },
    { id: 'telegram', label: 'Telegram Integration', icon: Send, roles: ['superadmin'] },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, roles: ['superadmin'] },
  ];

  const userRole = profile?.role || 'staf';
  const navItems = allNavItems.filter(item => item.roles.includes(userRole));

  // If activeView is not allowed for current role, reset to first allowed view
  useEffect(() => {
    if (profile && !navItems.find(n => n.id === activeView)) {
      setActiveView(navItems[0]?.id as View || 'dashboard');
    }
  }, [profile, activeView, navItems]);

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setProfile(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user || !profile) {
    return <Login onSuccess={() => setLoading(true)} />;
  }


  return (
    <div className="min-h-screen bg-neutral-50 flex relative overflow-hidden">
      {/* Sidebar Backdrop */}
      <AnimatePresence>
        {isMobile && isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-64 translate-x-0' : 'w-20 -translate-x-full lg:translate-x-0'
        } ${isMobile ? 'fixed inset-y-0 left-0' : 'relative'} bg-white border-r border-black/5 transition-all duration-300 flex flex-col z-40 shadow-xl lg:shadow-none`}
      >
        <div className="p-4 lg:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            {isSidebarOpen ? (
              <img 
                src="https://i.pinimg.com/736x/b1/b2/14/b1b214df5ebc8e6c1b94075f7fc6d383.jpg" 
                alt="Application Logo" 
                className="w-full h-auto max-h-32 object-cover rounded-xl shadow-sm border border-black/5 transition-all"
                referrerPolicy="no-referrer"
              />
            ) : (
              !isMobile && (
                <img 
                  src="https://i.pinimg.com/736x/b1/b2/14/b1b214df5ebc8e6c1b94075f7fc6d383.jpg" 
                  alt="Application Logo" 
                  className="h-10 w-10 object-cover rounded-lg border border-black/5"
                  referrerPolicy="no-referrer"
                />
              )
            )}
            {isMobile && isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          {!isMobile && (
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="self-center p-2 hover:bg-neutral-100 rounded-lg text-neutral-500 transition-colors"
              title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id as View)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeView === item.id 
                  ? 'bg-emerald-50 text-emerald-700 font-medium shadow-sm' 
                  : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
              }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {isSidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
          <button
            onClick={() => setActiveView('notifications')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
              activeView === 'notifications' 
                ? 'bg-indigo-50 text-indigo-700 font-medium shadow-sm' 
                : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 shrink-0" />
              {isSidebarOpen && <span>Notifications</span>}
            </div>
            {unreadNotifications > 0 && (
              <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {unreadNotifications}
              </span>
            )}
          </button>
        </nav>

        <div className="p-4 border-t border-black/5">
          <button 
            onClick={() => setActiveView('profile')}
            className="w-full flex items-center gap-3 px-2 py-2 mb-4 hover:bg-neutral-50 rounded-xl transition-all text-left"
          >
            <img 
              src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
              alt="Profile" 
              className="w-10 h-10 rounded-full border border-black/5"
              referrerPolicy="no-referrer"
            />
            {isSidebarOpen && (
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-neutral-900 truncate">{user.displayName}</p>
                <p className="text-xs text-neutral-500 truncate capitalize">{profile?.role || 'User'}</p>
              </div>
            )}
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {isSidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-black/5 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-4">
            {isMobile && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-base lg:text-lg font-semibold text-neutral-900 capitalize truncate">
              {navItems.find(n => n.id === activeView)?.label}
            </h2>
          </div>
          <div className="flex items-center gap-4">
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
            <div className="hidden md:block text-sm text-neutral-500">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-8 overflow-auto flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeView === 'dashboard' && <Dashboard />}
              {activeView === 'tickets' && (
                <TicketList 
                  profile={profile}
                  initialCustomerId={pendingTicketCustomer} 
                  onClearInitialCustomer={() => setPendingTicketCustomer(null)} 
                />
              )}
              {activeView === 'customers' && (
                <CustomerList 
                  onCreateTicket={(customerId) => {
                    setPendingTicketCustomer(customerId);
                    setActiveView('tickets');
                  }} 
                />
              )}
              {activeView === 'materials' && <MaterialList />}
              {activeView === 'pekerjaan' && <PekerjaanList />}
              {activeView === 'technicians' && <TechnicianList profile={profile} />}
              {activeView === 'progress' && <TicketProgress profile={profile} />}
              {activeView === 'assignments' && <TicketAssignment profile={profile} />}
              {activeView === 'reports' && <Reports profile={profile} />}
              {activeView === 'projects' && <ProjectList profile={profile} />}
              {activeView === 'settings' && <Settings />}
            {activeView === 'knowledge' && <KnowledgeBase />}
            {activeView === 'assets' && <AssetManagement />}
            {activeView === 'portal' && <CustomerPortal />}
            {activeView === 'profile' && <UserProfileView profile={profile} onNavigate={(view) => setActiveView(view)} />}
            {activeView === 'notifications' && <Notifications profile={profile} />}
            {activeView === 'users' && <UserManagement profile={profile} />}
            {activeView === 'telegram' && <TelegramSettings />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <TechnicianGuide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}
