# 📍 Location Tracker App Icons

## Quick Icon Generation

### Option 1: Use Online Icon Generator (Recommended)
1. Go to: https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
2. Upload a 1024x1024 PNG icon or use the built-in icon maker
3. Choose "Location" or "Map Pin" icon from the clipart
4. Set these options:
   - Name: `ic_launcher`
   - Color: `#2563eb` (blue)
   - Shape: Circle or Square
   - Background: White or Blue gradient
5. Download the generated ZIP file
6. Extract and copy all folders to: `android/app/src/main/res/`

### Option 2: Manual Icon Creation
Create icons with these sizes and place them in the respective folders:

```
android/app/src/main/res/
├── mipmap-mdpi/ic_launcher.png (48x48)
├── mipmap-hdpi/ic_launcher.png (72x72)
├── mipmap-xhdpi/ic_launcher.png (96x96)
├── mipmap-xxhdpi/ic_launcher.png (144x144)
└── mipmap-xxxhdpi/ic_launcher.png (192x192)
```

### Option 3: Use React Native Asset Generator
```bash
npm install -g react-native-asset
# Add your 1024x1024 icon as assets/icon.png
react-native-asset
```

## Icon Design Ideas
- 📍 Location pin with truck/car
- 🗺️ Map with route lines
- 📱 Phone with location symbol
- 🚛 Truck with GPS signal
- 📡 Navigation/tracking symbol

## Colors
- Primary: #2563eb (Blue)
- Secondary: #059669 (Green)
- Background: #ffffff (White)

## After Adding Icons
1. Clean build: `cd android && ./gradlew clean`
2. Build release: `./gradlew assembleRelease`
3. Your APK will have the new icon! 