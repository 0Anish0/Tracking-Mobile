/**
 * Logistics Location Tracker - Mobile App
 * Features: Background tracking, Device ID, Offline sync
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  PermissionsAndroid,
  Platform,
  Animated,
  StatusBar,
  Dimensions,
  ScrollView,
  TextInput,
  BackHandler,
  AppState,
  AppStateStatus,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import io from 'socket.io-client';

const SOCKET_URL = 'http://192.168.48.202:3001'; // Replace with your server IP
const LOCATION_INTERVAL = 10000; // 10 seconds
const STORAGE_KEY = 'offline_locations';
const DRIVER_KEY = 'driver_info';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  speed?: number;
  heading?: number;
}

interface DriverInfo {
  deviceId: string;
  driverName: string;
}

function App(): React.JSX.Element {
  const [socket, setSocket] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [locationHistory, setLocationHistory] = useState<LocationData[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  const [driverName, setDriverName] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState('');
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  
  // Refs for background tracking
  const trackingInterval = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<any>(null);
  const offlineLocations = useRef<LocationData[]>([]);
  
  // Animations
  const fadeAnim = useState(new Animated.Value(0))[0];
  const pulseAnim = useState(new Animated.Value(1))[0];

  useEffect(() => {
    initializeApp();
    setupAppStateHandling();
    
    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();

    return () => {
      cleanup();
    };
  }, []);

  const initializeApp = async () => {
    await loadDriverInfo();
    await loadOfflineLocations();
    await requestLocationPermission();
    initializeSocket();
  };

  const setupAppStateHandling = () => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log('App state changed:', nextAppState);
      setAppState(nextAppState);
      
      // Continue tracking even when app goes to background
      if (nextAppState === 'background' && isTracking) {
        console.log('App went to background, continuing location tracking...');
        // Location tracking will continue via the interval
      } else if (nextAppState === 'active' && isTracking) {
        console.log('App became active, ensuring location tracking is running...');
        // Ensure tracking is still running
        if (!trackingInterval.current) {
          startForegroundTracking();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isTracking) {
        Alert.alert(
          'Location Tracking Active',
          'Location tracking is running. The app will continue tracking in the background.',
          [
            { text: 'Continue Tracking', onPress: () => {} },
            { text: 'Stop Tracking', onPress: () => stopTracking() }
          ]
        );
        return true; // Prevent default back behavior
      }
      return false;
    });

    return () => {
      subscription?.remove();
      backHandler.remove();
    };
  };

  const generateDeviceId = async (): Promise<string> => {
    try {
      const uniqueId = await DeviceInfo.getUniqueId();
      const deviceName = await DeviceInfo.getDeviceName();
      return `${uniqueId}-${deviceName}`.replace(/[^a-zA-Z0-9-]/g, '');
    } catch (error) {
      // Fallback to timestamp-based ID
      return `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
  };

  const loadDriverInfo = async () => {
    try {
      const stored = await AsyncStorage.getItem(DRIVER_KEY);
      if (stored) {
        const info = JSON.parse(stored);
        setDriverInfo(info);
        setDriverName(info.driverName);
        setIsRegistered(true);
      }
    } catch (error) {
      console.error('Error loading driver info:', error);
    }
  };

  const saveDriverInfo = async (info: DriverInfo) => {
    try {
      await AsyncStorage.setItem(DRIVER_KEY, JSON.stringify(info));
      setDriverInfo(info);
      setIsRegistered(true);
    } catch (error) {
      console.error('Error saving driver info:', error);
    }
  };

  const loadOfflineLocations = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const locations = JSON.parse(stored);
        offlineLocations.current = locations;
        setOfflineCount(locations.length);
      }
    } catch (error) {
      console.error('Error loading offline locations:', error);
    }
  };

  const saveOfflineLocation = async (location: LocationData) => {
    try {
      offlineLocations.current.push(location);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(offlineLocations.current));
      setOfflineCount(offlineLocations.current.length);
    } catch (error) {
      console.error('Error saving offline location:', error);
    }
  };

  const clearOfflineLocations = async () => {
    try {
      offlineLocations.current = [];
      await AsyncStorage.removeItem(STORAGE_KEY);
      setOfflineCount(0);
    } catch (error) {
      console.error('Error clearing offline locations:', error);
    }
  };

  const initializeSocket = () => {
    const newSocket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
      setConnectionStatus('Connected');
      syncOfflineLocations();
      
      // Register driver if info is available
      if (driverInfo) {
        newSocket.emit('registerDriver', driverInfo);
      }
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
      setConnectionStatus('Disconnected');
    });

    newSocket.on('connect_error', (error: any) => {
      console.log('Connection error:', error);
      setConnected(false);
      setConnectionStatus('Connection Error');
    });

    newSocket.on('reconnect_attempt', (attemptNumber: number) => {
      setConnectionStatus(`Reconnecting... (${attemptNumber})`);
    });

    newSocket.on('syncComplete', (data: any) => {
      setSyncStatus(`Synced ${data.count} locations`);
      clearOfflineLocations();
      setTimeout(() => setSyncStatus(''), 3000);
    });

    newSocket.on('syncError', (message: string) => {
      setSyncStatus(`Sync failed: ${message}`);
      setTimeout(() => setSyncStatus(''), 5000);
    });

    newSocket.on('error', (message: string) => {
      Alert.alert('Error', message);
    });

    setSocket(newSocket);
    socketRef.current = newSocket;
    newSocket.connect();
  };

  const syncOfflineLocations = () => {
    if (offlineLocations.current.length > 0 && connected) {
      console.log(`Syncing ${offlineLocations.current.length} offline locations`);
      socketRef.current?.emit('syncLocations', offlineLocations.current);
    }
  };

  const registerDriver = async () => {
    if (!driverName.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    try {
      const deviceId = await generateDeviceId();
      const info: DriverInfo = { deviceId, driverName: driverName.trim() };
      
      await saveDriverInfo(info);
      
      if (connected) {
        socket?.emit('registerDriver', info);
      }
      
      Alert.alert('Success', 'Driver registered successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to register driver');
    }
  };

  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);

        const allGranted = Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          Alert.alert(
            'Permissions Required',
            'This app needs location permissions to track your truck. Please enable location permissions in settings.',
            [{ text: 'OK' }]
          );
        }

        return allGranted;
      } catch (err) {
        console.warn('Permission error:', err);
        return false;
      }
    }
    return true;
  };

  const getCurrentLocation = (): Promise<LocationData> => {
    return new Promise((resolve, reject) => {
      // First try with network location (faster)
      Geolocation.getCurrentPosition(
        (position) => {
          const locationData: LocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed || 0,
            heading: position.coords.heading || 0,
            timestamp: new Date().toISOString(),
          };
          resolve(locationData);
        },
        (error) => {
          console.log('Network location failed, trying GPS...', error);
          // Fallback to GPS with longer timeout
          Geolocation.getCurrentPosition(
            (position) => {
              const locationData: LocationData = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                speed: position.coords.speed || 0,
                heading: position.coords.heading || 0,
                timestamp: new Date().toISOString(),
              };
              resolve(locationData);
            },
            (gpsError) => {
              console.error('GPS location also failed:', gpsError);
              reject(gpsError);
            },
            {
              enableHighAccuracy: true,
              timeout: 30000, // 30 seconds
              maximumAge: 10000, // 10 seconds
            }
          );
        },
        {
          enableHighAccuracy: false, // Use network first
          timeout: 10000, // 10 seconds
          maximumAge: 60000, // 1 minute
        }
      );
    });
  };

  const sendLocation = async (locationData: LocationData) => {
    setLocation(locationData);
    setLastUpdate(new Date());
    
    // Add to history
    setLocationHistory(prev => [locationData, ...prev.slice(0, 9)]);
    
    if (connected && socket) {
      socket.emit('sendLocation', locationData);
      console.log('Location sent to server');
    } else {
      // Store offline
      await saveOfflineLocation(locationData);
      console.log('Location saved offline');
    }
  };

  const startTracking = async () => {
    if (!isRegistered) {
      Alert.alert('Registration Required', 'Please register as a driver first');
      return;
    }

    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      Alert.alert('Permission Required', 'Location permission is required for tracking');
      return;
    }

    setIsTracking(true);
    startForegroundTracking();
    
    Alert.alert(
      'Tracking Started',
      'Location tracking is now active. Your location will be sent every 10 seconds, even when the app is in the background.',
      [{ text: 'OK' }]
    );
  };

  const stopTracking = () => {
    setIsTracking(false);
    stopForegroundTracking();
    
    Alert.alert(
      'Tracking Stopped',
      'Location tracking has been stopped.',
      [{ text: 'OK' }]
    );
  };

  const startForegroundTracking = () => {
    if (trackingInterval.current) {
      clearInterval(trackingInterval.current);
    }

    // Initial location
    getCurrentLocation()
      .then(sendLocation)
      .catch(console.error);

    // Set up interval - this will continue even in background
    trackingInterval.current = setInterval(async () => {
      try {
        const locationData = await getCurrentLocation();
        await sendLocation(locationData);
      } catch (error) {
        console.error('Error getting location:', error);
      }
    }, LOCATION_INTERVAL);

    console.log('Location tracking started with 10-second interval');
  };

  const stopForegroundTracking = () => {
    if (trackingInterval.current) {
      clearInterval(trackingInterval.current);
      trackingInterval.current = null;
      console.log('Location tracking stopped');
    }
  };

  const cleanup = () => {
    stopTracking();
    socket?.disconnect();
  };

  // Pulse animation
  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, []);

  const getStatusColor = () => {
    if (isTracking) return '#4CAF50';
    if (connected) return '#2196F3';
    return '#FF5722';
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (!isRegistered) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>🚛</Text>
            <Text style={styles.title}>Logistics Tracker</Text>
            <Text style={styles.subtitle}>Driver Registration</Text>
          </View>

          <View style={styles.registrationForm}>
            <Text style={styles.label}>Enter Your Name:</Text>
            <TextInput
              style={styles.input}
              value={driverName}
              onChangeText={setDriverName}
              placeholder="Driver Name"
              placeholderTextColor="#666"
            />
            
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#4CAF50' }]}
              onPress={registerDriver}
            >
              <Text style={styles.buttonText}>Register Driver</Text>
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                • A unique device ID will be generated
              </Text>
              <Text style={styles.infoText}>
                • Your location will be tracked every 10 seconds
              </Text>
              <Text style={styles.infoText}>
                • Works offline and syncs when connected
              </Text>
            </View>
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        
        <View style={styles.header}>
          <Text style={styles.logoText}>🚛</Text>
          <View>
            <Text style={styles.title}>Logistics Tracker</Text>
            <Text style={styles.driverName}>Driver: {driverInfo?.driverName}</Text>
            <Text style={styles.deviceId}>ID: {driverInfo?.deviceId.slice(-8)}</Text>
          </View>
        </View>

        <View style={styles.statusContainer}>
          <Animated.View 
            style={[
              styles.statusIndicator, 
              { 
                backgroundColor: getStatusColor(),
                transform: [{ scale: pulseAnim }]
              }
            ]} 
          />
          <View>
            <Text style={styles.statusText}>
              {isTracking ? 'Tracking Active' : connectionStatus}
            </Text>
            <Text style={styles.appStateText}>
              App: {appState} {isTracking && appState === 'background' ? '(Tracking in BG)' : ''}
            </Text>
            {syncStatus ? (
              <Text style={styles.syncText}>{syncStatus}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.controlsContainer}>
          <TouchableOpacity
            style={[
              styles.trackingButton,
              { backgroundColor: isTracking ? '#FF5722' : '#4CAF50' }
            ]}
            onPress={isTracking ? stopTracking : startTracking}
          >
            <Text style={styles.trackingButtonText}>
              {isTracking ? 'Stop Tracking' : 'Start Tracking'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.infoContainer}>
          {location && (
            <View style={styles.locationCard}>
              <Text style={styles.cardTitle}>Current Location</Text>
              <Text style={styles.locationText}>
                📍 {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </Text>
              <Text style={styles.locationDetail}>
                Accuracy: ±{Math.round(location.accuracy)}m
              </Text>
              {location.speed && location.speed > 0 && (
                <Text style={styles.locationDetail}>
                  Speed: {Math.round(location.speed * 3.6)} km/h
                </Text>
              )}
              {lastUpdate && (
                <Text style={styles.locationDetail}>
                  Updated: {formatTime(lastUpdate)}
                </Text>
              )}
            </View>
          )}

          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{locationHistory.length}</Text>
              <Text style={styles.statLabel}>Locations Sent</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{offlineCount}</Text>
              <Text style={styles.statLabel}>Offline Queue</Text>
            </View>
          </View>

          {locationHistory.length > 0 && (
            <View style={styles.historyContainer}>
              <Text style={styles.cardTitle}>Recent Locations</Text>
              {locationHistory.slice(0, 5).map((loc, index) => (
                <View key={index} style={styles.historyItem}>
                  <Text style={styles.historyText}>
                    {new Date(loc.timestamp).toLocaleTimeString()}
                  </Text>
                  <Text style={styles.historyCoords}>
                    {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D47A1',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontSize: 64,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#BBDEFB',
    textAlign: 'center',
    marginTop: 5,
  },
  driverName: {
    fontSize: 16,
    color: '#BBDEFB',
  },
  deviceId: {
    fontSize: 14,
    color: '#BBDEFB',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 15,
    borderRadius: 15,
    marginBottom: 20,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  appStateText: {
    color: '#BBDEFB',
    fontSize: 12,
    marginTop: 2,
  },
  controlsContainer: {
    marginBottom: 20,
  },
  trackingButton: {
    paddingVertical: 18,
    borderRadius: 15,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  trackingButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  registrationForm: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
    borderRadius: 15,
  },
  label: {
    color: 'white',
    fontSize: 16,
    marginBottom: 10,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 20,
  },
  button: {
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 15,
    borderRadius: 10,
  },
  infoText: {
    color: '#BBDEFB',
    fontSize: 14,
    marginBottom: 5,
  },
  infoContainer: {
    flex: 1,
  },
  locationCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 15,
    borderRadius: 15,
    marginBottom: 15,
  },
  cardTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  locationText: {
    color: 'white',
    fontSize: 14,
    marginBottom: 5,
  },
  locationDetail: {
    color: '#BBDEFB',
    fontSize: 12,
    marginBottom: 2,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  statCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 15,
    borderRadius: 15,
    alignItems: 'center',
    flex: 0.48,
  },
  statNumber: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#BBDEFB',
    fontSize: 12,
    marginTop: 5,
  },
  historyContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 15,
    borderRadius: 15,
    marginBottom: 20,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  historyText: {
    color: '#BBDEFB',
    fontSize: 12,
  },
  historyCoords: {
    color: 'white',
    fontSize: 12,
  },
});

export default App;
