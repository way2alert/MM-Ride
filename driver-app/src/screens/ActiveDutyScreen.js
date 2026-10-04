import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  TextInput,
  Modal,
  Image,
  ActivityIndicator,
  Linking
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { collection, query, where, getDocs, updateDoc, doc, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDriver } from '../context/DriverContext';
import { colors } from '../utils/colors';
import { logGpsBreadcrumb, uploadVerificationSelfie, confirmIdentityChallenge, submitFuelFillEntry } from '../firebase/api';
import { processGigNotification } from '../services/gigRideWatcher';
import { useKeepAwake } from 'expo-keep-awake';
import Header from '../components/Header';
import BigButton from '../components/BigButton';
import QuickRideLoggerModal from '../components/QuickRideLoggerModal';
import FloatingShiftOverlayHUD from '../components/FloatingShiftOverlayHUD';
import { syncOfflineRides } from '../services/offlineQueueService';
import { bringAppToFront, showOverlayAlert, dismissOverlayAlert } from '../services/floatingBubbleService';

export default function ActiveDutyScreen({ navigation, route }) {
  useKeepAwake();
  const { 
    currentUser,
    driverProfile, 
    assignedBike, 
    activeDutySession, 
    currentLocation, 
    currentSpeed,
    systemSettings,
    todayDutyMinutes 
  } = useDriver();

  const driverId = currentUser?.uid || driverProfile?.id;

  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [idleAlertDoc, setIdleAlertDoc] = useState(null);
  const [idleReasonText, setIdleReasonText] = useState('');
  const [submittingReason, setSubmittingReason] = useState(false);
  const [isSimulatingMovement, setIsSimulatingMovement] = useState(false);
  const [simStep, setSimStep] = useState(0);

  // Anti-Theft & Remote Immobilizer State
  const [isImmobilized, setIsImmobilized] = useState(false);
  const [geofenceBreachLogged, setGeofenceBreachLogged] = useState(false);

  // Petrol Fill Entry State (Anti-Petrol Fraud)
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [fuelAmount, setFuelAmount] = useState('');
  const [fuelLitres, setFuelLitres] = useState('');
  const [fuelOdometer, setFuelOdometer] = useState(activeDutySession?.pickupOdometer ? String(activeDutySession.pickupOdometer) : '');
  const [dispenserPhoto, setDispenserPhoto] = useState(null);
  const [meterPhoto, setMeterPhoto] = useState(null);
  const [receiptPhoto, setReceiptPhoto] = useState(null);
  const [submittingFuel, setSubmittingFuel] = useState(false);

  // Platform Ride & Anti-Offline Cash Fraud State (Problem 4)
  const [showRideSimModal, setShowRideSimModal] = useState(false);
  const [activeRideEvent, setActiveRideEvent] = useState(null);
  const [rideDistKm, setRideDistKm] = useState(0);
  const [offlineCashAlertLogged, setOfflineCashAlertLogged] = useState(false);

  // In-Shift Live Face / Selfie Verification State
  const [identityPrompt, setIdentityPrompt] = useState(null);
  const [selfieUri, setSelfieUri] = useState(null);
  const [countdown, setCountdown] = useState(90);
  const [submittingSelfie, setSubmittingSelfie] = useState(false);

  // Problem 11: Sudden Deceleration & Possible Accident / Welfare State
  const [prevSpeed, setPrevSpeed] = useState(0);
  const [highSpeedTimestamp, setHighSpeedTimestamp] = useState(0);
  const [showWelfareModal, setShowWelfareModal] = useState(false);
  const [welfareCountdown, setWelfareCountdown] = useState(60);

  // Permanent Sticky Bottom Ride Logger State
  const [showQuickRideModal, setShowQuickRideModal] = useState(false);
  const [quickRidePlatform, setQuickRidePlatform] = useState('OLA');
  const [shiftRides, setShiftRides] = useState([]);

  const handleOpenQuickLogger = (selectedPlatform = 'OLA') => {
    setQuickRidePlatform(selectedPlatform);
    setShowQuickRideModal(true);
  };

  // Real-time listener for today's shift ride entries
  useEffect(() => {
    if (!driverId) return;
    try {
      const q = query(
        collection(db, 'shiftRideEntries'),
        where('driverId', '==', driverId)
      );
      const unsub = onSnapshot(q, (snapshot) => {
        const rides = [];
        const todayPrefix = new Date().toISOString().split('T')[0];
        snapshot.forEach((d) => {
          const data = d.data();
          if (
            (activeDutySession?.id && data.dutyId === activeDutySession.id) ||
            (data.timestamp && data.timestamp.startsWith(todayPrefix))
          ) {
            rides.push({ id: d.id, ...data });
          }
        });
        setShiftRides(rides);
      }, (err) => {
        console.warn('shiftRideEntries listener warning:', err?.message || err);
      });
      return () => unsub();
    } catch (e) {
      console.warn('Error setting up shiftRideEntries listener:', e);
    }
  }, [driverId, activeDutySession?.id]);

  // Periodic Auto-Sync for Offline Queued Rides
  useEffect(() => {
    if (!driverId) return;
    syncOfflineRides(driverId).catch(() => {});
    const syncInterval = setInterval(() => {
      syncOfflineRides(driverId).catch(() => {});
    }, 45000);
    return () => clearInterval(syncInterval);
  }, [driverId]);

  const totalRidesLogged = shiftRides.length;
  const totalGrossLogged = shiftRides.reduce((sum, r) => sum + (Number(r.fare) || 0), 0);
  const totalCashLogged = shiftRides.reduce((sum, r) => {
    if (r.cashAmount !== undefined && r.cashAmount !== null) return sum + (Number(r.cashAmount) || 0);
    return sum + (r.paymentMethod === 'CASH' ? (Number(r.fare) || 0) : 0);
  }, 0);
  const totalUpiLogged = shiftRides.reduce((sum, r) => {
    if (r.upiAmount !== undefined && r.upiAmount !== null) return sum + (Number(r.upiAmount) || 0);
    return sum + (r.paymentMethod !== 'CASH' ? (Number(r.fare) || 0) : 0);
  }, 0);
  const driverEstShare = Math.round(totalGrossLogged * 0.5);

  // Test Ride Movement Telemetry (Simulation mode ONLY - never overwrites real GPS)
  useEffect(() => {
    if (!driverProfile?.id || !activeDutySession?.id || !isSimulatingMovement) return;

    const baseLat = currentLocation?.latitude || 28.6115;
    const baseLng = currentLocation?.longitude || 77.0817;

    const timer = setInterval(async () => {
      setSimStep(prev => prev + 1);
      const offset = ((simStep + 1) % 50) * 0.0005;
      const lat = baseLat + offset;
      const lng = baseLng + (offset * 0.7);
      const speed = 28 + Math.floor(Math.abs(Math.sin(simStep)) * 8);

      try {
        await logGpsBreadcrumb({
          driverId: driverProfile.id,
          dutyId: activeDutySession.id,
          latitude: lat,
          longitude: lng,
          speed,
          isMock: true,
          deviceId: driverProfile?.boundDeviceId || 'android_telemetry_live'
        });
      } catch (err) {
        // silent
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [driverProfile?.id, activeDutySession?.id, isSimulatingMovement, simStep, currentLocation?.latitude, currentLocation?.longitude]);

  // Calculate duty elapsed time from server startTime
  useEffect(() => {
    if (!activeDutySession?.startTime) return;

    const interval = setInterval(() => {
      const startMs = new Date(activeDutySession.startTime).getTime();
      const diffMins = Math.floor((Date.now() - startMs) / (1000 * 60));
      setElapsedMinutes(diffMins);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeDutySession?.startTime]);

  // Check for active idle alert for this driver
  useEffect(() => {
    async function checkIdleAlerts() {
      if (!driverProfile?.id) return;
      try {
        const snap = await getDocs(
          query(
            collection(db, 'idleAlerts'),
            where('driverId', '==', driverProfile.id),
            where('status', '==', 'PENDING_DRIVER_REASON')
          )
        );
        if (!snap.empty) {
          setIdleAlertDoc({ id: snap.docs[0].id, ...snap.docs[0].data() });
        } else {
          setIdleAlertDoc(null);
        }
      } catch (err) {
        // silent
      }
    }

    const idleTimer = setInterval(checkIdleAlerts, 15000);
    checkIdleAlerts();

    return () => clearInterval(idleTimer);
  }, [driverProfile?.id]);

  // Bring MM Ride to front and show overlay alert when Idle Alert is active
  useEffect(() => {
    if (idleAlertDoc) {
      bringAppToFront();
      showOverlayAlert({
        title: 'IDLE ALERT (>15 MINS) ⚠️',
        message: 'வாகனம் நீண்ட நேரம் ஒரே இடத்தில் உள்ளது. காரணத்தை பதிவிடவும்.',
        alertType: 'IDLE',
        autoOpenApp: true
      });
    }
  }, [idleAlertDoc?.id]);

  // Listen for Live Identity Challenges, Policy, and Remote Engine Immobilization
  useEffect(() => {
    if (!driverProfile?.id) return;
    const unsub = onSnapshot(doc(db, 'drivers', driverProfile.id), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        
        // 1. Remote Immobilizer
        setIsImmobilized(!!d.engineImmobilized);

        // 2. Identity Challenge
        if (d.pendingVerification && d.pendingVerification.status === 'PENDING') {
          setIdentityPrompt(d.pendingVerification);
          setCountdown(d.pendingVerification.timeoutSeconds || 90);
        } else {
          setIdentityPrompt(null);
          setSelfieUri(null);
        }
      }
    });
    return () => unsub();
  }, [driverProfile?.id]);

  // Operational Geofence Perimeter Calculation (45 km radius from Central Hub)
  const baseHubLat = 28.6115;
  const baseHubLng = 77.0817;
  const curLat = currentLocation?.latitude || baseHubLat;
  const curLng = currentLocation?.longitude || baseHubLng;
  const distFromHubKm = Math.round(
    Math.sqrt(Math.pow((curLat - baseHubLat) * 111, 2) + Math.pow((curLng - baseHubLng) * 111, 2))
  );
  const isGeofenceWarning = distFromHubKm > 35 && distFromHubKm <= 45;
  const isGeofenceBreach = distFromHubKm > 45;

  // Auto-log Geofence Breach Incident to Firestore & Alert Driver
  useEffect(() => {
    if (isGeofenceBreach && !geofenceBreachLogged && driverProfile?.id) {
      setGeofenceBreachLogged(true);
      bringAppToFront();
      showOverlayAlert({
        title: 'GEOFENCE PERIMETER BREACH ⚠️',
        message: `Driver moved vehicle ${distFromHubKm} km outside authorized operations perimeter. Return to hub.`,
        alertType: 'GEOFENCE',
        autoOpenApp: true
      });
      addDoc(collection(db, 'securityAlerts'), {
        type: 'GEOFENCE_EXIT_BREACH',
        driverId: driverProfile.id,
        bikeId: driverProfile.assignedBikeId || assignedBike?.id || null,
        severity: 'CRITICAL',
        message: `Driver moved vehicle ${distFromHubKm} km outside authorized operations perimeter.`,
        coordinates: { latitude: curLat, longitude: curLng },
        timestamp: new Date().toISOString()
      }).catch(console.warn);

      updateDoc(doc(db, 'drivers', driverProfile.id), {
        geofenceBreach: true,
        distFromHubKm,
        lastGeofenceBreachAt: new Date().toISOString()
      }).catch(console.warn);
    } else if (!isGeofenceBreach && geofenceBreachLogged && driverProfile?.id) {
      setGeofenceBreachLogged(false);
      dismissOverlayAlert();
      updateDoc(doc(db, 'drivers', driverProfile.id), {
        geofenceBreach: false,
        distFromHubKm
      }).catch(console.warn);
    }
  }, [isGeofenceBreach, geofenceBreachLogged, driverProfile?.id, distFromHubKm, curLat, curLng]);

  // Sudden Deceleration Detector (e.g. >30 km/h drops to 0 km/h within 15s)
  useEffect(() => {
    if (currentSpeed > 30) {
      setPrevSpeed(currentSpeed);
      setHighSpeedTimestamp(Date.now());
    } else if (currentSpeed === 0 && prevSpeed > 30) {
      const timeSinceHigh = Date.now() - highSpeedTimestamp;
      if (timeSinceHigh < 20000 && !showWelfareModal) {
        setShowWelfareModal(true);
        setWelfareCountdown(60);
        bringAppToFront();
        showOverlayAlert({
          title: 'ACCIDENT WELFARE CHECK (60s) 🆘',
          message: 'Sudden deceleration detected! Are you safe?',
          alertType: 'WELFARE',
          autoOpenApp: true
        });
      }
    }
  }, [currentSpeed, prevSpeed, highSpeedTimestamp, showWelfareModal]);

  // Welfare countdown timer
  useEffect(() => {
    if (!showWelfareModal) return;
    const timer = setInterval(() => {
      setWelfareCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleWelfareTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [showWelfareModal]);

  const handleWelfareTimeout = async () => {
    setShowWelfareModal(false);
    if (!driverProfile?.id) return;
    try {
      await updateDoc(doc(db, 'drivers', driverProfile.id), {
        abnormalStopAlert: {
          active: true,
          initialSpeed: prevSpeed,
          stoppedAt: new Date().toISOString(),
          location: currentLocation,
          driverStatus: 'UNRESPONSIVE_AFTER_DECEL',
          durationStoppedMinutes: 1
        },
        previousRecordedSpeed: prevSpeed
      });
      await addDoc(collection(db, 'incidents'), {
        driverId: driverProfile.id,
        bikeId: driverProfile.assignedBikeId || assignedBike?.id || null,
        type: 'POSSIBLE_ACCIDENT_ABNORMAL_STOP',
        description: `Sudden deceleration from ${prevSpeed} km/h to 0 km/h. Driver did not acknowledge safety check within 60s.`,
        gps: currentLocation,
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Welfare timeout log error:', e);
    }
  };

  const handleWelfareResponse = async (status) => {
    setShowWelfareModal(false);
    dismissOverlayAlert();
    const recordedInitialSpeed = prevSpeed;
    setPrevSpeed(0);
    if (!driverProfile?.id) return;

    if (status === 'SAFE') {
      await updateDoc(doc(db, 'drivers', driverProfile.id), {
        'abnormalStopAlert.active': false,
        previousRecordedSpeed: 0
      }).catch(console.warn);
      Alert.alert('Glad you are safe! 👍', 'Shift tracking continuing normally.');
    } else if (status === 'BREAKDOWN') {
      await updateDoc(doc(db, 'drivers', driverProfile.id), {
        abnormalStopAlert: {
          active: true,
          initialSpeed: recordedInitialSpeed,
          stoppedAt: new Date().toISOString(),
          location: currentLocation,
          driverStatus: 'REPORTED_BREAKDOWN',
          durationStoppedMinutes: 1
        }
      }).catch(console.warn);
      await addDoc(collection(db, 'incidents'), {
        driverId: driverProfile.id,
        bikeId: driverProfile.assignedBikeId || assignedBike?.id || null,
        type: 'BREAKDOWN_REPORTED',
        description: 'Driver reported vehicle breakdown / mechanical issue after sudden halt.',
        gps: currentLocation,
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      }).catch(console.warn);
      Alert.alert('Breakdown Logged 🛠️', 'Support hub alerted. Contact depot if towing is needed.');
    } else if (status === 'ACCIDENT') {
      await updateDoc(doc(db, 'drivers', driverProfile.id), {
        abnormalStopAlert: {
          active: true,
          initialSpeed: recordedInitialSpeed,
          stoppedAt: new Date().toISOString(),
          location: currentLocation,
          driverStatus: 'REPORTED_ACCIDENT',
          durationStoppedMinutes: 1
        }
      }).catch(console.warn);
      await addDoc(collection(db, 'incidents'), {
        driverId: driverProfile.id,
        bikeId: driverProfile.assignedBikeId || assignedBike?.id || null,
        type: 'ACCIDENT_REPORTED',
        description: 'Driver confirmed accident / distress after sudden deceleration.',
        gps: currentLocation,
        status: 'CRITICAL',
        createdAt: new Date().toISOString()
      }).catch(console.warn);
      Alert.alert('EMERGENCY DISPATCHED 🚨', 'Operations control alerted. Medical & recovery teams notified.');
    }
  };

  // Countdown timer for identity challenge
  useEffect(() => {
    if (!identityPrompt) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleChallengeTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [identityPrompt]);

  const handleCaptureSelfie = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Denied', 'Front camera permission is required for identity verification.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: true,
        quality: 0.6
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setSelfieUri(res.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Camera Error', e.message);
    }
  };

  const handleSubmitSelfie = async () => {
    if (!selfieUri) {
      Alert.alert('Selfie Required', 'Please take your front-camera face selfie first.');
      return;
    }
    setSubmittingSelfie(true);
    try {
      const url = await uploadVerificationSelfie({
        driverId: driverProfile.id,
        dutyId: activeDutySession?.id,
        uri: selfieUri
      });
      await confirmIdentityChallenge({
        driverId: driverProfile.id,
        dutyId: activeDutySession?.id,
        photoUrl: url,
        gps: currentLocation
      });
      setIdentityPrompt(null);
      setSelfieUri(null);
      Alert.alert('Verified! ✅', 'Your face identity has been confirmed. You may continue your shift.');
    } catch (err) {
      Alert.alert('Upload Error', err.message);
    } finally {
      setSubmittingSelfie(false);
    }
  };

  const handleChallengeTimeout = async () => {
    try {
      if (driverProfile?.id) {
        await updateDoc(doc(db, 'drivers', driverProfile.id), {
          pendingVerification: null,
          accountStatus: 'SUSPENDED',
          suspensionReason: 'MISSED_LIVE_FACE_CHALLENGE'
        });
        await addDoc(collection(db, 'securityAlerts'), {
          type: 'DRIVER_IDENTITY_CHALLENGE_FAILED',
          driverId: driverProfile.id,
          dutyId: activeDutySession?.id || null,
          severity: 'CRITICAL',
          message: 'Driver failed to complete live selfie verification within time limit.',
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('Timeout action failed:', e);
    }
    Alert.alert(
      'Shift Locked ⚠️',
      'Face verification was not completed within the time limit. Your shift has been locked. Contact Depot Owner.'
    );
  };

  const handleSendIdleReason = async () => {
    if (!idleReasonText.trim()) {
      Alert.alert('Reason Required', 'Please enter your reason for remaining stationary.');
      return;
    }
    setSubmittingReason(true);
    try {
      if (idleAlertDoc?.id) {
        await updateDoc(doc(db, 'idleAlerts', idleAlertDoc.id), {
          driverReason: idleReasonText,
          status: 'REASON_SUBMITTED',
          reasonSubmittedAt: new Date().toISOString()
        });
      }
      setIdleAlertDoc(null);
      setIdleReasonText('');
      dismissOverlayAlert();
      Alert.alert('Reason Submitted', 'Your status explanation has been sent to Operations.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmittingReason(false);
    }
  };

  const handleCaptureFuelPhoto = async (type) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera Permission Required', 'Camera access is required to photograph fuel dispenser and odometer.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.6
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const uri = res.assets[0].uri;
        if (type === 'dispenser') setDispenserPhoto(uri);
        else if (type === 'meter') setMeterPhoto(uri);
        else if (type === 'receipt') setReceiptPhoto(uri);
      }
    } catch (e) {
      Alert.alert('Camera Error', e.message);
    }
  };

  const handleSubmitFuelFill = async () => {
    const amt = parseFloat(fuelAmount);
    const ltr = parseFloat(fuelLitres);
    const odo = parseInt(fuelOdometer, 10);

    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid fuel amount in ₹.');
      return;
    }
    if (isNaN(ltr) || ltr <= 0) {
      Alert.alert('Invalid Litres', 'Please enter valid litres of petrol filled.');
      return;
    }
    if (isNaN(odo) || odo <= 0) {
      Alert.alert('Invalid Odometer', 'Please enter the current odometer reading at the petrol pump.');
      return;
    }
    if (!meterPhoto) {
      Alert.alert('Odometer Photo Required', 'Please photograph the bike odometer / speedometer console.');
      return;
    }
    if (!receiptPhoto) {
      Alert.alert('Pump Bill Required', 'Please photograph the petrol pump cash bill / printed receipt.');
      return;
    }

    setSubmittingFuel(true);
    try {
      await submitFuelFillEntry({
        driverId: driverProfile?.id,
        bikeId: driverProfile?.assignedBikeId || assignedBike?.id,
        dutyId: activeDutySession?.id,
        amount: amt,
        litres: ltr,
        odometer: odo,
        dispenserPhotoUri: null,
        meterPhotoUri: meterPhoto,
        receiptPhotoUri: receiptPhoto,
        gps: currentLocation
      });

      setShowFuelModal(false);
      setFuelAmount('');
      setFuelLitres('');
      setMeterPhoto(null);
      setReceiptPhoto(null);
      Alert.alert(
        'Fuel Fill Logged ✅',
        'Your petrol fill has been recorded with bike odometer & pump bill proofs. It will be verified and approved in your shift settlement.'
      );
    } catch (err) {
      Alert.alert('Submission Error', err.message);
    } finally {
      setSubmittingFuel(false);
    }
  };

  // Trajectory Correlation: Detect Offline Cash Rides after Platform Cancellation (Problem 4)
  useEffect(() => {
    if (!activeRideEvent) return;

    let distTraveledKm = 0;

    if (isSimulatingMovement) {
      distTraveledKm = Math.round((simStep * 0.4) * 10) / 10;
    } else if (activeRideEvent.location?.latitude && currentLocation?.latitude) {
      const dLat = (currentLocation.latitude - activeRideEvent.location.latitude) * 111;
      const dLng = (currentLocation.longitude - activeRideEvent.location.longitude) * 111;
      distTraveledKm = Math.round(Math.sqrt(dLat * dLat + dLng * dLng) * 10) / 10;
    }

    if (distTraveledKm > 0) {
      setRideDistKm(distTraveledKm);
    }

    if (activeRideEvent.eventType === 'RIDE_CANCELLED' && distTraveledKm > 2.0 && !offlineCashAlertLogged && driverProfile?.id) {
      setOfflineCashAlertLogged(true);
      addDoc(collection(db, 'securityAlerts'), {
        type: 'SUSPECTED_OFFLINE_CASH_RIDE',
        driverId: driverProfile.id,
        bikeId: driverProfile.assignedBikeId || assignedBike?.id || null,
        severity: 'CRITICAL',
        message: `Vehicle moved ${distTraveledKm} km after ride cancellation on ${activeRideEvent.platform}. Undeclared cash trip suspected.`,
        timestamp: new Date().toISOString()
      }).catch(console.warn);

      if (activeRideEvent.id) {
        updateDoc(doc(db, 'platformRideEvents', activeRideEvent.id), {
          suspectedOfflineCashRide: true,
          distanceAfterEventKm: distTraveledKm
        }).catch(console.warn);
      }
    }
  }, [simStep, isSimulatingMovement, activeRideEvent, currentLocation, offlineCashAlertLogged, driverProfile?.id]);

  const handleSimulateGigEvent = async (platform, eventType, text) => {
    try {
      const eventId = await processGigNotification({
        packageName: platform === 'UBER' ? 'com.ubercab.driver' : platform === 'OLA' ? 'com.olacabs.partner' : 'com.rapido.rider',
        title: `${platform} Captain`,
        text,
        driverId: driverProfile?.id,
        dutyId: activeDutySession?.id,
        bikeId: driverProfile?.assignedBikeId || assignedBike?.id,
        currentLocation: currentLocation || { latitude: 28.6115, longitude: 77.0817, speed: 0 },
        isSimulated: true
      });

      setActiveRideEvent({
        id: eventId,
        platform,
        eventType,
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      setRideDistKm(0);
      setOfflineCashAlertLogged(false);
      setShowRideSimModal(false);

      Alert.alert(
        `${platform} Notification Captured 📲`,
        `Event: ${eventType}\nTelemetry logged to Firebase for multi-sensor GPS trajectory correlation.`
      );
    } catch (e) {
      Alert.alert('Simulation Error', e.message);
    }
  };

  const speedLimit = Number(systemSettings?.speedAlertThresholdKmh) || 60;
  const maxDutyHours = Number(systemSettings?.maxDutyHoursPerDay) || 12;
  const maxDutyMinutes = maxDutyHours * 60;
  
  // Total cumulative duty today (past shifts today + current active shift)
  const totalTodayMinutes = (todayDutyMinutes || 0) + elapsedMinutes;
  const remainingTodayMinutes = Math.max(0, maxDutyMinutes - totalTodayMinutes);
  const isNearLimit = totalTodayMinutes >= ((maxDutyHours - 1) * 60); // 1 hr warning before max
  const isLimitReached = totalTodayMinutes >= maxDutyMinutes;
  const isOverspeed = currentSpeed > speedLimit;

  return (
    <View style={styles.screen}>
      <Header
        title="ON DUTY – ACTIVE SHIFT"
        subtitle={`Bike: ${assignedBike?.registrationNumber || driverProfile?.assignedBikeRegistration || 'Vehicle'}`}
        onSosPress={() => navigation?.navigate && navigation.navigate('EmergencySOS')}
        onProfilePress={() => navigation?.navigate && navigation.navigate('Profile')}
      />

      <ScrollView contentContainerStyle={styles.container}>
        {/* Real-time Metropolitan Geofence Perimeter Alert Banner */}
        {isGeofenceBreach ? (
          <View style={{
            backgroundColor: '#7F1D1D',
            borderWidth: 2,
            borderColor: '#EF4444',
            borderRadius: 14,
            padding: 14,
            marginBottom: 16
          }}>
            <Text style={{ color: '#FEE2E2', fontWeight: '900', fontSize: 13, marginBottom: 4 }}>
              🚨 GEOFENCE PERIMETER BREACH ({distFromHubKm} KM FROM HUB)
            </Text>
            <Text style={{ color: '#FECACA', fontSize: 12, lineHeight: 18 }}>
              You have exited the 45 km authorized metropolitan zone. Shift violation recorded. Turn back toward the authorized operating zone immediately to avoid remote engine cut-off and police dispatch.
            </Text>
          </View>
        ) : isGeofenceWarning ? (
          <View style={{
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            borderWidth: 1,
            borderColor: '#F59E0B',
            borderRadius: 14,
            padding: 12,
            marginBottom: 16
          }}>
            <Text style={{ color: '#FCD34D', fontWeight: '800', fontSize: 12, marginBottom: 2 }}>
              ⚠️ OPERATIONAL BOUNDARY WARNING ({distFromHubKm} KM FROM HUB)
            </Text>
            <Text style={{ color: '#FDE68A', fontSize: 11, lineHeight: 16 }}>
              Approaching maximum 45 km operating limit. Do not exit city limits.
            </Text>
          </View>
        ) : null}

        {/* Speedometer & Live Telemetry Gauge */}
        <View style={[styles.speedCard, isOverspeed && styles.speedCardAlert]}>
          <Text style={styles.speedLabel}>LIVE GPS SPEED (வேகம்)</Text>
          <View style={styles.speedValueRow}>
            <Text style={[styles.speedValue, isOverspeed && styles.speedAlertText]}>
              {currentSpeed}
            </Text>
            <Text style={styles.speedUnit}>KM/H</Text>
          </View>
          <Text style={[styles.speedSub, isOverspeed ? styles.speedAlertText : styles.speedOkText]}>
            {isOverspeed
              ? `⚠️ SPEED LIMIT EXCEEDED (Max: ${speedLimit} km/h). Please slow down! (வேகத்தை குறைக்கவும்)`
              : `🟢 Safe Speed (${speedLimit} km/h Limit) • GPS Tracking Active`}
          </Text>
        </View>

        {/* 12-Hour Duty Duration HUD */}
        <View style={[styles.timerCard, (isLimitReached || isNearLimit) && styles.timerNearLimit]}>
          <Text style={styles.timerLabel}>CURRENT SHIFT DURATION (பணி நேரம்)</Text>
          <Text style={styles.timerValue}>
            {Math.floor(elapsedMinutes / 60)}h {elapsedMinutes % 60}m
          </Text>
          <Text style={styles.timerSub}>
            Daily Cumulative: {Math.floor(totalTodayMinutes / 60)}h {totalTodayMinutes % 60}m / Max {maxDutyHours} Hours
          </Text>
          {isLimitReached ? (
            <View style={[styles.limitWarningBadge, { backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.5)' }]}>
              <Text style={[styles.limitWarningText, { color: '#F87171' }]}>
                🛑 MAXIMUM DAILY DUTY OF {maxDutyHours} HOURS REACHED. Please return to depot and end shift.
              </Text>
            </View>
          ) : isNearLimit ? (
            <View style={styles.limitWarningBadge}>
              <Text style={styles.limitWarningText}>
                ⚠️ Approaching {maxDutyHours}-Hour Daily Limit ({remainingTodayMinutes}m remaining). Please return to depot soon.
              </Text>
            </View>
          ) : null}
        </View>

        {/* Shift Metrics */}
        <View style={styles.statsRow}>
          <View style={styles.miniCard}>
            <Text style={styles.miniLabel}>PICKUP ODOMETER</Text>
            <Text style={styles.miniVal}>{activeDutySession?.pickupOdometer || '—'} km</Text>
          </View>
          <View style={styles.miniCard}>
            <Text style={styles.miniLabel}>START TIME</Text>
            <Text style={styles.miniVal}>
              {activeDutySession?.startTime ? new Date(activeDutySession.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
            </Text>
          </View>
        </View>

        {/* Live Fleet Telemetry & Ride Movement Simulation */}
        <View style={styles.telemetryCard}>
          <View style={styles.telemetryHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View style={[styles.pulseDot, styles.pulseDotActive]} />
              <Text style={styles.telemetryTitle} numberOfLines={1}>
                LIVE GPS TRANSMITTING
              </Text>
            </View>
            <View style={{
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: 'rgba(16, 185, 129, 0.3)'
            }}>
              <Text style={{ color: '#34D399', fontSize: 11, fontWeight: '700' }}>
                🟢 Secured • 6s Ping
              </Text>
            </View>
          </View>

          {/* Active Gig Ride Telemetry Radar Banner */}
          {activeRideEvent ? (
            <View style={{
              backgroundColor: activeRideEvent.eventType === 'RIDE_CANCELLED' && rideDistKm > 2.0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.15)',
              borderWidth: 1,
              borderColor: activeRideEvent.eventType === 'RIDE_CANCELLED' && rideDistKm > 2.0 ? '#EF4444' : '#3B82F6',
              borderRadius: 8,
              padding: 8,
              marginTop: 8,
              marginBottom: 4
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{
                  color: activeRideEvent.eventType === 'RIDE_CANCELLED' && rideDistKm > 2.0 ? '#F87171' : '#93C5FD',
                  fontWeight: '800',
                  fontSize: 11
                }}>
                  {activeRideEvent.platform} • {activeRideEvent.eventType} ({activeRideEvent.timestamp})
                </Text>
                <Text style={{ color: '#F8FAFC', fontWeight: '700', fontSize: 11 }}>
                  Traveled: {rideDistKm} km
                </Text>
              </View>
              {activeRideEvent.eventType === 'RIDE_CANCELLED' && rideDistKm > 2.0 ? (
                <Text style={{ color: '#FECACA', fontSize: 10, marginTop: 4, lineHeight: 14 }}>
                  🚨 SUSPECTED OFFLINE CASH RIDE: Bike moved {rideDistKm} km after customer cancelled ride. Correlated with GPS & flagged for Admin Audit.
                </Text>
              ) : (
                <Text style={{ color: '#CBD5E1', fontSize: 10, marginTop: 2 }}>
                  Telemetry active: Multi-sensor GPS tracking correlated with ride notification.
                </Text>
              )}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '700' }}>
                🟢 NOTIFICATION LISTENER ACTIVE:
              </Text>
              <Text style={{ fontSize: 10, color: '#94A3B8' }}>
                Ola, Uber & Rapido pings filtered & monitored
              </Text>
            </View>
          )}

          <Text style={styles.telemetrySub}>
            Location & speed are broadcast to Admin Live Monitoring every 6 seconds.
          </Text>
        </View>

        {/* Live Shift Earnings & Ride Tracker Card */}
        <View style={styles.rideTrackerCard}>
          <View style={styles.rideTrackerHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 22 }}>⚡</Text>
              <View>
                <Text style={styles.rideTrackerTitle}>TODAY'S SHIFT EARNINGS</Text>
                <Text style={styles.rideTrackerSub}>இன்றைய பயண வருமானம்</Text>
              </View>
            </View>
          </View>

          <View style={styles.rideTrackerStatsRow}>
            <View style={styles.rideStatBox}>
              <Text style={styles.rideStatLabel}>RIDES</Text>
              <Text style={styles.rideStatVal}>{totalRidesLogged}</Text>
            </View>
            <View style={styles.rideStatBox}>
              <Text style={styles.rideStatLabel}>GROSS FARE</Text>
              <Text style={[styles.rideStatVal, { color: '#FCD34D' }]}>₹{totalGrossLogged}</Text>
            </View>
            <View style={styles.rideStatBox}>
              <Text style={styles.rideStatLabel}>YOUR 50% SHARE</Text>
              <Text style={[styles.rideStatVal, { color: '#34D399' }]}>₹{driverEstShare}</Text>
            </View>
          </View>

          <View style={styles.paymentSplitRow}>
            <View style={styles.paymentPillCash}>
              <Text style={styles.paymentPillCashText}>💵 Cash: ₹{totalCashLogged}</Text>
            </View>
            <View style={styles.paymentPillUpi}>
              <Text style={styles.paymentPillUpiText}>📲 UPI: ₹{totalUpiLogged}</Text>
            </View>
          </View>

          {totalRidesLogged > 0 && (
            <TouchableOpacity
              style={styles.reviewSummaryBtn}
              onPress={() => navigation?.navigate && navigation.navigate('SubmitDailyEarnings')}
              activeOpacity={0.8}
            >
              <Text style={styles.reviewSummaryBtnText}>📊 View Shift Breakdown & Trip List ➔</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Primary Controls */}
        <View style={styles.controlsSection}>
          <BigButton
            title="Log Petrol Fill ⛽ (Fuel Claim)"
            onPress={() => {
              if (!fuelOdometer && activeDutySession?.pickupOdometer) {
                setFuelOdometer(String(activeDutySession.pickupOdometer));
              }
              setShowFuelModal(true);
            }}
            variant="secondary"
            style={{ marginBottom: 12, backgroundColor: '#1E293B', borderColor: '#F59E0B', borderWidth: 1.5 }}
            textStyle={{ color: '#FCD34D' }}
          />

          <BigButton
            title="Take a Break ⏸️"
            onPress={() => navigation?.navigate && navigation.navigate('Break')}
            variant="secondary"
            style={{ marginBottom: 12 }}
          />

          <BigButton
            title="Return Bike / End Duty 🏁"
            onPress={() => navigation?.navigate && navigation.navigate('EndDuty')}
            variant="primary"
          />
        </View>
      </ScrollView>

      {/* 30-Minute Idle Alert Modal */}
      <Modal
        visible={!!idleAlertDoc}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.idleEmoji}>⚠️</Text>
            <Text style={styles.idleTitle}>Stationary Idle Alert</Text>
            <Text style={styles.idleTitleHindi}>(30 நிமிடங்களாக வாகனம் ஒரே இடத்தில் உள்ளது)</Text>
            <Text style={styles.idleMessage}>
              You have been inactive / stationary for over 30 minutes. Please enter your reason for Operations record.
            </Text>

            <TextInput
              style={styles.idleInput}
              placeholder="e.g. Waiting for ride, tyre puncture, customer delay..."
              placeholderTextColor={colors.textMuted}
              value={idleReasonText}
              onChangeText={setIdleReasonText}
            />

            <BigButton
              title="Submit Reason to Operations"
              onPress={handleSendIdleReason}
              loading={submittingReason}
              variant="primary"
              style={{ marginTop: 12, width: '100%' }}
            />
          </View>
        </View>
      </Modal>

      {/* Live In-Shift Face Verification Modal */}
      <Modal
        visible={!!identityPrompt}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { borderColor: colors.primary, borderWidth: 2 }]}>
            <Text style={styles.idleEmoji}>📸</Text>
            <Text style={[styles.idleTitle, { color: colors.primaryLight }]}>
              Live Face Verification Required
            </Text>
            <Text style={styles.idleTitleHindi}>
              (நேரடி முக சரிபார்ப்பு கட்டாயம்)
            </Text>
            <Text style={styles.idleMessage}>
              Depot security requires periodic face verification to ensure the registered driver is operating the vehicle.
            </Text>

            <View style={{
              backgroundColor: countdown <= 20 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.15)',
              padding: 8,
              borderRadius: 8,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: countdown <= 20 ? colors.danger : colors.warning
            }}>
              <Text style={{
                color: countdown <= 20 ? '#F87171' : colors.primaryLight,
                fontWeight: 'bold',
                textAlign: 'center',
                fontSize: 13
              }}>
                ⏳ Time Remaining: {countdown} seconds
              </Text>
            </View>

            {selfieUri ? (
              <View style={{ alignItems: 'center', marginBottom: 14 }}>
                <Image
                  source={{ uri: selfieUri }}
                  style={{ width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: colors.success }}
                />
                <TouchableOpacity
                  onPress={handleCaptureSelfie}
                  style={{ marginTop: 8 }}
                >
                  <Text style={{ color: colors.primaryLight, fontSize: 12, fontWeight: '700' }}>
                    🔄 Retake Photo
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <BigButton
                title="Open Front Camera 🤳"
                onPress={handleCaptureSelfie}
                variant="secondary"
                style={{ width: '100%', marginBottom: 8 }}
              />
            )}

            {selfieUri && (
              <BigButton
                title="Verify Face & Continue Shift ✅"
                onPress={handleSubmitSelfie}
                loading={submittingSelfie}
                variant="success"
                style={{ width: '100%' }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Full-Screen Vehicle Immobilizer Lockdown Modal */}
      <Modal visible={isImmobilized} transparent={false} animationType="fade">
        <View style={{
          flex: 1,
          backgroundColor: '#0F172A',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24
        }}>
          <View style={{
            width: 90,
            height: 90,
            borderRadius: 45,
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            borderWidth: 2,
            borderColor: '#EF4444',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 20
          }}>
            <Text style={{ fontSize: 44 }}>⚡</Text>
          </View>

          <Text style={{ color: '#EF4444', fontSize: 20, fontWeight: '900', textAlign: 'center', letterSpacing: 0.5 }}>
            VEHICLE ENGINE IMMOBILIZED
          </Text>
          <Text style={{ color: '#FCD34D', fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 8 }}>
            ரிமோட் இக்னிஷன் லாக் செய்யப்பட்டுள்ளது
          </Text>

          <View style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: 'rgba(239, 68, 68, 0.3)',
            padding: 16,
            marginVertical: 20,
            width: '100%'
          }}>
            <Text style={{ color: '#F8FAFC', fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 10 }}>
              இந்த பைக்கின் இன்ஜின் நிர்வாகத்தால் (MM Ride Operations) ரிமோட் மூலம் நிறுத்தப்பட்டுள்ளது.
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 12, lineHeight: 18, textAlign: 'center' }}>
              Vehicle ignition has been remotely cut off. Real-time GPS coordinates are actively streaming to Central Operations. Park safely on the roadside and contact Operations immediately.
            </Text>
          </View>

          <TouchableOpacity
            style={{
              backgroundColor: '#10B981',
              paddingVertical: 14,
              paddingHorizontal: 24,
              borderRadius: 12,
              width: '100%',
              alignItems: 'center',
              marginBottom: 12
            }}
            onPress={() => Linking.openURL('tel:18004190123')}
          >
            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 15 }}>
              📞 Call Operations Control Room
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Three-Way Verified Fuel Fill Modal */}
      <Modal
        visible={showFuelModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => !submittingFuel && setShowFuelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '90%', padding: 18, borderColor: '#F59E0B' }]}>
            <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 36, marginBottom: 4 }}>⛽</Text>
                <Text style={[styles.idleTitle, { color: '#FCD34D', textAlign: 'center' }]}>
                  Log Petrol Fill (Fuel Claim)
                </Text>
                <Text style={[styles.idleTitleHindi, { color: '#94A3B8' }]}>
                  பெட்ரோல் போட்ட பதிவு & நேரடி சான்று
                </Text>
              </View>

              {/* Proof Requirements Notice */}
              <View style={{
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderWidth: 1,
                borderColor: '#F59E0B',
                borderRadius: 10,
                padding: 10,
                marginBottom: 16
              }}>
                <Text style={{ color: '#FCD34D', fontSize: 11, fontWeight: '800', marginBottom: 2 }}>
                  🔒 2 MANDATORY FUEL PROOFS REQUIRED
                </Text>
                <Text style={{ color: '#E2E8F0', fontSize: 11, lineHeight: 16 }}>
                  1. Bike Odometer & Speedometer Photo{'\n'}
                  2. Petrol pump cash bill / printed receipt
                </Text>
              </View>

              <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                PETROL AMOUNT (₹) *
              </Text>
              <TextInput
                style={[styles.idleInput, { minHeight: 44, marginBottom: 12 }]}
                placeholder="e.g. 500"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={fuelAmount}
                onChangeText={setFuelAmount}
              />

              <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                LITRES FILLED (L) *
              </Text>
              <TextInput
                style={[styles.idleInput, { minHeight: 44, marginBottom: 12 }]}
                placeholder="e.g. 4.85"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={fuelLitres}
                onChangeText={setFuelLitres}
              />

              <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                BIKE ODOMETER AT PUMP (KM) *
              </Text>
              <TextInput
                style={[styles.idleInput, { minHeight: 44, marginBottom: 16 }]}
                placeholder="e.g. 42350"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={fuelOdometer}
                onChangeText={setFuelOdometer}
              />

              {/* Photo Proof 1: Bike Odometer */}
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: '#F8FAFC', fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
                  1. Bike Odometer & Speedometer Photo * (Mandatory)
                </Text>
                {meterPhoto ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Image source={{ uri: meterPhoto }} style={{ width: 70, height: 70, borderRadius: 8 }} />
                    <TouchableOpacity onPress={() => handleCaptureFuelPhoto('meter')}>
                      <Text style={{ color: '#60A5FA', fontSize: 12, fontWeight: '700' }}>🔄 Retake Photo</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#334155',
                      padding: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#475569',
                      borderStyle: 'dashed'
                    }}
                    onPress={() => handleCaptureFuelPhoto('meter')}
                  >
                    <Text style={{ color: '#E2E8F0', fontSize: 12, fontWeight: '700' }}>
                      📸 Capture Bike Speedometer / Odometer
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Photo Proof 2: Pump Cash Bill */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ color: '#F8FAFC', fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
                  2. Pump Cash Bill / Printed Receipt * (Mandatory)
                </Text>
                {receiptPhoto ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Image source={{ uri: receiptPhoto }} style={{ width: 70, height: 70, borderRadius: 8 }} />
                    <TouchableOpacity onPress={() => handleCaptureFuelPhoto('receipt')}>
                      <Text style={{ color: '#60A5FA', fontSize: 12, fontWeight: '700' }}>🔄 Retake Photo</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#334155',
                      padding: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#475569',
                      borderStyle: 'dashed'
                    }}
                    onPress={() => handleCaptureFuelPhoto('receipt')}
                  >
                    <Text style={{ color: '#E2E8F0', fontSize: 12, fontWeight: '700' }}>
                      🧾 Capture Pump Cash Bill (Receipt)
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Action Buttons */}
              <BigButton
                title="Submit Fuel Claim for Verification ✅"
                onPress={handleSubmitFuelFill}
                loading={submittingFuel}
                variant="primary"
                style={{ width: '100%', marginBottom: 10 }}
              />

              <TouchableOpacity
                onPress={() => setShowFuelModal(false)}
                disabled={submittingFuel}
                style={{ padding: 10, alignItems: 'center', width: '100%' }}
              >
                <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Sudden Deceleration / Safety Welfare Modal (Problem 11) */}
      <Modal
        visible={showWelfareModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { borderColor: '#F59E0B', borderWidth: 2 }]}>
            <Text style={{ fontSize: 36, marginBottom: 6 }}>⚠️</Text>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#FCD34D', textAlign: 'center' }}>
              SAFETY WELFARE CHECK
            </Text>
            <Text style={{ fontSize: 13, color: '#F59E0B', fontWeight: '700', marginBottom: 4 }}>
              நீங்கள் நலமாக உள்ளீர்களா?
            </Text>
            <Text style={{ fontSize: 12, color: '#CBD5E1', textAlign: 'center', lineHeight: 16, marginBottom: 12 }}>
              Sudden deceleration detected ({prevSpeed} km/h ➔ 0 km/h). Please confirm your safety within {welfareCountdown}s:
            </Text>

            {/* Countdown Badge */}
            <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 16 }}>
              <Text style={{ color: '#FCD34D', fontWeight: '800', fontSize: 12 }}>
                ⏱️ Auto-escalating in {welfareCountdown} seconds
              </Text>
            </View>

            {/* Option 1: Safe */}
            <TouchableOpacity
              style={{
                backgroundColor: '#065F46',
                borderColor: '#10B981',
                borderWidth: 1.5,
                borderRadius: 12,
                padding: 12,
                width: '100%',
                alignItems: 'center',
                marginBottom: 10
              }}
              onPress={() => handleWelfareResponse('SAFE')}
            >
              <Text style={{ color: '#A7F3D0', fontWeight: '800', fontSize: 14 }}>
                🟢 I AM SAFE (நான் நலமாக உள்ளேன்)
              </Text>
              <Text style={{ color: '#D1FAE5', fontSize: 10, marginTop: 2 }}>
                Normal stop, traffic signal, or brief tea break
              </Text>
            </TouchableOpacity>

            {/* Option 2: Breakdown */}
            <TouchableOpacity
              style={{
                backgroundColor: '#78350F',
                borderColor: '#F59E0B',
                borderWidth: 1.5,
                borderRadius: 12,
                padding: 12,
                width: '100%',
                alignItems: 'center',
                marginBottom: 10
              }}
              onPress={() => handleWelfareResponse('BREAKDOWN')}
            >
              <Text style={{ color: '#FDE68A', fontWeight: '800', fontSize: 13 }}>
                🟡 VEHICLE BREAKDOWN / PUNCTURE
              </Text>
              <Text style={{ color: '#FEF3C7', fontSize: 10, marginTop: 2 }}>
                Tyre puncture, chain slip, or mechanical fault (Need towing)
              </Text>
            </TouchableOpacity>

            {/* Option 3: Accident */}
            <TouchableOpacity
              style={{
                backgroundColor: '#7F1D1D',
                borderColor: '#EF4444',
                borderWidth: 1.5,
                borderRadius: 12,
                padding: 12,
                width: '100%',
                alignItems: 'center'
              }}
              onPress={() => handleWelfareResponse('ACCIDENT')}
            >
              <Text style={{ color: '#FECACA', fontWeight: '900', fontSize: 13 }}>
                🚨 ACCIDENT / NEED EMERGENCY HELP
              </Text>
              <Text style={{ color: '#FEE2E2', fontSize: 10, marginTop: 2 }}>
                Road collision or injury. Dispatch control room & 112
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Permanent Sticky Bottom Console: Ola, Uber, Rapido 1-Tap Loggers & Launchers */}
      <FloatingShiftOverlayHUD
        bikeRegistration={assignedBike?.registrationNumber || driverProfile?.assignedBikeRegistration || 'TN 01 AB 1234'}
        totalRides={totalRidesLogged}
        totalGross={totalGrossLogged}
        driverShare={driverEstShare}
        elapsedMinutes={elapsedMinutes}
        onOpenQuickLogger={handleOpenQuickLogger}
      />

      {/* Quick Ride Logger Modal */}
      <QuickRideLoggerModal
        visible={showQuickRideModal}
        onClose={() => setShowQuickRideModal(false)}
        driverId={driverId}
        dutyId={activeDutySession?.id}
        currentLocation={currentLocation}
        initialPlatform={quickRidePlatform}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  container: {
    padding: 18,
    paddingBottom: 165
  },
  speedCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginBottom: 16
  },
  speedCardAlert: {
    borderColor: colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.1)'
  },
  speedLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 4
  },
  speedValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6
  },
  speedValue: {
    fontSize: 56,
    fontWeight: '900',
    color: colors.white
  },
  speedAlertText: {
    color: colors.danger
  },
  speedOkText: {
    color: colors.success
  },
  speedUnit: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary
  },
  speedSub: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6
  },
  timerCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginBottom: 16
  },
  timerNearLimit: {
    borderColor: colors.warning,
    backgroundColor: 'rgba(245, 158, 11, 0.1)'
  },
  timerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 4
  },
  timerValue: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.primaryLight
  },
  timerSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4
  },
  limitWarningBadge: {
    backgroundColor: colors.warningBg,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.warning
  },
  limitWarningText: {
    fontSize: 12,
    color: colors.primaryLight,
    fontWeight: '700',
    textAlign: 'center'
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20
  },
  miniCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4
  },
  miniVal: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white
  },
  controlsSection: {
    marginTop: 6
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalBox: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.warning
  },
  idleEmoji: {
    fontSize: 44,
    marginBottom: 8
  },
  idleTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white
  },
  idleTitleHindi: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 8
  },
  idleMessage: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16
  },
  idleInput: {
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    color: colors.white,
    fontSize: 14,
    minHeight: 50
  },
  telemetryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16
  },
  telemetryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  pulseDotActive: {
    backgroundColor: '#10B981'
  },
  pulseDotIdle: {
    backgroundColor: '#F59E0B'
  },
  telemetryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.3
  },
  simButton: {
    backgroundColor: '#334155',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569'
  },
  simButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#EF4444'
  },
  simButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryLight
  },
  simButtonTextActive: {
    color: '#F87171'
  },
  telemetrySub: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16
  },
  rideTrackerCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    marginBottom: 16,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4
  },
  rideTrackerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  rideTrackerTitle: {
    color: '#FCD34D',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5
  },
  rideTrackerSub: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 1
  },
  logRideMiniBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  logRideMiniBtnText: {
    color: '#0F172A',
    fontWeight: '900',
    fontSize: 12
  },
  rideTrackerStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10
  },
  rideStatBox: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  rideStatLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2
  },
  rideStatVal: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '900'
  },
  paymentSplitRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4
  },
  paymentPillCash: {
    flex: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center'
  },
  paymentPillCashText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '800'
  },
  paymentPillUpi: {
    flex: 1,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center'
  },
  paymentPillUpiText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '800'
  },
  logRideBigBtn: {
    flex: 1,
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  logRideBigBtnText: {
    color: '#0F172A',
    fontWeight: '900',
    fontSize: 13
  },
  reviewSummaryBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10
  },
  reviewSummaryBtnText: {
    color: '#93C5FD',
    fontWeight: '800',
    fontSize: 12
  },
  floatingActionBar: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    zIndex: 99
  },
  floatingActionBtn: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: '#34D399'
  },
  floatingActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  floatingBoltBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center'
  },
  floatingActionTitle: {
    color: '#0F172A',
    fontWeight: '900',
    fontSize: 14
  },
  floatingActionSub: {
    color: '#064E3B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1
  },
  floatingActionArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center'
  }
});
