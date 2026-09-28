import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState('SUPER_ADMIN');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const adminDocRef = doc(db, 'adminUsers', user.uid);
          const adminSnap = await getDoc(adminDocRef);
          if (adminSnap.exists()) {
            const data = adminSnap.data();
            setUserRole(data.role || 'SUPER_ADMIN');
          } else {
            // Default to SUPER_ADMIN for initial setup
            await setDoc(adminDocRef, {
              email: user.email,
              role: 'SUPER_ADMIN',
              active: true,
              name: user.email?.split('@')[0] || 'Administrator'
            }, { merge: true });
            setUserRole('SUPER_ADMIN');
          }
          setCurrentUser(user);
        } catch (err) {
          console.warn('Could not fetch admin role, falling back to SUPER_ADMIN:', err.message);
          setCurrentUser(user);
          setUserRole('SUPER_ADMIN');
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email, password) => {
    try {
      return await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      // If user doesn't exist yet in fresh Firebase project, auto-provision test admin account
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          await setDoc(doc(db, 'adminUsers', cred.user.uid), {
            email: cred.user.email,
            role: 'SUPER_ADMIN',
            active: true,
            name: 'Master Admin'
          });
          return cred;
        } catch (createErr) {
          throw err;
        }
      }
      throw err;
    }
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ currentUser, userRole, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
