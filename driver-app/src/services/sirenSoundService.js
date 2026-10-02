/**
 * Siren Sound Service
 * Primary: Native expo-audio playback of local assets/siren.mp3
 * Secondary: Web Audio synthesizer fallback in MdmKioskOverlay
 */

let nativePlayer = null;

export async function playSirenSound() {
  try {
    const { createAudioPlayer, setAudioModeAsync } = require('expo-audio');
    if (setAudioModeAsync) {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'mixWithOthers'
      }).catch(() => {});
    }

    if (!nativePlayer && createAudioPlayer) {
      nativePlayer = createAudioPlayer(require('../../assets/siren.mp3'), {
        loop: true
      });
    }

    if (nativePlayer) {
      nativePlayer.loop = true;
      nativePlayer.volume = 1.0;
      nativePlayer.play();
      return true;
    }
  } catch (err) {
    console.warn('Native expo-audio siren playback notice (using Web Audio fallback):', err.message);
  }
  return false;
}

export async function stopSirenSound() {
  try {
    if (nativePlayer) {
      nativePlayer.pause();
      if (typeof nativePlayer.seekTo === 'function') {
        nativePlayer.seekTo(0);
      }
    }
  } catch (e) {
    console.warn('Error stopping native siren:', e);
  }
  return true;
}
