// =============================================================
// SISURAKSHA — Emergency Door + PIR Safety + Rear Display
// IT22610102 | Pinto R.I.S.R | Project 25-26J-282
//
// This ESP32 handles:
//   1. Emergency door servo — opens on Node POST /open
//   2. PIR sensor (road side) — checks for incoming vehicles
//      before opening door. Holds door if vehicle detected.
//   3. Rear bus display (16x2 LCD) — shows warning to traffic
//      behind the bus when accident confirmed
//
// Components:
//   Servo motor  — GPIO 13  (door lock mechanism)
//   PIR sensor   — GPIO 14  (right side road detection)
//   Buzzer       — GPIO 12  (door open alert)
//   Door LED     — GPIO 27  (red — door unlocked indicator)
//   PIR LED      — GPIO 26  (yellow — vehicle detected warning)
//   Reset Button — GPIO 4   (manual door reset)
//   LCD 16x2 I2C — SDA=21 SCL=22 (0x27) — rear display
//
// Network:
//   Port 81 — HTTP server (Node backend calls /open /reset)
//   mDNS    — sisuraksha-door.local
// =============================================================

#include <WiFi.h>
#include <ESPmDNS.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>

// =============================================================
// WiFi Config
// =============================================================
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASS";

// =============================================================
// Node Server Config — POST door status updates back to server
// =============================================================
const char* NODE_DOOR_CALLBACK_URL = "http://10.60.136.164:5000/api/accident/door-callback";

// =============================================================
// Pin Definitions
// =============================================================
#define SERVO_PIN     13   // door servo signal
#define PIR_PIN       14   // PIR sensor — road side
#define BUZZER_PIN    12   // buzzer
#define DOOR_LED_PIN  27   // red LED — door open indicator
#define PIR_LED_PIN   26   // yellow LED — vehicle incoming warning
#define RESET_BTN_PIN  4   // manual reset button (INPUT_PULLUP)

// Servo angles
#define DOOR_LOCKED    0   // degrees — door locked
#define DOOR_UNLOCKED 90   // degrees — door open

// PIR timing
// PIR sensors give HIGH when motion detected
// We check for sustained clear road before opening
#define PIR_CLEAR_TIME_MS  3000   // road must be clear for 3 seconds
#define PIR_RECHECK_MS     500    // recheck every 500ms while waiting

// =============================================================
// Objects
// =============================================================
Servo             doorServo;
LiquidCrystal_I2C lcd(0x27, 16, 2);
AsyncWebServer    server(81);
SemaphoreHandle_t i2cMutex;

// =============================================================
// System State
// =============================================================
enum DoorState {
  DOOR_IDLE,           // no accident — door locked, display blank
  DOOR_ACCIDENT,       // accident confirmed — display warning, waiting for PIR clear
  DOOR_PIR_BLOCKED,    // vehicle detected — holding door, warning on display
  DOOR_OPENING,        // PIR clear — opening door now
  DOOR_OPEN,           // door fully open
  DOOR_RESET           // resetting back to idle
};

DoorState currentState   = DOOR_IDLE;
String    accidentType   = "";
String    busId          = "";
bool      doorPhysicallyOpen = false;

// PIR tracking
unsigned long pirClearStartMs = 0;   // when road first became clear
bool          pirClear        = false;

// State change tracking — only POST when state actually changes
DoorState prevReportedState = DOOR_IDLE;
unsigned long lastPostMs     = 0;
const unsigned long POST_COOLDOWN_MS = 2000;  // don't spam server

// Display scrolling
unsigned long lastScrollMs   = 0;
int           scrollOffset   = 0;

// Buzzer non-blocking
unsigned long buzzerMs      = 0;
bool          buzzerOn      = false;
int           buzzerBeeps   = 0;
int           buzzerCount   = 0;
unsigned long buzzerInterval = 500;

// =============================================================
// POST door status back to Node server
// Called on every state transition so server + apps get real-time updates
// =============================================================
void postDoorStatus(const char* stateStr) {
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastPostMs < POST_COOLDOWN_MS) return;

  HTTPClient http;
  http.begin(NODE_DOOR_CALLBACK_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(800);

  StaticJsonDocument<256> doc;
  doc["state"]        = stateStr;
  doc["doorOpen"]     = doorPhysicallyOpen;
  doc["pirBlocked"]   = (digitalRead(PIR_PIN) == HIGH);
  doc["pirClear"]     = pirClear;
  doc["busId"]        = busId;
  doc["accidentType"] = accidentType;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  Serial.printf("[POST] Door status → %s | HTTP %d\n", stateStr, code);
  http.end();
  lastPostMs = millis();
}

// =============================================================
// LCD Helper (mutex guarded)
// =============================================================
void lcdPrint(const char* line1, const char* line2) {
  if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(30)) != pdTRUE) return;
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(line1);
  lcd.setCursor(0, 1); lcd.print(line2);
  xSemaphoreGive(i2cMutex);
}

// Scrolling message for long text (rear display for traffic)
// Call this every loop — handles timing internally
String scrollMsg1 = "";
String scrollMsg2 = "";

void lcdScroll() {
  if (scrollMsg1.length() == 0) return;
  unsigned long now = millis();
  if (now - lastScrollMs < 400) return;
  lastScrollMs = now;

  if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(30)) != pdTRUE) return;

  // Line 1 — scroll if longer than 16 chars
  String l1 = scrollMsg1;
  if (l1.length() > 16) {
    l1 = l1 + "    " + l1;  // wrap around
    int offset = scrollOffset % (scrollMsg1.length() + 4);
    l1 = l1.substring(offset, offset + 16);
  }

  // Line 2 — static (shorter messages)
  String l2 = scrollMsg2;
  if (l2.length() > 16) l2 = l2.substring(0, 16);

  lcd.setCursor(0, 0); lcd.print(l1);
  lcd.setCursor(0, 1); lcd.print(l2);

  scrollOffset++;
  xSemaphoreGive(i2cMutex);
}

// =============================================================
// Buzzer — non-blocking beep sequence
// call startBuzzer(count, intervalMs) to start
// call handleBuzzer() every loop
// =============================================================
void startBuzzer(int count, unsigned long intervalMs) {
  buzzerBeeps    = count * 2;  // on + off per beep
  buzzerCount    = 0;
  buzzerInterval = intervalMs;
  buzzerMs       = millis();
  buzzerOn       = true;
  digitalWrite(BUZZER_PIN, HIGH);
}

void handleBuzzer() {
  if (buzzerCount >= buzzerBeeps) {
    digitalWrite(BUZZER_PIN, LOW);
    return;
  }
  if (millis() - buzzerMs >= buzzerInterval) {
    buzzerOn = !buzzerOn;
    digitalWrite(BUZZER_PIN, buzzerOn ? HIGH : LOW);
    buzzerMs = millis();
    buzzerCount++;
  }
}

// =============================================================
// Door control
// =============================================================
void physicallyOpenDoor() {
  doorServo.write(DOOR_UNLOCKED);
  doorPhysicallyOpen = true;
  digitalWrite(DOOR_LED_PIN, HIGH);
  startBuzzer(5, 200);  // 5 fast beeps when door opens
  Serial.println("[DOOR] Servo → OPEN (90°)");
}

void physicallyCloseDoor() {
  doorServo.write(DOOR_LOCKED);
  doorPhysicallyOpen = false;
  digitalWrite(DOOR_LED_PIN, LOW);
  Serial.println("[DOOR] Servo → LOCKED (0°)");
}

// =============================================================
// PIR check
// Returns true if road is clear for PIR_CLEAR_TIME_MS
// =============================================================
bool isRoadClear() {
  int pirVal = digitalRead(PIR_PIN);

  if (pirVal == HIGH) {
    // Vehicle / motion detected — road not clear
    pirClear        = false;
    pirClearStartMs = 0;
    digitalWrite(PIR_LED_PIN, HIGH);  // yellow LED on — warning
    return false;
  } else {
    // No motion — road may be clear
    digitalWrite(PIR_LED_PIN, LOW);
    if (!pirClear) {
      pirClear        = true;
      pirClearStartMs = millis();  // start timing clear period
    }
    // Check if clear for long enough
    return (millis() - pirClearStartMs >= PIR_CLEAR_TIME_MS);
  }
}

// =============================================================
// State Machine — called every 100ms from task
// =============================================================
void runStateMachine() {
  int resetBtn = digitalRead(RESET_BTN_PIN);

  switch (currentState) {

    // ── IDLE ────────────────────────────────────────────────
    case DOOR_IDLE:
      // Everything off — waiting for Node to call /open
      scrollMsg1 = "";
      scrollMsg2 = "";
      if (prevReportedState != DOOR_IDLE) {
        postDoorStatus("IDLE");
        prevReportedState = DOOR_IDLE;
      }
      break;

    // ── ACCIDENT CONFIRMED — check PIR before opening ───────
    case DOOR_ACCIDENT: {
      if (prevReportedState != DOOR_ACCIDENT) {
        postDoorStatus("ACCIDENT");
        prevReportedState = DOOR_ACCIDENT;
      }

      // Rear display — warn traffic behind bus
      scrollMsg1 = "!! BUS CRASHED !! SLOW DOWN !! BUS CRASHED !!";
      scrollMsg2 = "  CALL 119 NOW  ";
      lcdScroll();

      // Check PIR — is the road side clear?
      if (isRoadClear()) {
        // Road clear for 3 seconds — safe to open
        currentState = DOOR_OPENING;
        Serial.println("[DOOR] Road clear — proceeding to open");
      } else {
        // Vehicle incoming — hold door, keep warning
        currentState = DOOR_PIR_BLOCKED;
        Serial.println("[PIR] Vehicle detected — holding door");
        startBuzzer(2, 400);
      }
      break;
    }

    // ── PIR BLOCKED — vehicle coming, hold door ─────────────
    case DOOR_PIR_BLOCKED: {
      if (prevReportedState != DOOR_PIR_BLOCKED) {
        postDoorStatus("PIR_BLOCKED");
        prevReportedState = DOOR_PIR_BLOCKED;
      }

      // Rear display — urgent warning to incoming vehicle
      scrollMsg1 = ">> STOP << BUS ACCIDENT AHEAD >> STOP <<";
      scrollMsg2 = "DO NOT OVERTAKE ";
      lcdScroll();

      // Keep checking — open when clear
      if (isRoadClear()) {
        currentState = DOOR_OPENING;
        Serial.println("[PIR] Road now clear — opening door");
      }
      break;
    }

    // ── OPENING — PIR clear, open door now ──────────────────
    case DOOR_OPENING:
      postDoorStatus("OPENING");
      prevReportedState = DOOR_OPENING;
      physicallyOpenDoor();
      currentState = DOOR_OPEN;
      Serial.println("[DOOR] State → OPEN");
      break;

    // ── OPEN — door open, display escape instructions ────────
    case DOOR_OPEN: {
      if (prevReportedState != DOOR_OPEN) {
        postDoorStatus("OPEN");
        prevReportedState = DOOR_OPEN;
      }

      // Scroll message for people outside + traffic
      scrollMsg1 = "EMERGENCY EXIT OPEN >> EVACUATE NOW >> EMERGENCY EXIT OPEN";
      scrollMsg2 = " HELP IS COMING ";
      lcdScroll();

      // If PIR detects vehicle now — flash PIR LED as warning
      // but don't close door — people need to exit
      int pirVal = digitalRead(PIR_PIN);
      digitalWrite(PIR_LED_PIN, pirVal == HIGH ? HIGH : LOW);

      // Manual reset by pressing button (supervisor / rescue team)
      if (resetBtn == LOW) {
        currentState = DOOR_RESET;
        Serial.println("[DOOR] Manual reset triggered");
      }
      break;
    }

    // ── RESET ────────────────────────────────────────────────
    case DOOR_RESET:
      postDoorStatus("RESET");
      prevReportedState = DOOR_RESET;
      physicallyCloseDoor();
      digitalWrite(PIR_LED_PIN, LOW);
      pirClear        = false;
      pirClearStartMs = 0;
      accidentType    = "";
      busId           = "";
      scrollMsg1      = "";
      scrollMsg2      = "";
      lcdPrint("  SISURAKSHA   ", " System Ready  ");
      delay(1500);
      currentState = DOOR_IDLE;
      Serial.println("[DOOR] System reset → IDLE");
      break;
  }

  handleBuzzer();
}

// =============================================================
// FreeRTOS Task — Core 0
// =============================================================
void doorTask(void* param) {
  for (;;) {
    runStateMachine();

    // Serial status every second
    static unsigned long lastPrint = 0;
    if (millis() - lastPrint >= 1000) {
      Serial.printf("[STATUS] state=%d pir=%s door=%s\n",
        (int)currentState,
        digitalRead(PIR_PIN) == HIGH ? "BLOCKED" : "CLEAR",
        doorPhysicallyOpen ? "OPEN" : "LOCKED");
      lastPrint = millis();
    }

    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

// =============================================================
// SETUP
// =============================================================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[SISURAKSHA] Door + Display System booting...");

  // ── I2C mutex ──────────────────────────────────────────────
  i2cMutex = xSemaphoreCreateMutex();

  // ── Pins ───────────────────────────────────────────────────
  pinMode(PIR_PIN,       INPUT);
  pinMode(BUZZER_PIN,    OUTPUT);
  pinMode(DOOR_LED_PIN,  OUTPUT);
  pinMode(PIR_LED_PIN,   OUTPUT);
  pinMode(RESET_BTN_PIN, INPUT_PULLUP);
  digitalWrite(BUZZER_PIN,   LOW);
  digitalWrite(DOOR_LED_PIN, LOW);
  digitalWrite(PIR_LED_PIN,  LOW);

  // ── Servo ──────────────────────────────────────────────────
  doorServo.attach(SERVO_PIN);
  doorServo.write(DOOR_LOCKED);  // start locked
  Serial.println("[OK] Servo locked at 0°");

  // ── LCD ────────────────────────────────────────────────────
  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcdPrint("  SISURAKSHA   ", "  Door System  ");
  Serial.println("[OK] LCD ready");

  // ── WiFi ───────────────────────────────────────────────────
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("[WiFi] Connecting");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500); Serial.print("."); attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected: " + WiFi.localIP().toString());
    lcdPrint("WiFi Connected  ", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi] FAILED — offline mode");
    lcdPrint("WiFi FAILED     ", "Offline mode    ");
  }
  delay(1500);

  // ── mDNS ───────────────────────────────────────────────────
  if (MDNS.begin("sisuraksha-door")) {
    Serial.println("[mDNS] http://sisuraksha-door.local");
    MDNS.addService("http", "tcp", 81);
  }

  // ── HTTP Routes ────────────────────────────────────────────

  // Node backend calls this when accident CONFIRMED (3 min passed)
  // Body: { "busId": "BUS_001", "alertType": "ROLLOVER" }
  server.on("/open", HTTP_POST, [](AsyncWebServerRequest* req) {},
    NULL,
    [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {

      StaticJsonDocument<128> doc;
      deserializeJson(doc, (char*)data);

      busId        = doc["busId"].as<String>();
      accidentType = doc["alertType"].as<String>();

      if (currentState == DOOR_IDLE) {
        currentState = DOOR_ACCIDENT;
        Serial.printf("[HTTP] /open received | bus=%s type=%s\n",
                      busId.c_str(), accidentType.c_str());
        req->send(200, "application/json",
                  "{\"status\":\"processing\",\"message\":\"PIR check started\"}");
      } else {
        req->send(200, "application/json",
                  "{\"status\":\"already_active\"}");
      }
    }
  );

  // Node backend calls this to reset (e.g. false alarm cleared remotely)
  server.on("/reset", HTTP_POST, [](AsyncWebServerRequest* req) {
    currentState = DOOR_RESET;
    req->send(200, "application/json", "{\"status\":\"resetting\"}");
    Serial.println("[HTTP] /reset received from backend");
  });

  // Status endpoint — Node can poll this
  server.on("/status", HTTP_GET, [](AsyncWebServerRequest* req) {
    String stateStr;
    switch (currentState) {
      case DOOR_IDLE:        stateStr = "IDLE";        break;
      case DOOR_ACCIDENT:    stateStr = "ACCIDENT";    break;
      case DOOR_PIR_BLOCKED: stateStr = "PIR_BLOCKED"; break;
      case DOOR_OPENING:     stateStr = "OPENING";     break;
      case DOOR_OPEN:        stateStr = "OPEN";        break;
      case DOOR_RESET:       stateStr = "RESET";       break;
    }

    StaticJsonDocument<200> doc;
    doc["state"]       = stateStr;
    doc["doorOpen"]    = doorPhysicallyOpen;
    doc["pirBlocked"]  = (digitalRead(PIR_PIN) == HIGH);
    doc["pirClear"]    = pirClear;
    doc["busId"]       = busId;
    doc["accidentType"]= accidentType;

    String json;
    serializeJson(doc, json);

    AsyncWebServerResponse* res = req->beginResponse(200, "application/json", json);
    res->addHeader("Access-Control-Allow-Origin", "*");
    req->send(res);
  });

  server.begin();
  Serial.println("[HTTP] Door server ready on port 81");

  // ── FreeRTOS Task ──────────────────────────────────────────
  xTaskCreatePinnedToCore(
    doorTask,    // function
    "DoorTask",  // name
    4096,        // stack
    NULL,        // params
    1,           // priority
    NULL,        // handle
    0            // Core 0
  );

  lcdPrint("  SISURAKSHA   ", " System Ready  ");
  Serial.println("[READY] Door system online");
}

// =============================================================
// LOOP — Core 1 — WiFi watchdog only
// =============================================================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Dropped — reconnecting...");
    WiFi.reconnect();
    delay(5000);
  }
  vTaskDelay(pdMS_TO_TICKS(5000));
}
