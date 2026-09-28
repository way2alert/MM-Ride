import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform
} from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../utils/colors';

const { width } = Dimensions.get('window');

/**
 * Firebase reCAPTCHA Verifier Modal for React Native / Expo
 * Renders Google reCAPTCHA inside an authorized web context to retrieve a verification token
 * for Firebase Phone Authentication (signInWithPhoneNumber).
 */
export default function FirebaseRecaptchaModal({
  visible,
  firebaseConfig,
  onVerify,
  onCancel,
  onError
}) {
  const webViewRef = useRef(null);
  const [webViewLoading, setWebViewLoading] = useState(true);

  const getHtml = () => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          background-color: #111726;
          color: #F8FAFC;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        #instruction {
          font-size: 13px;
          color: #94A3B8;
          margin-bottom: 16px;
          text-align: center;
          padding: 0 12px;
        }
        #recaptcha-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 304px;
          min-height: 78px;
        }
        .status-badge {
          font-size: 11px;
          color: #F59E0B;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 6px;
          padding: 4px 10px;
          margin-top: 14px;
        }
      </style>
      <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
      <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
    </head>
    <body>
      <div id="instruction">Tap below to verify you are human</div>
      <div id="recaptcha-wrapper">
        <div id="recaptcha-container"></div>
      </div>
      <div class="status-badge">Google Security Verification</div>

      <script>
        function post(data) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(data));
          }
        }

        try {
          var config = ${JSON.stringify(firebaseConfig || {})};
          if (!firebase.apps.length) {
            firebase.initializeApp(config);
          }

          var verifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
            size: 'normal',
            theme: 'dark',
            callback: function(token) {
              document.getElementById('instruction').innerText = 'Verification confirmed! Sending SMS...';
              post({ type: 'success', token: token });
            },
            'expired-callback': function() {
              document.getElementById('instruction').innerText = 'Verification expired. Please try again.';
              post({ type: 'expired' });
            },
            'error-callback': function(err) {
              document.getElementById('instruction').innerText = 'Error: ' + (err.message || err);
              post({ type: 'error', error: err.message || String(err) });
            }
          });

          verifier.render().then(function(widgetId) {
            post({ type: 'ready', widgetId: widgetId });
          }).catch(function(err) {
            document.getElementById('instruction').innerText = 'Failed to load challenge: ' + (err.message || err);
            post({ type: 'error', error: err.message || String(err) });
          });
        } catch (e) {
          post({ type: 'error', error: e.message || String(e) });
        }
      </script>
    </body>
    </html>
  `;

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'success' && data.token) {
        onVerify(data.token);
      } else if (data.type === 'ready') {
        setWebViewLoading(false);
      } else if (data.type === 'expired') {
        if (onError) onError('reCAPTCHA expired. Please try again.');
      } else if (data.type === 'error') {
        if (onError) onError(data.error || 'reCAPTCHA verification error');
      }
    } catch (e) {
      console.warn('Recaptcha message parse error:', e);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Security Verification</Text>
              <Text style={styles.subtitle}>Complete check to send official Firebase SMS</Text>
            </View>
            <TouchableOpacity
              onPress={onCancel}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* WebView Container */}
          <View style={styles.webWrapper}>
            {webViewLoading && (
              <View style={styles.loaderOverlay}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loaderText}>Connecting to Google Security...</Text>
              </View>
            )}
            <WebView
              ref={webViewRef}
              originWhitelist={['*']}
              source={{
                html: getHtml(),
                baseUrl: `https://${firebaseConfig?.authDomain || 'mm-ride-6899f.firebaseapp.com'}`
              }}
              onMessage={handleMessage}
              onLoadEnd={() => setWebViewLoading(false)}
              style={styles.webView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              scrollEnabled={true}
              mixedContentMode="always"
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  card: {
    width: Math.min(width - 32, 380),
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: 'bold'
  },
  webWrapper: {
    width: '100%',
    height: 310,
    backgroundColor: '#111726',
    position: 'relative'
  },
  webView: {
    flex: 1,
    backgroundColor: '#111726'
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111726',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10
  },
  loaderText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 10,
    fontWeight: '600'
  },
  footer: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center'
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20
  },
  cancelBtnText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700'
  }
});
