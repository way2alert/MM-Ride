import React, { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useDriver } from '../context/DriverContext';
import { colors } from '../utils/colors';

// Screens
import LoginScreen from '../screens/LoginScreen';
import RegistrationScreen from '../screens/RegistrationScreen';
import DocumentUploadScreen from '../screens/DocumentUploadScreen';
import VerificationStatusScreen from '../screens/VerificationStatusScreen';
import BikeHandoverScreen from '../screens/BikeHandoverScreen';
import HomeScreen from '../screens/HomeScreen';
import StartDutyScreen from '../screens/StartDutyScreen';
import ActiveDutyScreen from '../screens/ActiveDutyScreen';
import BreakScreen from '../screens/BreakScreen';
import EndDutyScreen from '../screens/EndDutyScreen';
import EarningsScreen from '../screens/EarningsScreen';
import SubmitDailyEarningsScreen from '../screens/SubmitDailyEarningsScreen';
import LeaveScreen from '../screens/LeaveScreen';
import IncidentReportScreen from '../screens/IncidentReportScreen';
import EmergencySOSScreen from '../screens/EmergencySOSScreen';
import ProfileScreen from '../screens/ProfileScreen';

export default function AppNavigator() {
  const { currentUser, driverProfile, activeDutySession, loading } = useDriver();
  const [currentScreen, setCurrentScreen] = useState('Home');
  const [navParams, setNavParams] = useState({});

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Not logged in -> Show Login
  if (!currentUser) {
    return <LoginScreen />;
  }

  // Registered but profile details not submitted -> Show Registration
  if (!driverProfile || driverProfile.accountStatus === 'REGISTERED') {
    return (
      <RegistrationScreen
        navigation={{
          navigate: (screen) => setCurrentScreen(screen)
        }}
      />
    );
  }

  // Profile submitted but documents pending -> Show Document Upload
  if (driverProfile.accountStatus === 'DOCUMENTS_SUBMITTED') {
    return (
      <DocumentUploadScreen
        navigation={{
          navigate: (screen) => setCurrentScreen(screen)
        }}
      />
    );
  }

  // Pending Verifications, Approved, or Bike Assigned -> Show Status & Collection Journey Screen
  if (
    driverProfile.accountStatus === 'DOCUMENT_VERIFICATION_PENDING' ||
    driverProfile.accountStatus === 'ADDRESS_VERIFICATION_PENDING' ||
    driverProfile.accountStatus === 'APPROVED' ||
    driverProfile.accountStatus === 'APPROVED_BIKE_NOT_ASSIGNED' ||
    driverProfile.accountStatus === 'BIKE_ASSIGNED' ||
    driverProfile.accountStatus === 'BIKE_HANDOVER_PENDING' ||
    driverProfile.accountStatus === 'SUSPENDED' ||
    driverProfile.accountStatus === 'REJECTED' ||
    driverProfile.accountStatus === 'ACCOUNT_CLOSED'
  ) {
    if (currentScreen === 'BikeHandover') {
      return (
        <BikeHandoverScreen
          navigation={{
            replace: (screen) => setCurrentScreen(screen),
            navigate: (screen) => setCurrentScreen(screen)
          }}
        />
      );
    }
    return (
      <VerificationStatusScreen
        navigation={{
          navigate: (screen) => setCurrentScreen(screen)
        }}
      />
    );
  }

  // Navigation Controller for ACTIVE_DRIVER state
  const navigation = {
    navigate: (screen, params = {}) => {
      setNavParams(params);
      setCurrentScreen(screen);
    },
    replace: (screen, params = {}) => {
      setNavParams(params);
      setCurrentScreen(screen);
    },
    goBack: () => {
      setCurrentScreen('Home');
    }
  };

  switch (currentScreen) {
    case 'StartDuty':
      return <StartDutyScreen navigation={navigation} />;
    case 'ActiveDuty':
      return <ActiveDutyScreen navigation={navigation} />;
    case 'Break':
      return <BreakScreen navigation={navigation} />;
    case 'EndDuty':
      return <EndDutyScreen navigation={navigation} />;
    case 'Earnings':
      return <EarningsScreen navigation={navigation} />;
    case 'SubmitDailyEarnings':
      return <SubmitDailyEarningsScreen navigation={navigation} />;
    case 'Leave':
      return <LeaveScreen navigation={navigation} />;
    case 'IncidentReport':
      return <IncidentReportScreen navigation={navigation} />;
    case 'EmergencySOS':
      return <EmergencySOSScreen navigation={navigation} />;
    case 'Profile':
      return <ProfileScreen navigation={navigation} />;
    case 'VerificationStatus':
      return <VerificationStatusScreen navigation={navigation} />;
    case 'DocumentUpload':
      return <DocumentUploadScreen navigation={navigation} />;
    case 'Home':
    default:
      return <HomeScreen navigation={navigation} />;
  }
}
