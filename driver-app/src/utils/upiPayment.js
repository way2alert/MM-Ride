import { Linking, Alert } from 'react-native';

export const DEFAULT_COMPANY_UPI = {
  vpa: '7200723901@upi',
  name: 'MM Ride Fleet',
  accountNumber: 'MMRIDEFLEET'
};

/**
 * Builds standard NPCI UPI Intent URI
 */
export function buildUpiUri({
  vpa = DEFAULT_COMPANY_UPI.vpa,
  name = DEFAULT_COMPANY_UPI.name,
  amount = 0,
  note = 'MM Ride Shift Settlement',
  refId = ''
}) {
  const cleanVpa = (vpa || DEFAULT_COMPANY_UPI.vpa).trim();
  const cleanName = encodeURIComponent((name || DEFAULT_COMPANY_UPI.name).trim());
  const cleanAmount = Number(amount || 0).toFixed(2);
  const cleanNote = encodeURIComponent(note || 'Shift Settlement');
  const tr = refId ? `&tr=${encodeURIComponent(refId)}` : '';

  return `upi://pay?pa=${cleanVpa}&pn=${cleanName}&am=${cleanAmount}&cu=INR&tn=${cleanNote}${tr}`;
}

/**
 * Generates QR Code image URL via secure QR image server
 */
export function getUpiQrCodeUrl(upiUri, size = 260) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(upiUri)}`;
}

/**
 * Launches native UPI payment app on device (GPay, PhonePe, Paytm, etc.)
 */
export async function launchUpiPaymentApp(upiUri) {
  try {
    const canOpen = await Linking.canOpenURL(upiUri);
    if (canOpen) {
      await Linking.openURL(upiUri);
      return true;
    }
  } catch (e) {
    console.warn('Direct UPI URI failed, trying openURL:', e);
  }

  try {
    await Linking.openURL(upiUri);
    return true;
  } catch (err) {
    Alert.alert(
      'UPI App Not Found',
      'No UPI payment app (GPay, PhonePe, Paytm) detected on this phone. Please scan the QR code using another phone or transfer to: ' + DEFAULT_COMPANY_UPI.vpa
    );
    return false;
  }
}
