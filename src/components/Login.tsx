import { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { LogIn, UserPlus, Mail, Lock, AlertCircle, Chrome } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const getErrorMessage = (err: any) => {
    if (err.code === 'auth/operation-not-allowed') {
      return "Sign-in method not enabled. Please enable 'Email/Password' and 'Google' in your Firebase Console (Authentication > Sign-in method).";
    }
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      return "Invalid email or password. Please check your credentials or use 'Forgot password' to reset.";
    }
    if (err.code === 'auth/invalid-email') {
      return "The email address is not valid.";
    }
    if (err.code === 'auth/email-already-in-use') {
      return "This email is already registered. Try signing in instead.";
    }
    if (err.code === 'auth/weak-password') {
      return "Password should be at least 6 characters.";
    }
    if (err.code === 'auth/popup-closed-by-user') {
      return "Google sign-in was cancelled.";
    }
    if (err.code === 'auth/unauthorized-domain') {
      return "This domain is not authorized for authentication. Please add the current URL to 'Authorized domains' in your Firebase Console (Authentication > Settings).";
    }
    if (err.code === 'auth/network-request-failed') {
      return "Network error. Please check your internet connection.";
    }
    return err.message || "An error occurred during authentication";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Create initial profile for new user
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          name: user.email?.split('@')[0] || 'User',
          role: 'staf', // Default role
          password: password, // Store password for reference in User Management
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      onSuccess();
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (err: any) {
      console.error("Reset error:", err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if profile exists
      const profileDoc = await getDoc(doc(db, 'users', user.uid));
      if (!profileDoc.exists()) {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split('@')[0] || 'User',
          photoURL: user.photoURL,
          role: 'staf',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      onSuccess();
    } catch (err: any) {
      console.error("Google Auth error:", err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-black/5 border border-black/5 overflow-hidden"
      >
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <LogIn className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p className="text-neutral-500 mt-2">
              {isLogin ? 'Sign in to access your dashboard' : 'Join us to manage your service desk'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-sm"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {resetSent && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-600 rounded-xl text-sm"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p>Password reset email sent! Check your inbox.</p>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isLogin ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                  {isLogin ? 'Sign In' : 'Sign Up'}
                </>
              )}
            </button>
          </form>

          {isLogin && (
            <div className="mt-4 text-right">
              <button
                onClick={handleForgotPassword}
                className="text-xs font-semibold text-neutral-500 hover:text-emerald-600 transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-neutral-500">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 bg-white border border-neutral-200 text-neutral-700 font-semibold rounded-xl hover:bg-neutral-50 transition-all flex items-center justify-center gap-3"
          >
            <Chrome className="w-5 h-5 text-blue-500" />
            Google Account
          </button>

          <div className="mt-8 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
