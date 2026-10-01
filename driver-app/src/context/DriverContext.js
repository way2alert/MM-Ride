import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, onSnapshot, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Alert, Linking } from 'react-native';
import { auth, db } from '../firebase/config';
import { logGpsBreadcrumb, bindDriverDevice } from '../firebase/api';
import { startMdmDeviceTelemetry, stopMdmDeviceTelemetry, getHardwareDeviceId, getDeviceHardwareMetrics, updateMdmTelemetryLocation } from '../services/deviceMdmService';
import MdmKioskOverlay from '../components/MdmKioskOverlay';
import PrivacyNoticeModal from '../components/PrivacyNoticeModal';
import GlobalSecurityOverlay from '../components/GlobalSecurityOverlay';

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
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const lastDriverSyncRef = useRef(0);

  // MDM Dedicated Device & Kiosk State
  const [restrictionState, setRestrictionState] = useState(null);
  const [mdmPolicy, setMdmPolicy] = useState(null);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [appLauncherVisible, setAppLauncherVisible] = useState(false);

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

  // 1. Auth Listener & Dedicated Device MDM Heartbeat
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setProfileLoading(true);
        // Register hardware device ID and hardware metrics
        const hardwareId = await getHardwareDeviceId();
        const metrics = await getDeviceHardwareMetrics();
        await bindDriverDevice(user.uid, {
          deviceId: hardwareId,
          deviceName: `${Device.manufacturer || ''} ${Device.modelName || 'Fleet Phone'}`.trim(),
          model: `${Device.manufacturer || ''} ${Device.modelName || 'Android Device'}`.trim(),
          manufacturer: Device.manufacturer || 'Android',
          os: Device.osName || 'Android',
          osVersion: `${Device.osName || 'Android'} ${Device.osVersion || '14'}`,
          appVersion: Application.nativeApplicationVersion || '1.0.0-mdm',
          isDevice: Device.isDevice,
          batteryLevel: metrics.batteryLevel,
          isCharging: metrics.isCharging,
          batteryHealth: metrics.batteryHealth,
          networkType: metrics.networkType,
          assignedDriverPhone: user.phoneNumber || null
        });
      } else {
        stopMdmDeviceTelemetry();
        setDriverProfile(null);
        setAssignedBike(null);
        setActiveDutySession(null);
        setRestrictionState(null);
        setProfileLoading(false);
      }
      setAuthLoading(false);
    });

    return unsubAuth;
  }, []);

  // 2. Real-time Driver Profile Listener
  useEffect(() => {
    if (!currentUser) {
      setProfileLoading(false);
      return;
    }

    const unsubDriver = onSnapshot(doc(db, 'drivers', currentUser.uid), async (snap) => {
      setProfileLoading(false);
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

        // Request background permission with mandatory fleet disclosure (Compulsory for active duty)
        if (activeDutySession?.status === 'ACTIVE') {
          try {
            const bgStatus = await Location.getBackgroundPermissionsAsync();
            if (bgStatus.status !== 'granted') {
              Alert.alert(
                'Shift Location Tracking Required 📍',
                'MM Ride requires location access set to "Allow all the time" during your active shift so that safety monitoring and depot geofencing work even when you are using Ola/Uber or when the screen is locked.\n\n(Tracking automatically stops when you end your shift).',
                [
                  {
                    text: 'Allow on Shift (Compulsory)',
                    onPress: async () => {
                      try {
                        const { status: newStatus } = await Location.requestBackgroundPermissionsAsync();
                        if (newStatus !== 'granted') {
                          Alert.alert(
                            'Permission Required to Work',
                            'Background location is mandatory to operate company fleet vehicles. Please choose "Allow all the time" in app settings.',
                            [
                              { text: 'Open Settings', onPress: () => Linking.openSettings() }
                            ]
                          );
                        }
                      } catch (e) {}
                    }
                  }
                ],
                { cancelable: false }
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
            updateMdmTelemetryLocation(coords, speedKmh);

            // Real-time live GPS telemetry sync to driver document (throttled to every 4s)
            if (driverProfile?.id && coords?.latitude && coords?.longitude) {
              const now = Date.now();
              if (now - lastDriverSyncRef.current >= 4000) {
                lastDriverSyncRef.current = now;
                updateDoc(doc(db, 'drivers', driverProfile.id), {
                  lastKnownLocation: {
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    speed: speedKmh,
                    accuracy: coords.accuracy || null,
                    timestamp: new Date().toISOString()
                  },
                  lastActiveAt: new Date().toISOString()
                }).catch(() => {});
              }
            }

            // Log breadcrumb to Firestore every 30 seconds if on active duty
            if (driverProfile?.id && activeDutySession?.id && activeDutySession.status === 'ACTIVE') {
              logGpsBreadcrumb({
                driverId: driverProfile.id,
                dutyId: activeDutySession.id,
                latitude: coords.latitude,
                longitude: coords.longitude,
                speed: speedKmh,
                isMock: loc.mocked || false,
                deviceId: driverProfile?.boundDeviceId || Device.osBuildId || 'android_device'
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

  // 5. Dedicated Device MDM Heartbeat & Remote Lockdown Monitor
  useEffect(() => {
    if (!currentUser) return;

    let cleanupTelemetry = null;
    startMdmDeviceTelemetry({
      driverProfile: driverProfile || {
        id: currentUser.uid,
        fullName: 'New Driver Partner (Onboarding)',
        mobileNumber: currentUser.phoneNumber || null
      },
      activeDutySession,
      currentLocation,
      currentSpeed,
      onRemoteRestriction: (restriction) => {
        setRestrictionState(restriction);
      },
      onPolicyUpdate: (policy) => {
        setMdmPolicy(policy);
      }
    }).then(cleanup => {
      cleanupTelemetry = cleanup;
    });

    return () => {
      if (cleanupTelemetry) cleanupTelemetry();
    };
  }, [currentUser?.uid, driverProfile?.id, activeDutySession?.id]);

  const logout = () => {
    stopMdmDeviceTelemetry();
    return signOut(auth);
  };

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
        loading: authLoading || (Boolean(currentUser) && profileLoading),
        logout,
        // MDM & Privacy Additions
        mdmPolicy,
        restrictionState,
        openPrivacyNotice: () => setPrivacyModalVisible(true),
        openAppLauncher: () => setAppLauncherVisible(true)
      }}
    >
      <MdmKioskOverlay
        restrictionState={restrictionState}
        mdmPolicy={mdmPolicy}
        onExitKioskSuccess={() => setRestrictionState(null)}
        showAppLauncher={appLauncherVisible}
        setShowAppLauncher={setAppLauncherVisible}
      />
      <PrivacyNoticeModal
        visible={privacyModalVisible}
        onClose={() => setPrivacyModalVisible(false)}
      />
      <GlobalSecurityOverlay 
        driverProfile={driverProfile}
        activeDutySession={activeDutySession}
        currentLocation={currentLocation}
      />
      {children}
    </DriverContext.Provider>
  );
}

export const useDriver = () => useContext(DriverContext);
