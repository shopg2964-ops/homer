package com.summitjambo.mesh

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.le.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.ParcelUuid
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import io.livekit.android.LiveKit
import java.util.UUID

private val MESH_SERVICE = UUID.fromString("9f2d2b90-7a2e-4b2b-9c6e-0f9d1b7c2026")

class MainActivity : ComponentActivity() {
    private val bluetooth by lazy { BluetoothAdapter.getDefaultAdapter() }
    private val scanner by lazy { bluetooth?.bluetoothLeScanner }
    private val advertiser by lazy { bluetooth?.bluetoothLeAdvertiser }
    private val peers = mutableStateListOf<String>()
    private var advertising by mutableStateOf(false)
    private var scanning by mutableStateOf(false)
    private var pairingCode by mutableStateOf(generateCode())
    private var status by mutableStateOf("Ready")

    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { startMesh() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LiveKit.init(applicationContext)
        setContent { MeshApp() }
        requestMeshPermissions()
    }

    private fun requestMeshPermissions() {
        val p = mutableListOf<String>()
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            p += Manifest.permission.BLUETOOTH_SCAN
            p += Manifest.permission.BLUETOOTH_CONNECT
            p += Manifest.permission.BLUETOOTH_ADVERTISE
            p += Manifest.permission.NEARBY_WIFI_DEVICES
        } else p += Manifest.permission.ACCESS_FINE_LOCATION
        permissionLauncher.launch(p.toTypedArray())
    }

    private fun startMesh() {
        if (bluetooth == null) { status = "This device has no Bluetooth"; return }
        startAdvertising(); startScanning(); status = "Mesh discovery active"
    }

    private fun startAdvertising() {
        if (advertising || advertiser == null) return
        val settings = AdvertiseSettings.Builder().setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY).setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM).setConnectable(true).build()
        val data = AdvertiseData.Builder().setIncludeDeviceName(false).addServiceUuid(ParcelUuid(MESH_SERVICE)).build()
        advertiser?.startAdvertising(settings, data, advertiseCallback); advertising = true
    }

    private fun startScanning() {
        if (scanning || scanner == null) return
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(MESH_SERVICE)).build()
        scanner?.startScan(listOf(filter), ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scanCallback)
        scanning = true
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val name = result.device.name ?: "SummitJambo node"
            val entry = "$name • ${result.rssi} dBm"
            if (!peers.contains(entry)) peers.add(entry)
        }
    }
    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) { status = "Discoverable • code $pairingCode" }
        override fun onStartFailure(errorCode: Int) { status = "Bluetooth advertising failed ($errorCode)"; advertising = false }
    }

    private fun newCode() { pairingCode = generateCode(); status = "New connection code generated" }
    private fun shareCode() {
        val i = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, "Connect to me on SummitJambo with code: $pairingCode") }
        startActivity(Intent.createChooser(i, "Send SummitJambo connection code"))
    }

    @Composable fun MeshApp() {
        MaterialTheme {
            Surface(Modifier.fillMaxSize()) {
                LazyColumn(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    item {
                        Text("SummitJambo Mesh", style = MaterialTheme.typography.headlineMedium)
                        Text("Nearby messaging + conference handoff", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    item {
                        Card { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("Your connection code", style = MaterialTheme.typography.titleMedium)
                            Text(pairingCode, style = MaterialTheme.typography.headlineLarge)
                            Text("Send this code to another SummitJambo user. The code identifies the session; phones still need to be online or within supported nearby radio range.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = ::shareCode) { Text("Send code") }
                                OutlinedButton(onClick = ::newCode) { Text("New code") }
                            }
                        }}
                    }
                    item {
                        Card { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Mesh status", style = MaterialTheme.typography.titleMedium)
                            Text(status)
                            Text("Bluetooth LE discovery is active. Wi‑Fi Aware/Direct and the full multi-hop data layer are the next transport layer.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }}
                    }
                    item { Text("Nearby SummitJambo nodes", style = MaterialTheme.typography.titleMedium) }
                    items(peers) { Text("• $it") }
                    item {
                        Button(onClick = { startMesh() }, modifier = Modifier.fillMaxWidth()) { Text("Refresh mesh") }
                    }
                }
            }
        }
    }

    override fun onDestroy() { super.onDestroy(); try { scanner?.stopScan(scanCallback); advertiser?.stopAdvertising(advertiseCallback) } catch (_: SecurityException) {} }

    companion object { fun generateCode(): String { val chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; val s = (1..8).map { chars.random() }.joinToString(""); return s.substring(0,4) + "-" + s.substring(4) } }
}
