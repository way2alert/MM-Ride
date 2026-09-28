import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, onSnapshot, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Alert } from 'react-native';
import { auth, db } from '../firebase/config';
import { logGpsBreadcrumb, bindDriverDevice } from '../firebase/api';

const DriverContext = createContext();

export function DriverProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [driverProfile, setDriverProfile] = useState(null);
  const [assignedBike, setAssignedBike] = useState(null);
  const [activeDutySession, setActiveDutySession] = useState(null);
  const [hubs, setHubs] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [systemSettings, setSystemSettings] = useState({
    speedAlertThresholdKmh: 60,
    maxDutyHoursPerDay: 12,
    idleAlertThresholdMinutes: 30
  });
  const [todayDutyMinutes, setTodayDutyMinutes] = useState(0);
  const [loading, setLoading] = useState(true);

  // 0. Real-time System Settings Listener (Configurable speed limits, duty limits)
  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'system'), (snap) => {
      if (snap.exists()) {
        setSystemSettings(prev => ({ ...prev, ...snap.data() }));
      }
    }, (err) => {
      console.warn('System settings listener fallback to defaults:', err.message);
    });

    return unsubSettings;
  }, []);

  // 1. Auth Listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Register device info
        const deviceId = Device.osBuildId || Device.modelName || 'device_android_dev';
        await bindDriverDevice(user.uid, {
          deviceId,
          deviceName: Device.deviceName || 'Android Phone',
          model: Device.modelName || 'Android Device',
          os: Device.osName || 'Android',
          osVersion: Device.osVersion || '14',
          appVersion: Application.nativeApplicationVersion || '1.0.0',
          isDevice: Device.isDevice
        });
      } else {
        setDriverProfile(null);
        setAssignedBike(null);
        setActiveDutySession(null);
      }
      setLoading(false);
    });

    return unsubAuth;
  }, []);

  // 2. Real-time Driver Profile Listener
  useEffect(() => {
    if (!currentUser) return;

    const unsubDriver = onSnapshot(doc(db, 'drivers', currentUser.uid), async (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setDriverProfile(data);

        // Fetch assigned bike details if assigned
        if (data.assignedBikeId) {
          try {
            const bikeSnap = await getDoc(doc(db, 'bikes', data.assignedBikeId));
            if (bikeSnap.exists()) {
              setAssignedBike({ id: bikeSnap.id, ...bikeSnap.data() });
            }
          } catch (err) {
            console.warn('Error fetching assigned bike:', err);
          }
        } else {
          setAssignedBike(null);
        }

        // Fetch active duty session if on duty
        if (data.currentDutyId) {
          const unsubDuty = onSnapshot(doc(db, 'dutySessions', data.currentDutyId), (dutySnap) => {
            if (dutySnap.exists()) {
              setActiveDutySession({ id: dutySnap.id, ...dutySnap.data() });
            } else {
              setActiveDutySession(null);
            }
          });
          return () => unsubDuty();
        } else {
          setActiveDutySession(null);
        }
      } else {
        setDriverProfile(null);
      }
    });

    return unsubDriver;
  }, [currentUser]);

  // 3. Work-period GPS Telemetry Tracking (Active ONLY during work/duty per Section 13 & 40)
  useEffect(() => {
    let locationSubscription = null;
    let telemetryInterval = null;

    async function startWorkTracking() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Location permission denied');
          return;
        }

        // Request background permission with prominent in-app disclosure (Google Play Policy requirement)
        if (activeDutySession?.status === 'ACTIVE') {
          try {
            const bgStatus = await Location.getBackgroundPermissionsAsync();
            if (bgStatus.status !== 'granted') {
              Alert.alert(
                'Background Location Access 📍',
                'MM Ride collects real-time location data during your active shift to enable ride tracking, safety telemetry, and depot return geofencing even when the app is closed or running in the background.',
                [
                  { text: 'Not Now', style: 'cancel' },
                  {
                    text: 'Allow on Shift',
                    onPress: async () => {
                      try {
                        await Location.requestBackgroundPermissionsAsync();
                      } catch (e) {}
                    }
                  }
                ]
              );
            }
          } catch (e) {
            // ignore background permission warning in emulator/web
          }
        }

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 10
          },
          (loc) => {
            const coords = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy
            };
            const speedKmh = Math.max(0, Math.round((loc.coords.speed || 0) * 3.6));
            setCurrentLocation(coords);
            setCurrentSpeed(speedKmh);

            // Log breadcrumb to Firestore every 30 seconds if on active duty
            if (driverProfile?.id && activeDutySession?.id && activeDutySession.status === 'ACTIVE') {
              logGpsBreadcrumb({
                driverId: driverProfile.id,
                dutyId: activeDutySession.id,
                latitude: coords.latitude,
                longitude: coords.longitude,
                speed: speedKmh,
                isMock: loc.mocked || false,
                deviceId: Device.osBuildId || 'android_device'
              }).catch(err => console.warn('Breadcrumb log error:', err.message));
            }
          }
        );
      } catch (err) {
        console.warn('Location tracking init error:', err);
      }
    }

    startWorkTracking();

    return () => {
      if (locationSubscription) locationSubscription.remove();
      if (telemetryInterval) clearInterval(telemetryInterval);
    };
  }, [activeDutySession?.status, driverProfile?.id]);

  // 4. Calculate today's completed duty duration
  useEffect(() => {
    async function calculateTodayDuty() {
      if (!driverProfile?.id) return;
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const pastSnap = await getDocs(
          query(
            collection(db, 'dutySessions'),
            where('driverId', '==', driverProfile.id),
            where('status', '==', 'COMPLETED')
          )
        );
        let mins = 0;
        pastSnap.forEach(docSnap => {
          const d = docSnap.data();
          if (d.startTime && d.startTime.startsWith(todayStr)) {
            mins += (d.totalMinutes || 0);
          }
        });
        setTodayDutyMinutes(mins);
      } catch (err) {
        console.warn('Today duty calculation error:', err);
      }
    }

    calculateTodayDuty();
  }, [driverProfile?.id, activeDutySession?.status]);

  const logout = () => signOut(auth);

  return (
    <DriverContext.Provider
      value={{
        currentUser,
        driverProfile,
        assignedBike,
        activeDutySession,
        currentLocation,
        currentSpeed,
        systemSettings,
        todayDutyMinutes,
        loading,
        logout
      }}
    >
      {children}
    </DriverContext.Provider>
  );
}

export const useDriver = () => useContext(DriverContext);
