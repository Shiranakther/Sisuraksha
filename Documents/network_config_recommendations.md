# Sisuraksha — Network Configuration Problem & Recommendations

## The Problem (Exactly What's Happening)

You have **two separate hardcoding problems** across the system:

---

### Problem 1 — WiFi SSID & Password hardcoded in ESP32 `.ino` files

| File | Line | Hardcoded Value |
|------|------|-----------------|
| `sisuraksha_accident_v1 (4).ino` | 39–40 | `"YOUR_WIFI_NAME"` / `"YOUR_WIFI_PASS"` |
| `sisuraksha_door_v1.ino` | 39–40 | `"YOUR_WIFI_NAME"` / `"YOUR_WIFI_PASS"` |

Every time the hotspot name or password changes → **you must recompile and reflash both ESP32 boards**.

---

### Problem 2 — Server IP address hardcoded in ESP32 `.ino` files

| File | Line | Hardcoded Value |
|------|------|-----------------|
| `sisuraksha_accident_v1 (4).ino` | 43–44 | `http://10.60.136.164:5000/api/accident/alert` |
| `sisuraksha_accident_v1 (4).ino` | 44 | `http://10.60.136.164:5000/api/accident/cancel` |
| `sisuraksha_door_v1.ino` | 45 | `http://10.60.136.164:5000/api/accident/door-callback` |

Every time the phone hotspot's IP changes (which happens on every reconnect) → **you must recompile and reflash again**.

---

### Problem 3 — Server URL in Python scripts (less severe)

The Python scripts (`riyabeth_pro_safety.py`, `driver_monitor_v2.py`, `bus_safety_demo.py`) all default to `http://localhost:5000/...` which is configurable via `--server_url` CLI argument. **This is already fine** — no action needed for Python side unless you want `.env` support.

---

## Root Cause Summary

```
Hotspot changes IP → ESP32 hardcoded IP stops working → reflash needed
Hotspot changes SSID/pass → ESP32 can't connect → reflash needed
```

---

## Recommended Solution: WiFiManager + mDNS (Already Tested!)

> [!IMPORTANT]
> You already built and tested this exact solution in `wifimanager_test/wifimanager_test.ino`. The test sketch works. You just need to **migrate it into the production `.ino` files**.

### How This Solves Both Problems

| Problem | Solution |
|---------|----------|
| Hardcoded SSID/password | WiFiManager — credentials stored in flash, configured via captive portal once |
| Hardcoded server IP (`10.60.136.164`) | mDNS — connect to `sisuraksha-server.local` instead of a raw IP |

---

## Option A — WiFiManager + mDNS (Recommended)

### On the ESP32 side (both `.ino` files)

**Step 1: Replace hardcoded WiFi block with WiFiManager**

```cpp
// ❌ REMOVE THESE:
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASS";

// ✅ ADD THESE INCLUDES:
#include <WiFiManager.h>   // Install: Library Manager → "WiFiManager by tzapu"

// ✅ REPLACE WiFi.begin(...) in setup() with:
WiFiManager wm;
wm.setConfigPortalTimeout(180);  // 3 min portal timeout
bool connected = wm.autoConnect("Sisuraksha-Setup");
if (!connected) {
    Serial.println("[WiFi] Portal timeout — rebooting");
    ESP.restart();
}
```

**Step 2: Replace hardcoded server IP with mDNS hostname**

```cpp
// ❌ REMOVE THESE (accident board):
const char* NODE_ALERT_URL  = "http://10.60.136.164:5000/api/accident/alert";
const char* NODE_CANCEL_URL = "http://10.60.136.164:5000/api/accident/cancel";

// ✅ REPLACE WITH:
const char* NODE_ALERT_URL  = "http://sisuraksha-server.local:5000/api/accident/alert";
const char* NODE_CANCEL_URL = "http://sisuraksha-server.local:5000/api/accident/cancel";

// ❌ REMOVE THESE (door board):
const char* NODE_DOOR_CALLBACK_URL = "http://10.60.136.164:5000/api/accident/door-callback";

// ✅ REPLACE WITH:
const char* NODE_DOOR_CALLBACK_URL = "http://sisuraksha-server.local:5000/api/accident/door-callback";
```

**Step 3: Register mDNS on the SERVER side** (Node.js backend)

Install `mdns` or `bonjour` package in the Node.js server so it advertises itself as `sisuraksha-server.local`:

```bash
npm install mdns
```

```javascript
// In your server index.js / app.js:
const mdns = require('mdns');
const ad = mdns.createAdvertisement(mdns.tcp('http'), 5000, {
  name: 'sisuraksha-server'
});
ad.start();
console.log('[mDNS] Broadcasting as sisuraksha-server.local:5000');
```

> [!NOTE]
> Alternatively use the `bonjour` npm package which is simpler and cross-platform:
> ```bash
> npm install bonjour-service
> ```
> ```javascript
> const Bonjour = require('bonjour-service');
> const bonjour = new Bonjour();
> bonjour.publish({ name: 'sisuraksha-server', type: 'http', port: 5000 });
> ```

### How It Works After Setup

```
First boot (or after hotspot change):
  ESP32 → starts "Sisuraksha-Setup" WiFi AP
  You → connect phone to "Sisuraksha-Setup"
  Portal → opens at 192.168.4.1
  You → pick your hotspot, enter password → Save
  ESP32 → reboots, connects, stores credentials in flash
  ✅ DONE — no reflash ever again for WiFi

For server IP:
  Node server → advertises itself as sisuraksha-server.local
  ESP32 → resolves sisuraksha-server.local to current IP automatically
  ✅ DONE — IP changes don't matter anymore
```

### Reset Instructions (when hotspot truly changes SSID/pass)

- Hold the **BOOT/IO0 button** on the ESP32 for **3 seconds**
- Board wipes saved credentials → portal starts again
- Configure new hotspot → done

---

## Option B — SPIFFS Config File (Alternative / Supplement)

Store config in a JSON file on the ESP32's flash filesystem. No portal needed — you update the file via serial upload or a simple web endpoint.

```cpp
#include <SPIFFS.h>
#include <ArduinoJson.h>

String SERVER_URL;
String WIFI_SSID_STORED;
String WIFI_PASS_STORED;

void loadConfig() {
    if (!SPIFFS.begin(true)) return;
    File f = SPIFFS.open("/config.json", "r");
    if (!f) return;
    StaticJsonDocument<256> doc;
    deserializeJson(doc, f);
    SERVER_URL        = doc["server_url"] | "http://sisuraksha-server.local:5000";
    WIFI_SSID_STORED  = doc["ssid"]       | "";
    WIFI_PASS_STORED  = doc["password"]   | "";
    f.close();
}
```

**config.json** (uploaded to SPIFFS):
```json
{
  "ssid": "MyHotspot",
  "password": "MyPassword",
  "server_url": "http://sisuraksha-server.local:5000"
}
```

> [!WARNING]
> SPIFFS is more complex to set up than WiFiManager. For your use case, **Option A (WiFiManager) is simpler and already tested**.

---

## Option C — Bluetooth Provisioning (Advanced)

Use BLE (Bluetooth Low Energy) on the ESP32 to send WiFi credentials from a phone app. Good for production deployment but overkill for a university project.

---

## Final Recommended Action Plan

### Step-by-step migration (in order):

- [ ] **Step 1** — Add mDNS advertisement to your Node.js server (`bonjour-service` package)
- [ ] **Step 2** — Test: from another device on same network, can you reach `http://sisuraksha-server.local:5000`?
- [ ] **Step 3** — Migrate `sisuraksha_accident_v1 (4).ino`:
  - Replace WiFi.begin() with WiFiManager (copy from `wifimanager_test.ino`)
  - Replace hardcoded IPs with `sisuraksha-server.local`
  - Keep the hold-button reset logic (already in test sketch)
- [ ] **Step 4** — Migrate `sisuraksha_door_v1.ino`:
  - Same WiFiManager migration
  - Replace hardcoded door callback IP with `sisuraksha-server.local`
- [ ] **Step 5** — Flash both boards
- [ ] **Step 6** — First boot: configure each board's WiFi via the portal
- [ ] **Step 7** — Verify end-to-end — accident alert → server → door open

---

## Quick Reference: Per-Board mDNS Hostnames

| Board | mDNS hostname (already set) | Port |
|-------|----------------------------|------|
| Accident/Footboard ESP32 | `sisuraksha-accident.local` | 80 |
| Door/Window ESP32 | `sisuraksha-door.local` | 81 |
| Node.js Server | `sisuraksha-server.local` ← **add this** | 5000 |

---

## Why mDNS May Fail in Some Networks (and the Fix)

> [!WARNING]
> **mDNS (`.local` hostnames) can fail on some Android phones and university/public WiFi networks** because they block mDNS multicast packets.

If `sisuraksha-server.local` doesn't resolve on your hotspot:

**Fix 1 — Use the server's actual IP as a fallback constant**
```cpp
// Try mDNS first, fall back to IP
const char* NODE_ALERT_URL = 
    "http://sisuraksha-server.local:5000/api/accident/alert";
// If mDNS fails: change to "http://192.168.x.x:5000/..."
// but you only change ONE constant, not reflash multiple boards
```

**Fix 2 — Server broadcasts its own IP**
Have the Node server POST its current IP to a known endpoint or publish it via a simple UDP broadcast that ESP32s listen to (more advanced).

**Fix 3 — Use a fixed local IP for the server laptop/phone**
Set your laptop/phone's hotspot to always assign itself the same gateway IP (usually `192.168.43.1` on Android hotspot — this is **fixed and never changes**).

> [!TIP]
> **Quickest fix for demos/university use**: Android phone hotspot always gives the host phone the IP `192.168.43.1`. If the Node server runs on the hotspot phone, hardcode `192.168.43.1:5000` — this IP never changes regardless of hotspot name/password.
