# SummitJambo Mesh Android

This is the Android companion app for SummitJambo's hybrid communications platform.

## Included now
- Android/Kotlin project
- LiveKit Android SDK for realtime audio/video
- Bluetooth LE service advertising and scanning for SummitJambo nodes
- 8-character connection code generation
- Share connection code using Android's native share sheet
- Nearby node discovery
- Camera/microphone permissions ready for conference integration
- Wi-Fi Aware permission ready for the high-bandwidth mesh transport layer

## Connection code behavior
The code is a session/pairing identifier. Sending the code to someone does not bypass radio/network range. For offline mesh communication, both devices need the SummitJambo app and compatible nearby radios; for Internet mode the code resolves to a LiveKit room through the SummitJambo backend.

## Build
Open this folder in Android Studio and run the `app` configuration on Android 10+ hardware. A local Android SDK/Gradle installation is required to produce an APK.

The LiveKit Android SDK supports realtime audio/video/data and native screen sharing. See https://docs.livekit.io/transport/sdk-platforms/android/.
