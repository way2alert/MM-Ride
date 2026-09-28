import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  ScrollView, 
  Switch, 
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useDriver } from '../context/DriverContext';
import { submitHandoverInspection, uploadHandoverPhoto } from '../firebase/api';
import { colors } from '../utils/colors';
import BigButton from '../components/BigButton';

const PHOTO_ANGLES = [
  { key: 'front', title: 'Front View', hint: 'Headlamp, front wheel & tyre' },
  { key: 'rear', title: 'Rear View', hint: 'Tail lamp, plate & rear tyre' },
  { key: 'left', title: 'Left Side', hint: 'Engine case, body & chain' },
  { key: 'right', title: 'Right Side', hint: 'Silencer, brake lever & mirror' },
  { key: 'meter', title: 'Meter Console', hint: 'Odometer & fuel gauge close-up' }
];

export default function BikeHandoverScreen({ navigation }) {
  const { currentUser, driverProfile, assignedBike, currentLocation } = useDriver();

  // Meter & Level
  const [odometer, setOdometer] = useState(assignedBike?.currentOdometer ? String(assignedBike.currentOdometer) : '');
  const [fuelCharge, setFuelCharge] = useState(assignedBike?.currentFuelCharge ? String(assignedBike.currentFuelCharge) : '100');

  // 360° Photos (local URIs)
  const [photos, setPhotos] = useState({
    front: null,
    rear: null,
    left: null,
    right: null,
    meter: null
  });

  // Vehicle Identity & Documents Verification
  const [chassisVerified, setChassisVerified] = useState(false);
  const [engineVerified, setEngineVerified] = useState(false);
  const [rcCopyReceived, setRcCopyReceived] = useState(false);
  const [insuranceVerified, setInsuranceVerified] = useState(false);
  const [pucVerified, setPucVerified] = useState(false);

  // Mechanical & Tyres
  const [tyreFront, setTyreFront] = useState('GOOD'); // GOOD, MODERATE, WORN
  const [tyreRear, setTyreRear] = useState('GOOD');
  const [lightsWorking, setLightsWorking] = useState(true);
  const [brakesWorking, setBrakesWorking] = useState(true);
  const [existingDamage, setExistingDamage] = useState('');
  const [conditionNotes, setConditionNotes] = useState('');

  // Custody & Hardware Tracker
  const [keysCount, setKeysCount] = useState('1'); // 1 or 2
  const [helmetsCount, setHelmetsCount] = useState('1'); // 1 or 2
  const [trackerActive, setTrackerActive] = useState(true);

  // Legal Custody Declaration
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  // Progress
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  // Handle capture of 360° photo
  const handleCapturePhoto = async (angleKey) => {
    try {
      Alert.alert(
        'Upload Photo',
        `Select source for ${angleKey.toUpperCase()} angle photo:`,
        [
          {
            text: 'Camera 📸',
            onPress: async () => {
              const perm = await ImagePicker.requestCameraPermissionsAsync();
              if (!perm.granted) {
                Alert.alert('Permission Denied', 'Camera access is required for vehicle inspection.');
                return;
              }
              const res = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                quality: 0.7
              });
              if (!res.canceled && res.assets && res.assets.length > 0) {
                setPhotos(prev => ({ ...prev, [angleKey]: res.assets[0].uri }));
              }
            }
          },
          {
            text: 'Gallery 🖼️',
            onPress: async () => {
              const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.7
              });
              if (!res.canceled && res.assets && res.assets.length > 0) {
                setPhotos(prev => ({ ...prev, [angleKey]: res.assets[0].uri }));
              }
            }
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } catch (e) {
      Alert.alert('Photo Error', e.message);
    }
  };

  const handleSubmitHandover = async () => {
    // 1. Mandatory Document & Identity Checks
    if (!chassisVerified || !engineVerified || !rcCopyReceived || !insuranceVerified) {
      Alert.alert(
        'Document Checklist Incomplete',
        'Please verify and confirm Chassis Number, Engine Number, RC Copy, and Insurance validity.'
      );
      return;
    }

    // 2. Meter Check
    if (!odometer || Number(odometer) <= 0) {
      Alert.alert('Odometer Required', 'Please enter the current odometer reading shown on the meter.');
      return;
    }

    // 3. Declaration Check
    if (!declarationAccepted) {
      Alert.alert(
        'Custody Declaration Required',
        'Please read and accept the MM Ride Custody & Anti-Fraud Legal Declaration before accepting custody.'
      );
      return;
    }

    setLoading(true);
    setUploadStatus('Uploading inspection photos to secure storage...');

    try {
      const bikeId = driverProfile?.assignedBikeId || assignedBike?.id;
      const uploadedPhotoUrls = {};

      // Upload each photo that was taken
      for (const angle of ['front', 'rear', 'left', 'right', 'meter']) {
        if (photos[angle]) {
          setUploadStatus(`Uploading ${angle.toUpperCase()} photo...`);
          const url = await uploadHandoverPhoto({
            driverId: currentUser.uid,
            bikeId,
            angle,
            uri: photos[angle]
          });
          uploadedPhotoUrls[angle] = url;
        }
      }

      setUploadStatus('Registering custody & activating driver profile...');

      await submitHandoverInspection({
        driverId: currentUser.uid,
        driverName: driverProfile?.fullName || 'MM Ride Driver',
        driverPhone: driverProfile?.mobileNumber || '',
        bikeId,
        bikeRegistration: assignedBike?.registrationNumber || driverProfile?.assignedBikeRegistration || 'N/A',
        assignmentId: driverProfile?.currentAssignmentId || null,
        
        // Meter & Fuel
        odometer: Number(odometer),
        fuelCharge: Number(fuelCharge),
        
        // Photos
        photos360: uploadedPhotoUrls,
        hasPhotoCount: Object.keys(uploadedPhotoUrls).length,
        
        // Document & Identity Verification
        chassisVerified,
        engineVerified,
        rcCopyReceived,
        originalRcRetainedByOwner: true,
        insuranceVerified,
        pucVerified,
        
        // Mechanical & Tyres
        tyreCondition: {
          front: tyreFront,
          rear: tyreRear
        },
        lightsWorking,
        brakesWorking,
        existingDamage: existingDamage || 'NONE',
        conditionNotes: conditionNotes || 'NORMAL',
        
        // Inventory & Hardware
        keysCount: Number(keysCount),
        helmetsCount: Number(helmetsCount),
        trackerActive,
        
        // Legal & Anti-Fraud
        declarationAccepted: true,
        antiFraudPolicyAgreed: true,
        subLeasingForbiddenAcknowledged: true,
        personalUseProhibitedAcknowledged: true,
        partsSwappingForbiddenAcknowledged: true,
        
        gps: currentLocation ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude
        } : null
      });

      Alert.alert(
        'Bike Custody Confirmed! 🎉',
        `Vehicle ${assignedBike?.registrationNumber || ''} custody has been successfully recorded.\n\nYou are now an ACTIVE DRIVER. You can start shifts from authorized depot locations.`,
        [{ text: 'Go to Shift Console', onPress: () => navigation?.replace && navigation.replace('Home') }]
      );
    } catch (err) {
      Alert.alert('Handover Registration Error', err.message);
    } finally {
      setLoading(false);
      setUploadStatus('');
    }
  };

  const capturedCount = Object.values(photos).filter(Boolean).length;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <Text style={styles.heading}>Bike Custody & Handover Inspection</Text>
      <Text style={styles.subheading}>
        360° vehicle condition recording & anti-fraud custody sign-off
      </Text>

      {/* Vehicle Info Badge */}
      <View style={styles.bikeInfoCard}>
        <View style={styles.badgeRow}>
          <Text style={styles.bikeReg}>
            🏍️ {assignedBike?.registrationNumber || driverProfile?.assignedBikeRegistration || 'Vehicle Assigned'}
          </Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>HANDOVER PENDING</Text>
          </View>
        </View>
        <Text style={styles.bikeMeta}>
          {assignedBike ? `${assignedBike.make || ''} ${assignedBike.model || ''} (${assignedBike.fuelType || 'Petrol'})` : 'Assigned Two-Wheeler'}
        </Text>
        <Text style={styles.depotMeta}>
          Authorized Depot: {assignedBike?.hubName || 'MM Ride Depot Hub'}
        </Text>
      </View>

      {/* Anti-Fraud Core Notice */}
      <View style={styles.noticeBox}>
        <Text style={styles.noticeTitle}>🛡️ MM RIDE ASSET PROTECTION POLICY</Text>
        <Text style={styles.noticeText}>
          1. Original RC stays securely with Fleet Owner. You are handed an attested copy.
        </Text>
        <Text style={styles.noticeText}>
          2. Bike is for authorized MM Ride shifts ONLY. Sub-leasing, friend use, and parts swapping are strictly forbidden.
        </Text>
        <Text style={styles.noticeText}>
          3. Daily earnings (Ola/Uber/Rapido + cash) are physically audited by owner at depot return before 50/50 payout.
        </Text>
      </View>

      {/* SECTION 1: Meter & Fuel Readings */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Current Meter & Fuel Level</Text>

        <Text style={styles.label}>Odometer Reading (km) *</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          placeholder="e.g. 12450"
          placeholderTextColor={colors.textMuted}
          value={odometer}
          onChangeText={setOdometer}
        />

        <Text style={styles.label}>Fuel Level / Battery Charge (%) *</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          placeholder="e.g. 90"
          placeholderTextColor={colors.textMuted}
          value={fuelCharge}
          onChangeText={setFuelCharge}
        />
      </View>

      {/* SECTION 2: 360° Photographic Baseline */}
      <View style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.cardTitle}>2. 360° Inspection Photos</Text>
          <Text style={styles.photoCountText}>{capturedCount}/5 Captured</Text>
        </View>
        <Text style={styles.cardDesc}>
          Take clear baseline photos before accepting custody. These are used to automatically compare vehicle condition when returning.
        </Text>

        <View style={styles.photoGrid}>
          {PHOTO_ANGLES.map(angle => {
            const hasPhoto = !!photos[angle.key];
            return (
              <TouchableOpacity
                key={angle.key}
                style={[styles.photoTile, hasPhoto && styles.photoTileDone]}
                onPress={() => handleCapturePhoto(angle.key)}
                activeOpacity={0.8}
              >
                {hasPhoto ? (
                  <View style={styles.photoThumbContainer}>
                    <Image source={{ uri: photos[angle.key] }} style={styles.photoThumb} />
                    <View style={styles.photoDoneBadge}>
                      <Text style={styles.photoDoneCheck}>✓</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoCameraIcon}>📷</Text>
                    <Text style={styles.photoTileTitle}>{angle.title}</Text>
                    <Text style={styles.photoTileHint}>{angle.hint}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* SECTION 3: Identity & Document Verification */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>3. Vehicle Identity & Documents Check</Text>

        <View style={styles.checkRow}>
          <Switch
            value={chassisVerified}
            onValueChange={setChassisVerified}
            trackColor={{ true: colors.success, false: colors.border }}
          />
          <View style={styles.checkCol}>
            <Text style={styles.checkTitle}>Chassis Number Verified</Text>
            <Text style={styles.checkDesc}>Frame chassis number physically matches vehicle RC copy.</Text>
          </View>
        </View>

        <View style={styles.checkRow}>
          <Switch
            value={engineVerified}
            onValueChange={setEngineVerified}
            trackColor={{ true: colors.success, false: colors.border }}
          />
          <View style={styles.checkCol}>
            <Text style={styles.checkTitle}>Engine Number Verified</Text>
            <Text style={styles.checkDesc}>Engine stamp physically matches RC copy.</Text>
          </View>
        </View>

        <View style={styles.checkRow}>
          <Switch
            value={rcCopyReceived}
            onValueChange={setRcCopyReceived}
            trackColor={{ true: colors.success, false: colors.border }}
          />
          <View style={styles.checkCol}>
            <Text style={styles.checkTitle}>Attested RC Copy Received</Text>
            <Text style={styles.checkDesc}>Original RC Smart Card stays with Owner safe; valid attested copy received.</Text>
          </View>
        </View>

        <View style={styles.checkRow}>
          <Switch
            value={insuranceVerified}
            onValueChange={setInsuranceVerified}
            trackColor={{ true: colors.success, false: colors.border }}
          />
          <View style={styles.checkCol}>
            <Text style={styles.checkTitle}>Commercial Insurance Valid</Text>
            <Text style={styles.checkDesc}>Valid insurance policy document verified in vehicle kit.</Text>
          </View>
        </View>

        <View style={styles.checkRow}>
          <Switch
            value={pucVerified}
            onValueChange={setPucVerified}
            trackColor={{ true: colors.success, false: colors.border }}
          />
          <View style={styles.checkCol}>
            <Text style={styles.checkTitle}>PUC Certificate Present</Text>
            <Text style={styles.checkDesc}>Pollution Under Control certificate is within validity date.</Text>
          </View>
        </View>
      </View>

      {/* SECTION 4: Mechanical & Parts Inspection */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>4. Mechanical & Tyres Inspection</Text>

        <Text style={styles.label}>Front Tyre Tread Condition</Text>
        <View style={styles.selectorRow}>
          {['GOOD', 'MODERATE', 'WORN'].map(status => (
            <TouchableOpacity
              key={status}
              style={[styles.selectorBtn, tyreFront === status && styles.selectorBtnActive]}
              onPress={() => setTyreFront(status)}
            >
              <Text style={[styles.selectorBtnText, tyreFront === status && styles.selectorBtnTextActive]}>
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Rear Tyre Tread Condition</Text>
        <View style={styles.selectorRow}>
          {['GOOD', 'MODERATE', 'WORN'].map(status => (
            <TouchableOpacity
              key={status}
              style={[styles.selectorBtn, tyreRear === status && styles.selectorBtnActive]}
              onPress={() => setTyreRear(status)}
            >
              <Text style={[styles.selectorBtnText, tyreRear === status && styles.selectorBtnTextActive]}>
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.checkRow}>
          <Switch
            value={lightsWorking}
            onValueChange={setLightsWorking}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
          <View style={styles.checkCol}>
            <Text style={styles.checkTitle}>Headlight & Indicators Functional</Text>
          </View>
        </View>

        <View style={styles.checkRow}>
          <Switch
            value={brakesWorking}
            onValueChange={setBrakesWorking}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
          <View style={styles.checkCol}>
            <Text style={styles.checkTitle}>Front & Rear Brakes and Horn Functional</Text>
          </View>
        </View>

        <Text style={styles.label}>Existing Scratches, Dents or Paint Marks</Text>
        <TextInput
          style={[styles.input, { height: 60 }]}
          multiline
          placeholder="Record any existing body scratches, dented mudguards, or cracked indicators..."
          placeholderTextColor={colors.textMuted}
          value={existingDamage}
          onChangeText={setExistingDamage}
        />
      </View>

      {/* SECTION 5: Accessories, Keys & Hardware Tracker */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>5. Custody Counts & GPS Tracker</Text>

        <Text style={styles.label}>Ignition Keys Handed Over Count</Text>
        <View style={styles.selectorRow}>
          {['1', '2'].map(count => (
            <TouchableOpacity
              key={count}
              style={[styles.selectorBtn, keysCount === count && styles.selectorBtnActive]}
              onPress={() => setKeysCount(count)}
            >
              <Text style={[styles.selectorBtnText, keysCount === count && styles.selectorBtnTextActive]}>
                🔑 {count} {count === '1' ? 'Original Key' : 'Keys'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Commercial Helmet Handed Over Count</Text>
        <View style={styles.selectorRow}>
          {['1', '2'].map(count => (
            <TouchableOpacity
              key={count}
              style={[styles.selectorBtn, helmetsCount === count && styles.selectorBtnActive]}
              onPress={() => setHelmetsCount(count)}
            >
              <Text style={[styles.selectorBtnText, helmetsCount === count && styles.selectorBtnTextActive]}>
                🪖 {count} {count === '1' ? 'Helmet' : 'Helmets'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.checkRow}>
          <Switch
            value={trackerActive}
            onValueChange={setTrackerActive}
            trackColor={{ true: colors.success, false: colors.border }}
          />
          <View style={styles.checkCol}>
            <Text style={styles.checkTitle}>GPS Hardware Tracker Active</Text>
            <Text style={styles.checkDesc}>Device green LED active and live heartbeat confirmed by depot manager.</Text>
          </View>
        </View>
      </View>

      {/* SECTION 6: Legal Custody Declaration */}
      <View style={[styles.card, styles.declarationCard]}>
        <Text style={styles.declarationHeading}>⚖️ DRIVER LEGAL CUSTODY DECLARATION</Text>
        <Text style={styles.declarationText}>
          "I hereby declare that I have physically inspected vehicle {assignedBike?.registrationNumber || 'assigned'} and received custody in the condition recorded above.
        </Text>
        <Text style={styles.declarationText}>
          I expressly agree and confirm that:
        </Text>
        <Text style={styles.declarationBullet}>
          • The original vehicle RC belongs to the Fleet Owner; I hold no ownership or pledge rights.
        </Text>
        <Text style={styles.declarationBullet}>
          • Vehicle is for authorized MM Ride duty shifts only. Personal rides, sub-leasing to friends/relatives, and unauthorized commercial rides are strictly prohibited.
        </Text>
        <Text style={styles.declarationBullet}>
          • Swapping tyres, battery, or parts, or tampering with odometer/GPS tracker constitutes Criminal Breach of Trust (IPC Sec 406/420).
        </Text>
        <Text style={styles.declarationBullet}>
          • All platform ride earnings (including cash rides) will be declared daily for physical mobile app verification by owner prior to 50/50 net settlement.
        </Text>
        <Text style={styles.declarationBullet}>
          • Vehicle will be returned to the authorized depot at the end of every shift."
        </Text>

        <View style={styles.declCheckRow}>
          <Switch
            value={declarationAccepted}
            onValueChange={setDeclarationAccepted}
            trackColor={{ true: colors.success, false: colors.border }}
          />
          <Text style={styles.declCheckText}>
            I have read, understood, and accept full legal custody under these conditions.
          </Text>
        </View>
      </View>

      {/* Uploading progress indicator */}
      {loading && (
        <View style={styles.progressCard}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.progressText}>{uploadStatus}</Text>
        </View>
      )}

      {/* Submit Button */}
      <BigButton
        title="Confirm Custody & Activate Driver (Bike Receive Karein) 🏍️"
        onPress={handleSubmitHandover}
        loading={loading}
        variant="success"
        style={{ marginTop: 10, marginBottom: 40 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: 18
  },
  heading: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 4
  },
  subheading: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16
  },
  bikeInfoCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderActive,
    marginBottom: 14
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  bikeReg: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.primaryLight
  },
  statusPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)'
  },
  statusPillText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800'
  },
  bikeMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 2
  },
  depotMeta: {
    fontSize: 11,
    color: colors.textMuted
  },
  noticeBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16
  },
  noticeTitle: {
    color: '#F87171',
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 6
  },
  noticeText: {
    color: '#FECACA',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 4
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  photoCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 8
  },
  cardDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 12
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 8
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.white,
    fontSize: 14
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4
  },
  photoTile: {
    width: '48%',
    height: 120,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8
  },
  photoTileDone: {
    borderStyle: 'solid',
    borderColor: colors.success
  },
  photoThumbContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    position: 'relative'
  },
  photoThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 8
  },
  photoDoneBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.success,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  photoDoneCheck: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold'
  },
  photoPlaceholder: {
    alignItems: 'center'
  },
  photoCameraIcon: {
    fontSize: 22,
    marginBottom: 4
  },
  photoTileTitle: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center'
  },
  photoTileHint: {
    color: colors.textMuted,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 2
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)'
  },
  checkCol: {
    flex: 1
  },
  checkTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2
  },
  checkDesc: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10
  },
  selectorBtn: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center'
  },
  selectorBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: colors.primary
  },
  selectorBtnText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600'
  },
  selectorBtnTextActive: {
    color: colors.primaryLight,
    fontWeight: '700'
  },
  declarationCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  declarationHeading: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8
  },
  declarationText: {
    color: '#D1FAE5',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 6
  },
  declarationBullet: {
    color: '#A7F3D0',
    fontSize: 10,
    lineHeight: 15,
    marginBottom: 4,
    paddingLeft: 4
  },
  declCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(16, 185, 129, 0.2)'
  },
  declCheckText: {
    flex: 1,
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16
  },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceElevated,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderActive
  },
  progressText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '600'
  }
});
