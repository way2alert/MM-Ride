import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Whitelisted Indian Gig Platform Packages for Telemetry
 * Privacy Guarantee: Non-gig notifications (WhatsApp, Calls, Banking, SMS) are strictly dropped.
 */
export const GIG_PLATFORM_PACKAGES = {
  'com.olacabs.partner': { name: 'OLA', title: 'Ola Driver' },
  'com.ubercab.driver': { name: 'UBER', title: 'Uber Driver' },
  'com.rapido.rider': { name: 'RAPIDO', title: 'Rapido Captain' },
  'com.porter.rider': { name: 'PORTER', title: 'Porter Partner' },
  'com.shadowfax.rider': { name: 'SHADOWFAX', title: 'Shadowfax Rider' },
  'com.zomato.deliverypartner': { name: 'ZOMATO', title: 'Zomato Delivery' },
  'com.swiggy.deliverypartner': { name: 'SWIGGY', title: 'Swiggy Delivery' }
};

/**
 * Classifies notification text into high-level event types
 */
export function classifyGigNotification(title = '', text = '') {
  const combined = `${title} ${text}`.toLowerCase();

  if (
    combined.includes('cancel') || 
    combined.includes('cancelled') || 
    combined.includes('canceled') || 
    combined.includes('rider cancelled') || 
    combined.includes('customer cancelled')
  ) {
    return 'RIDE_CANCELLED';
  }

  if (
    combined.includes('accept') || 
    combined.includes('accepted') || 
    combined.includes('arrived') || 
    combined.includes('start trip') || 
    combined.includes('on the way')
  ) {
    return 'RIDE_ACCEPTED';
  }

  if (
    combined.includes('request') || 
    combined.includes('new ride') || 
    combined.includes('booking') || 
    combined.includes('trip available') || 
    combined.includes('pick up') || 
    combined.includes('drop')
  ) {
    return 'RIDE_REQUEST';
  }

  if (
    combined.includes('completed') || 
    combined.includes('trip ended') || 
    combined.includes('cash to collect') || 
    combined.includes('fare')
  ) {
    return 'RIDE_COMPLETED';
  }

  return 'GENERAL_GIG_PING';
}

/**
 * Process an incoming gig notification and log to Firestore
 */
export async function processGigNotification({
  packageName,
  title = '',
  text = '',
  driverId,
  dutyId,
  bikeId,
  currentLocation,
  isSimulated = false
}) {
  const platformConfig = GIG_PLATFORM_PACKAGES[packageName];
  if (!platformConfig && !isSimulated) {
    // 100% Privacy Protection: Discard non-gig applications immediately
    return null;
  }

  const platform = platformConfig?.name || 'GENERIC_GIG';
  const eventType = classifyGigNotification(title, text);
  const nowIso = new Date().toISOString();

  const eventPayload = {
    driverId: driverId || 'unknown',
    dutyId: dutyId || null,
    bikeId: bikeId || null,
    platform,
    packageName: packageName || 'com.ubercab.driver',
    title,
    textSnippet: text.substring(0, 150),
    eventType,
    timestamp: nowIso,
    location: currentLocation ? {
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      speed: currentLocation.speed || 0
    } : null,
    isSimulated: !!isSimulated,
    distanceAfterEventKm: 0,
    suspectedOfflineCashRide: false,
    createdAt: serverTimestamp()
  };

  try {
    const docRef = await addDoc(collection(db, 'platformRideEvents'), eventPayload);

    // Update driver profile with last detected ride state for live monitoring
    if (driverId) {
      await updateDoc(doc(db, 'drivers', driverId), {
        lastPlatformRideEvent: {
          eventId: docRef.id,
          platform,
          eventType,
          timestamp: nowIso,
          location: eventPayload.location
        }
      });
    }

    return docRef.id;
  } catch (err) {
    console.warn('Error recording gig notification telemetry:', err);
    return null;
  }
}
