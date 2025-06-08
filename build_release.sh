#!/bin/bash

echo "🚀 Building Location Tracker Release APK..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
cd android
./gradlew clean

# Build release APK
echo "📱 Building release APK..."
./gradlew assembleRelease

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "📦 Your APK is located at:"
    echo "android/app/build/outputs/apk/release/app-release.apk"
    echo ""
    echo "📱 Install commands:"
    echo "adb install android/app/build/outputs/apk/release/app-release.apk"
    echo ""
    echo "🎉 Ready to test your Location Tracker app!"
else
    echo "❌ Build failed. Check the errors above."
fi 