import { collection, addDoc, serverTimestamp, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

export type NotificationType = 'info' | 'warning' | 'error' | 'success';
export type NotificationPreferenceKey = 'newTicket' | 'ticketUpdate' | 'newComment';

export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: NotificationType,
  preferenceKey: NotificationPreferenceKey,
  link?: string
) => {
  try {
    // Special case for 'admin' - we might want to broadcast or send to a specific admin ID
    // For this implementation, we'll treat 'admin' as a special recipient that App.tsx already listens to
    if (userId !== 'admin') {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const profile = userDoc.data() as UserProfile;
        const prefs = profile.notificationPreferences;
        
        // If preferences exist and the specific key is false, don't send
        // Default to true if not set
        if (prefs && prefs[preferenceKey] === false) {
          return;
        }
      }
    }

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
    console.error("Error creating notification:", error);
  }
};

export const notifyTechnicians = async (
  technicianIds: string[],
  title: string,
  message: string,
  type: NotificationType,
  preferenceKey: NotificationPreferenceKey,
  link?: string,
  excludeUserId?: string
) => {
  const promises = technicianIds
    .filter(id => id !== excludeUserId)
    .map(id => createNotification(id, title, message, type, preferenceKey, link));
  
  await Promise.all(promises);
};
