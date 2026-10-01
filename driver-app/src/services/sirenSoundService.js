/**
 * Siren Sound Service
 * Audio playback is handled directly via WebView HTML5 Audio & Web Audio Synthesizer in MdmKioskOverlay
 * to ensure 100% native compatibility across Expo Go, custom dev builds, and standalone APKs.
 */

export async function playSirenSound() {
  // Handled via Web Audio / WebView in MdmKioskOverlay
  return true;
}

export async function stopSirenSound() {
  // Handled via Web Audio / WebView in MdmKioskOverlay
  return true;
}
