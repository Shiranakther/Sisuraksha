// =============================================================
// SISURAKSHA — WiFiManager Test Sketch
// Target: ESP32-CAM (AI-Thinker module)
// Purpose: Validate WiFiManager portal + mDNS before migrating
//          the production .ino files
//
// HOW TO USE:
//   1. Flash this sketch to your ESP32-CAM
//   2. On first boot (or after reset), FLASH LED blinks fast →
//      ESP32 has started a "Sisuraksha-Setup" WiFi AP
//   3. Connect your phone to that AP (no password)
//   4. Browser opens to 192.168.4.1 automatically (or open it manually)
//   5. Click "Configure WiFi" → pick your hotspot → enter password → Save
//   6. ESP32-CAM reboots and connects → FLASH LED blinks slowly = SUCCESS
//   7. Open Serial Monitor (115200 baud) to see IP + mDNS hostname
//   8. From your PC browser, visit: http://sisuraksha-test.local/
//      You should see the status page
//
// RESET / CHANGE WIFI:
//   Hold GPIO 0 button for >3 seconds → credentials wiped → portal starts again
//   (GPIO 0 = the small button on the back of the ESP32-CAM board)
// =============================================================

#include <WiFi.h>
#include <WiFiManager.h>      // Library: WiFiManager by tzapu  (install via Library Manager)
#include <ESPmDNS.h>
#include <WebServer.h>        // Built-in, no install needed

// =============================================================
// ESP32-CAM Pin Map
// =============================================================
// The AI-Thinker ESP32-CAM does NOT have a built-in user LED on
// a standard GPIO like most devkits. We use the onboard FLASH
// LED (GPIO 4) as a status indicator, and GPIO 0 as the reset
// button (it's the only button on the board).

#define FLASH_LED_PIN  4   // White flash LED — used as status indicator
#define RESET_BTN_PIN  0   // IO0 button — hold to clear WiFi credentials

// =============================================================
// mDNS hostname — board will be reachable at:
//   http://sisuraksha-test.local/
// Change this per board in your real sketches:
//   accident board  → "sisuraksha-accident"
//   door board      → "sisuraksha-door"
// =============================================================
#define MDNS_HOSTNAME  "sisuraksha-test"

// =============================================================
// Simple HTTP status page (replaces LCD for CAM module)
// =============================================================
WebServer  httpServer(80);

// Flash LED blink tracker
unsigned long lastBlinkMs = 0;
bool          ledState    = false;
bool          wifiOk      = false;

// =============================================================
// Blink Patterns
//   Fast = portal active (waiting for config)
//   Slow = connected and working
// =============================================================
void handleLedBlink() {
  unsigned long now      = millis();
  unsigned long interval = wifiOk ? 1000 : 200;  // slow=connected, fast=portal

  if (now - lastBlinkMs >= interval) {
    ledState    = !ledState;
    // FLASH LED is active-HIGH on AI-Thinker CAM
    digitalWrite(FLASH_LED_PIN, ledState ? HIGH : LOW);
    lastBlinkMs = now;
  }
}

// =============================================================
// HTTP Routes
// =============================================================
void handleRoot() {
  String html = "<!DOCTYPE html><html><head>";
  html += "<meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>Sisuraksha WiFi Test</title>";
  html += "<style>";
  html += "body{font-family:Arial,sans-serif;background:#0d0d1a;color:#eee;padding:20px;text-align:center}";
  html += "h1{color:#00b4d8;font-size:1.4em}";
  html += ".card{background:#16213e;border-radius:10px;padding:15px;margin:10px auto;max-width:400px;text-align:left}";
  html += ".label{color:#888;font-size:0.85em}";
  html += ".value{color:#44ff44;font-weight:bold;font-size:1.1em}";
  html += ".ok{color:#44ff44} .warn{color:#ffaa00}";
  html += "</style></head><body>";
  html += "<h1>&#x2714; SISURAKSHA<br>WiFiManager Test</h1>";

  html += "<div class='card'>";
  html += "<p class='label'>Status</p>";
  html += "<p class='value ok'>WiFi Connected &#x2714;</p>";

  html += "<br><p class='label'>IP Address</p>";
  html += "<p class='value'>" + WiFi.localIP().toString() + "</p>";

  html += "<br><p class='label'>mDNS Hostname</p>";
  html += "<p class='value'><a href='http://" + String(MDNS_HOSTNAME) + ".local' style='color:#00b4d8'>";
  html += String(MDNS_HOSTNAME) + ".local</a></p>";

  html += "<br><p class='label'>SSID</p>";
  html += "<p class='value'>" + WiFi.SSID() + "</p>";

  html += "<br><p class='label'>Signal Strength (RSSI)</p>";
  html += "<p class='value'>" + String(WiFi.RSSI()) + " dBm</p>";

  html += "<br><p class='label'>Uptime</p>";
  html += "<p class='value'>" + String(millis() / 1000) + " seconds</p>";
  html += "</div>";

  html += "<div class='card'>";
  html += "<p class='label warn'>&#x26A0; To reset WiFi credentials:</p>";
  html += "<p style='font-size:0.9em'>Hold the <b>GPIO 0 button</b> on the ESP32-CAM for <b>3 seconds</b>. ";
  html += "The board will wipe credentials and start the config portal again.</p>";
  html += "</div>";

  html += "<p style='color:#333;font-size:0.75em;margin-top:20px'>SISURAKSHA WiFiManager Test | 25-26J-282</p>";
  html += "</body></html>";

  httpServer.send(200, "text/html", html);
}

// JSON status endpoint — useful for testing from Python scripts
void handleStatus() {
  String json = "{";
  json += "\"status\":\"ok\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"ssid\":\"" + WiFi.SSID() + "\",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"mdns\":\"" + String(MDNS_HOSTNAME) + ".local\",";
  json += "\"uptime\":" + String(millis() / 1000);
  json += "}";
  httpServer.sendHeader("Access-Control-Allow-Origin", "*");
  httpServer.send(200, "application/json", json);
}

// =============================================================
// SETUP
// =============================================================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[SISURAKSHA] WiFiManager Test — ESP32-CAM");
  Serial.println("==========================================");

  // ── GPIO setup ─────────────────────────────────────────────
  pinMode(FLASH_LED_PIN, OUTPUT);
  pinMode(RESET_BTN_PIN, INPUT_PULLUP);  // IO0 — active LOW when pressed
  digitalWrite(FLASH_LED_PIN, LOW);

  // ── Check for manual reset (hold IO0 on boot) ───────────────
  // If button held at startup → wipe credentials so portal starts
  if (digitalRead(RESET_BTN_PIN) == LOW) {
    Serial.println("[WiFi] IO0 held at boot — clearing saved credentials...");
    WiFiManager wm_temp;
    wm_temp.resetSettings();
    Serial.println("[WiFi] Credentials cleared. Release button and reboot.");
    // Blink rapidly to indicate clear
    for (int i = 0; i < 10; i++) {
      digitalWrite(FLASH_LED_PIN, HIGH); delay(100);
      digitalWrite(FLASH_LED_PIN, LOW);  delay(100);
    }
  }

  // ── WiFiManager Setup ───────────────────────────────────────
  WiFiManager wm;

  // Set timeout: if nobody configures portal in 3 minutes,
  // reboot and try again (in case of accidental trigger)
  wm.setConfigPortalTimeout(180);

  // Customise the portal AP name and password
  // Portal name = "Sisuraksha-Setup", no password (open AP)
  // Your phone will auto-open captive portal at 192.168.4.1
  Serial.println("[WiFi] Starting WiFiManager...");
  Serial.println("[WiFi] If no saved credentials → AP 'Sisuraksha-Setup' will start");

  bool connected = wm.autoConnect("Sisuraksha-Setup");
  // ^^^ This BLOCKS until:
  //   a) previously saved credentials connect successfully, OR
  //   b) user configures WiFi via portal, OR
  //   c) portal timeout (180s) → returns false

  if (connected) {
    wifiOk = true;
    Serial.println("[WiFi] Connected!");
    Serial.println("[WiFi] IP Address : " + WiFi.localIP().toString());
    Serial.println("[WiFi] SSID       : " + WiFi.SSID());
    Serial.println("[WiFi] RSSI       : " + String(WiFi.RSSI()) + " dBm");
  } else {
    Serial.println("[WiFi] FAILED — portal timed out. Rebooting...");
    // Blink 10 times fast to show failure, then reboot
    for (int i = 0; i < 10; i++) {
      digitalWrite(FLASH_LED_PIN, HIGH); delay(150);
      digitalWrite(FLASH_LED_PIN, LOW);  delay(150);
    }
    ESP.restart();
  }

  // ── mDNS ───────────────────────────────────────────────────
  // Board will be accessible at http://sisuraksha-test.local
  if (MDNS.begin(MDNS_HOSTNAME)) {
    Serial.println("[mDNS] Hostname registered: http://" + String(MDNS_HOSTNAME) + ".local");
    MDNS.addService("http", "tcp", 80);
  } else {
    Serial.println("[mDNS] FAILED — use IP address instead");
  }

  // ── HTTP Server ─────────────────────────────────────────────
  httpServer.on("/",       HTTP_GET, handleRoot);
  httpServer.on("/status", HTTP_GET, handleStatus);
  httpServer.begin();
  Serial.println("[HTTP] Server started on port 80");

  Serial.println("\n==========================================");
  Serial.println("[READY] Open browser to:");
  Serial.println("  http://" + String(MDNS_HOSTNAME) + ".local");
  Serial.println("  http://" + WiFi.localIP().toString());
  Serial.println("==========================================\n");
}

// =============================================================
// LOOP
// =============================================================
void loop() {
  // Handle incoming HTTP requests
  httpServer.handleClient();

  // Handle LED blink animation
  handleLedBlink();

  // ── Runtime reset button ─────────────────────────────────────
  // Hold GPIO 0 for > 3 seconds while running → clear credentials
  static unsigned long btnPressStart = 0;
  static bool          btnWasPressed = false;

  if (digitalRead(RESET_BTN_PIN) == LOW) {
    if (!btnWasPressed) {
      btnWasPressed  = true;
      btnPressStart  = millis();
      Serial.println("[BTN] IO0 held — keep holding for 3s to reset WiFi...");
    } else if (millis() - btnPressStart >= 3000) {
      // Held for 3 seconds → reset credentials and reboot
      Serial.println("[BTN] 3s hold detected — resetting WiFi credentials...");
      // Blink flash LED fast to show action
      for (int i = 0; i < 6; i++) {
        digitalWrite(FLASH_LED_PIN, HIGH); delay(150);
        digitalWrite(FLASH_LED_PIN, LOW);  delay(150);
      }
      WiFiManager wm;
      wm.resetSettings();
      Serial.println("[BTN] Credentials cleared — rebooting...");
      delay(500);
      ESP.restart();
    }
  } else {
    btnWasPressed = false;
    btnPressStart = 0;
  }

  // mDNS needs to be polled on some ESP32 versions
  // (no-op on newer SDK but harmless to call)
  delay(5);
}
