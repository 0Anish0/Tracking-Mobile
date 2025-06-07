# Location Tracker Mobile App

React Native CLI app for sending location data to the backend server.

## Features

- Simple one-button interface
- Real-time location fetching
- WebSocket communication
- Location permissions handling
- Cross-platform (iOS & Android)

## Prerequisites

- Node.js 18+
- React Native development environment set up
- Android Studio (for Android) or Xcode (for iOS)
- A physical device or emulator

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure server URL:**
   Edit `App.tsx` and update the `SOCKET_URL` with your computer's IP address:
   ```typescript
   const SOCKET_URL = 'http://YOUR_IP_ADDRESS:3001';
   ```
   
   To find your IP address:
   - **macOS/Linux:** `ifconfig | grep inet`
   - **Windows:** `ipconfig`

3. **Install iOS dependencies (iOS only):**
   ```bash
   cd ios && pod install && cd ..
   ```

## Running the App

### Android
```bash
npx react-native run-android
```

### iOS
```bash
npx react-native run-ios
```

## Permissions

The app requests the following permissions:
- `ACCESS_FINE_LOCATION` - For precise location access
- `ACCESS_COARSE_LOCATION` - For approximate location access

These permissions are automatically requested when you tap the "Send My Location" button.

## Configuration

### Socket URL
Update the `SOCKET_URL` constant in `App.tsx` to match your backend server's URL.

### Location Options
Location accuracy settings can be modified in the `getCurrentLocation` function:
- `enableHighAccuracy: true` - Use GPS for better accuracy
- `timeout: 15000` - Maximum time to wait for location (15 seconds)
- `maximumAge: 10000` - Maximum age of cached location (10 seconds)

## Troubleshooting

### Location Not Working
1. Ensure location services are enabled on your device
2. Grant location permissions to the app
3. Check that you're testing on a physical device (emulator GPS may not work properly)

### Connection Issues
1. Ensure your device and computer are on the same network
2. Check the `SOCKET_URL` is correct with your computer's local IP
3. Ensure the backend server is running on port 3001
4. Check firewall settings allow connections on port 3001

### Build Issues
1. Clean the project: `npx react-native clean`
2. Clear Metro cache: `npx react-native start --reset-cache`
3. Rebuild: `npx react-native run-android` or `npx react-native run-ios`

## Usage

1. Make sure the backend server is running
2. Launch the mobile app
3. Check the connection status indicator
4. Tap "Send My Location" to fetch and send your current location
5. View the location on the admin panel in real-time
