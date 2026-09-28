import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  Image 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useDriver } from '../context/DriverContext';
import { submitEmergencyIncident } from '../firebase/api';
import { colors } from '../utils/colors';
import BigButton from '../components/BigButton';

export default function IncidentReportScreen({ navigation }) {
  const { currentUser, driverProfile, assignedBike, currentLocation } = useDriver();

  const [type, setType] = useState('ACCIDENT'); // ACCIDENT, DAMAGE, BREAKDOWN, TRAFFIC_ISSUE
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [loading, setLoading] = useState(false);

  const handlePickPhoto = async () => {
    try {
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setPhotoUri(res.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Camera Error', e.message);
    }
  };

  const handleSubmit = async () => {
    if (!description || description.trim().length < 5) {
      Alert.alert('Description Required', 'Please provide a clear description of the incident or damage.');
      return;
    }

    setLoading(true);
    try {
      let photoBlob = null;
      if (photoUri) {
        const resp = await fetch(photoUri);
        photoBlob = await resp.blob();
      }

      await submitEmergencyIncident({
        driverId: currentUser.uid,
        bikeId: driverProfile.assignedBikeId || assignedBike?.id,
        type,
        description,
        gps: currentLocation ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude
        } : null,
        photoBlob
      });

      Alert.alert(
        'Incident Logged ✅',
        'Your report has been logged in the system. An operations manager and insurance assessment will follow standard legal and safety procedures.',
        [{ text: 'OK', onPress: () => navigation?.goBack && navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Report Incident / Damage</Text>
      <Text style={styles.subheading}>
        Report accidents, bike breakdowns, or traffic issues for legal & insurance recording
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Incident Category</Text>

        <View style={styles.typeGrid}>
          {[
            { id: 'ACCIDENT', label: '💥 Road Accident' },
            { id: 'DAMAGE', label: '🛠️ Bike Damage' },
            { id: 'BREAKDOWN', label: '⚙️ Mechanical Breakdown' },
            { id: 'TRAFFIC_ISSUE', label: '🚦 Traffic Issue / Police' }
          ].map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.typeBtn, type === item.id && styles.typeBtnActive]}
              onPress={() => setType(item.id)}
            >
              <Text style={[styles.typeText, type === item.id && styles.typeTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Detailed Incident Description *</Text>
        <TextInput
          style={[styles.input, { height: 90 }]}
          multiline
          placeholder="State what happened, exact location landmarks, third-party involvement..."
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>2. Photo Evidence</Text>

        {photoUri ? (
          <View style={{ alignItems: 'center' }}>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            <TouchableOpacity onPress={handlePickPhoto} style={{ padding: 8 }}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Retake Incident Photo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.uploadPlaceholder} onPress={handlePickPhoto}>
            <Text style={{ fontSize: 32, marginBottom: 6 }}>📸</Text>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
              Capture Damage / Accident Photo
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.legalNotice}>
        <Text style={styles.noticeText}>
          ⚖️ <Text style={{ fontWeight: 'bold' }}>Legal & Insurance Notice:</Text> MM Ride follows statutory insurance and police procedures. No automatic deduction is made without an authorised recorded assessment.
        </Text>
      </View>

      <BigButton
        title="Submit Incident Report"
        onPress={handleSubmit}
        loading={loading}
        variant="primary"
        style={{ marginTop: 10, marginBottom: 40 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: 20
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 4
  },
  subheading: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 14
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14
  },
  typeBtn: {
    width: '48%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center'
  },
  typeBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: colors.primary
  },
  typeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary
  },
  typeTextActive: {
    color: colors.primaryLight
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
    fontSize: 15
  },
  uploadPlaceholder: {
    height: 110,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderActive,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center'
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    resizeMode: 'cover',
    marginBottom: 8
  },
  legalNotice: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border
  },
  noticeText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16
  }
});
