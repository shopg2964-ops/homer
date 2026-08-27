# SummitJambo hybrid transport

1. Internet conference: LiveKit/WebRTC.
2. Connection code: 8-character code resolves to a LiveKit room on the backend.
3. Nearby discovery: Bluetooth LE advertises a SummitJambo service UUID and scans for nearby nodes.
4. Next transport layer: Wi-Fi Aware/Direct for high-bandwidth local media, with BLE used for discovery/control.
5. Multi-hop: implement encrypted message envelopes with message ID, TTL/hop count, sender, recipient/session, timestamp and store-and-forward cache.

Do not treat BLE flooding as the video transport. Use Wi-Fi peer links/WebRTC for media and BLE for discovery/control.
