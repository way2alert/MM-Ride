import React, { useState, useEffect, useRef } from 'react';
import { Bell, FileCheck2, X, Volume2, ShieldAlert, ArrowRight, Smartphone } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

// Web Audio API synthesized chime (No external mp3 file needed)
export function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;

    // First tone (880 Hz - High A)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second tone (1320 Hz - High E harmonized)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now + 0.12);
    gain2.gain.setValueAtTime(0.3, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.65);
  } catch (err) {
    console.warn('Audio chime warning:', err);
  }
}

export default function NotificationBanner({ setTab }) {
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [latestAlert, setLatestAlert] = useState(null);
  const [dismissedIds, setDismissedIds] = useState(new Set());
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('phoneAlertsDismissed') === 'true';
    } catch (e) {
      return false;
    }
  });
  const prevCountRef = useRef(0);
  const initialLoadRef = useRef(true);

  // Request browser notification permission
  const requestPushPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPermission(perm);
        if (perm === 'granted') {
          new Notification('MM Ride Admin Alert Enabled! 🔔', {
            body: 'You will receive instant alerts on this phone when drivers register.',
            icon: '/logo.png'
          });
          playNotificationChime();
        }
      } catch (e) {
        console.warn('Permission request error:', e);
      }
    }
  };

  useEffect(() => {
    // Realtime listener for drivers requiring verification / approval
    const q = collection(db, 'drivers');
    const unsub = onSnapshot(q, (snapshot) => {
      const pending = [];
      snapshot.docs.forEach((docSnap) => {
        const d = { id: docSnap.id, ...docSnap.data() };
        const isPending =
          d.approvalStatus === 'PENDING' ||
          d.verificationStatus === 'PENDING' ||
          d.accountStatus === 'DOCUMENT_VERIFICATION_PENDING' ||
          d.accountStatus === 'DOCUMENTS_SUBMITTED' ||
          d.accountStatus === 'REGISTERED';

        if (isPending) {
          pending.push(d);
        }
      });

      // Sort by registeredAt descending
      pending.sort((a, b) => new Date(b.registeredAt || 0) - new Date(a.registeredAt || 0));
      setPendingDrivers(pending);

      // Trigger sound & push notification if new driver arrived (after initial load)
      if (!initialLoadRef.current && pending.length > prevCountRef.current) {
        const newest = pending[0];
        setLatestAlert(newest);

        // 1. Audio chime
        playNotificationChime();

        // 2. Phone vibration (if open on Android / Phone)
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([250, 100, 250, 100, 350]);
          } catch (e) {}
        }

        // 3. Native system push notification
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const notif = new Notification('🚨 MM Ride: New Driver Registered!', {
              body: `${newest.fullName || 'Driver'} (${newest.mobileNumber || ''}) submitted KYC documents. Tap to approve.`,
              icon: '/logo.png',
              tag: `driver_${newest.id}`
            });
            notif.onclick = () => {
              window.focus();
              if (setTab) setTab('verification');
            };
          } catch (e) {}
        }
      }

      // If initial load had pending drivers, set the latest one for display
      if (initialLoadRef.current && pending.length > 0) {
        setLatestAlert(pending[0]);
      }

      prevCountRef.current = pending.length;
      initialLoadRef.current = false;
    }, (err) => {
      console.warn('Driver notification listener fallback:', err.message);
    });

    return () => unsub();
  }, [setTab]);

  const activeAlert = latestAlert && !dismissedIds.has(latestAlert.id) ? latestAlert : null;

  return (
    <>
      {/* 1. Floating Actionable Top Alert Banner */}
      {activeAlert && (
        <div style={{
          backgroundColor: '#1E1B4B',
          borderBottom: '2px solid #818CF8',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#EEF2FF',
          fontSize: '0.85rem',
          animation: 'slideDown 0.3s ease-out',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.4)',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: '#4F46E5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFF'
            }}>
              <Bell size={18} className="pulse-bell" />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#FFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>NEW DRIVER REGISTRATION</span>
                <span style={{
                  fontSize: '0.7rem',
                  backgroundColor: '#F59E0B',
                  color: '#000',
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontWeight: 800
                }}>
                  PENDING APPROVAL
                </span>
              </div>
              <div style={{ color: '#C7D2FE', fontSize: '0.78rem', marginTop: 2 }}>
                <b>{activeAlert.fullName || 'New Driver'}</b> • Phone: <b>+91 {activeAlert.mobileNumber || 'N/A'}</b> • DL: {activeAlert.dlNumber || 'Pending'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => {
                if (setTab) setTab('verification');
              }}
              style={{
                backgroundColor: '#10B981',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <FileCheck2 size={15} />
              <span>Verify & Approve Now</span>
              <ArrowRight size={14} />
            </button>

            <button
              onClick={() => {
                playNotificationChime();
              }}
              title="Test Sound Chime"
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#A5B4FC',
                borderRadius: 6,
                padding: '6px 8px',
                cursor: 'pointer'
              }}
            >
              <Volume2 size={15} />
            </button>

            <button
              onClick={() => {
                setDismissedIds(prev => new Set(prev).add(activeAlert.id));
              }}
              title="Dismiss"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* 2. Push Notification Enable Prompt (if not granted yet on Phone/Browser and not dismissed) */}
      {notificationPermission !== 'granted' && !bannerDismissed && (
        <div style={{
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
          padding: '6px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.78rem',
          color: '#FBBF24'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Smartphone size={15} />
            <span>Enable phone notifications to get instant alerts whenever drivers register!</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={requestPushPermission}
              style={{
                backgroundColor: '#F59E0B',
                color: '#000',
                border: 'none',
                borderRadius: 4,
                padding: '3px 10px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Enable Phone Alerts
            </button>
            <button
              onClick={() => {
                setBannerDismissed(true);
                try {
                  sessionStorage.setItem('phoneAlertsDismissed', 'true');
                } catch (e) {}
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#FBBF24',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
