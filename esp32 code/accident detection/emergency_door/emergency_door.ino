// =====================================================
// SISURAKSHA - Emergency Door Controller
// Receives accident confirmation from backend/accident ESP32.
// Uses speed pushed from IR/speed ESP32, checks two ultrasonic
// sensors, then unlocks only when safe.
//
// Backend calls:
//   POST /open   -> start emergency door safety check
//   POST /reset  -> cancel/clear door state
//   GET  /status -> latest door state for backend/app
//
// Speed source:
//   ir_speed_dfplayer_test.ino posts to /speed
// =====================================================

#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DFRobotDFPlayerMini.h>

// ===================== WIFI SETTINGS =====================

const char* WIFI_SSID = "SLT_FIBER_PYt5z";
const char* WIFI_PASSWORD = "07726Padumapks";

// ===================== PIN SETTINGS =====================

#define SDA_PIN 21
#define SCL_PIN 22

#define RELAY_PIN 26

#define TRIG1_PIN 32
#define ECHO1_PIN 34

#define TRIG2_PIN 23
#define ECHO2_PIN 33

#define DFPLAYER_RX 16  // ESP32 RX2 <- DFPlayer TX
#define DFPLAYER_TX 17  // ESP32 TX2 -> DFPlayer RX through 1k resistor

// ===================== OBJECTS =====================

WebServer server(80);
LiquidCrystal_I2C lcd(0x27, 16, 2);
HardwareSerial dfSerial(2);
DFRobotDFPlayerMini dfPlayer;

// ===================== SETTINGS =====================

bool relayActiveLow = false;

float detectDistanceCM = 20.0;
float safeSpeedKmh = 0.5;

unsigned long lockOpenTimeMs = 5000;
unsigned long cooldownTimeMs = 2500;
unsigned long safetyCheckIntervalMs = 300;
unsigned long speedStaleTimeoutMs = 3000;

bool dfPlayerReady = false;

// ===================== STATE =====================

enum DoorState {
  DOOR_IDLE,
  DOOR_WAITING,
  DOOR_CHECKING,
  DOOR_OPENING,
  DOOR_UNLOCKED,
  DOOR_BLOCKED,
  DOOR_MOVING,
  DOOR_CANCELLED
};

DoorState doorState = DOOR_IDLE;

unsigned long accidentStartedAt = 0;
unsigned long lastTriggerTime = 0;
unsigned long doorOpenedAt = 0;
unsigned long lastSafetyCheckMs = 0;
unsigned long lastSpeedUpdateMs = 0;

String busId = "";
String accidentType = "";
String lastMessage = "System ready";

float distance1CM = -1;
float distance2CM = -1;
float lastSpeedKmh = 0.0;
bool lastMoving = false;
bool lastSpeedOnline = false;

// ===================== HELPERS =====================

String jsonString(String value) {
  value.replace("\\", "\\\\");
  value.replace("\"", "\\\"");
  value.replace("\n", " ");
  value.replace("\r", " ");
  return "\"" + value + "\"";
}

bool parseJsonBool(const String& json, const char* key, bool fallback) {
  String quotedKey = "\"";
  quotedKey += key;
  quotedKey += "\"";

  int keyIndex = json.indexOf(quotedKey);
  if (keyIndex < 0) return fallback;

  int colonIndex = json.indexOf(':', keyIndex + quotedKey.length());
  if (colonIndex < 0) return fallback;

  int valueIndex = colonIndex + 1;
  while (valueIndex < json.length() && isspace(json[valueIndex])) {
    valueIndex++;
  }

  if (json.startsWith("true", valueIndex)) return true;
  if (json.startsWith("false", valueIndex)) return false;
  if (json.startsWith("1", valueIndex)) return true;
  if (json.startsWith("0", valueIndex)) return false;
  return fallback;
}

float parseJsonFloat(const String& json, const char* key, float fallback) {
  String quotedKey = "\"";
  quotedKey += key;
  quotedKey += "\"";

  int keyIndex = json.indexOf(quotedKey);
  if (keyIndex < 0) return fallback;

  int colonIndex = json.indexOf(':', keyIndex + quotedKey.length());
  if (colonIndex < 0) return fallback;

  int valueIndex = colonIndex + 1;
  while (valueIndex < json.length() && isspace(json[valueIndex])) {
    valueIndex++;
  }

  return json.substring(valueIndex).toFloat();
}

String parseJsonString(const String& json, const char* key, String fallback) {
  String quotedKey = "\"";
  quotedKey += key;
  quotedKey += "\"";

  int keyIndex = json.indexOf(quotedKey);
  if (keyIndex < 0) return fallback;

  int colonIndex = json.indexOf(':', keyIndex + quotedKey.length());
  if (colonIndex < 0) return fallback;

  int valueIndex = json.indexOf('"', colonIndex + 1);
  if (valueIndex < 0) return fallback;

  int endIndex = json.indexOf('"', valueIndex + 1);
  if (endIndex < 0) return fallback;

  return json.substring(valueIndex + 1, endIndex);
}

const char* stateName() {
  switch (doorState) {
    case DOOR_IDLE: return "IDLE";
    case DOOR_WAITING: return "ACCIDENT";
    case DOOR_CHECKING: return "ACCIDENT";
    case DOOR_OPENING: return "OPENING";
    case DOOR_UNLOCKED: return "OPEN";
    case DOOR_BLOCKED: return "PIR_BLOCKED";
    case DOOR_MOVING: return "MOVING";
    case DOOR_CANCELLED: return "RESET";
    default: return "UNKNOWN";
  }
}

unsigned long remainingSeconds() {
  return 0;
}

// ===================== DISPLAY =====================

void showStatus(String line1, String line2) {
  static String lastLine1 = "";
  static String lastLine2 = "";

  if (line1 == lastLine1 && line2 == lastLine2) return;

  lastLine1 = line1;
  lastLine2 = line2;

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
}

// ===================== RELAY =====================

void relayOn() {
  digitalWrite(RELAY_PIN, relayActiveLow ? LOW : HIGH);
}

void relayOff() {
  digitalWrite(RELAY_PIN, relayActiveLow ? HIGH : LOW);
}

// ===================== SENSORS =====================

float readDistanceCM(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000);
  if (duration == 0) return -1;

  return duration * 0.0343 / 2.0;
}

bool objectDetected() {
  distance1CM = readDistanceCM(TRIG1_PIN, ECHO1_PIN);
  delay(70);
  distance2CM = readDistanceCM(TRIG2_PIN, ECHO2_PIN);

  bool sensor1Detected = distance1CM > 0 && distance1CM <= detectDistanceCM;
  bool sensor2Detected = distance2CM > 0 && distance2CM <= detectDistanceCM;

  Serial.print("[Ultrasonic] S1=");
  Serial.print(distance1CM);
  Serial.print("cm | S2=");
  Serial.print(distance2CM);
  Serial.println("cm");

  return sensor1Detected || sensor2Detected;
}

// ===================== SOUND =====================

void playTrack(int track) {
  if (dfPlayerReady) {
    dfPlayer.play(track);
  }
}

// ===================== DOOR LOGIC =====================

void unlockDoor() {
  doorState = DOOR_OPENING;
  doorOpenedAt = millis();
  lastMessage = "Door unlocked";

  Serial.println("[Door] Unlocking emergency door");
  showStatus("Door Unlocking", "Emergency Open");
  playTrack(1);

  relayOn();
}

void blockDoor(String reason) {
  DoorState nextState = (reason == "Bus moving" || reason == "Speed offline") ? DOOR_MOVING : DOOR_BLOCKED;
  bool changed = doorState != nextState || lastMessage != reason;

  relayOff();
  doorState = nextState;
  lastMessage = reason;

  if (changed) {
    Serial.print("[Door] Not unlocked: ");
    Serial.println(reason);
  }

  showStatus("Door Locked", reason);

  if (changed) {
    playTrack(2);
  }
}

void startEmergencyCountdown(String requestBusId, String requestAccidentType) {
  if (millis() - lastTriggerTime < cooldownTimeMs) {
    Serial.println("[Door] Ignored open request during cooldown");
    return;
  }

  busId = requestBusId;
  accidentType = requestAccidentType;
  accidentStartedAt = millis();
  doorState = DOOR_CHECKING;
  lastMessage = "Checking safety";
  lastTriggerTime = millis();
  lastSafetyCheckMs = 0;

  Serial.println("[Door] Accident received. Checking speed and ultrasonic sensors now.");
  showStatus("Accident Alert", "Checking Safe");
  playTrack(3);
}

void resetDoor() {
  relayOff();
  doorState = DOOR_CANCELLED;
  lastMessage = "Reset received";
  accidentStartedAt = 0;
  doorOpenedAt = 0;

  Serial.println("[Door] Reset received");
  showStatus("Door Reset", "System Ready");
}

bool speedDataFresh() {
  return lastSpeedOnline && lastSpeedUpdateMs > 0 && millis() - lastSpeedUpdateMs <= speedStaleTimeoutMs;
}

void checkSafetyAndMaybeUnlock() {
  unsigned long nowMs = millis();
  if (nowMs - lastSafetyCheckMs < safetyCheckIntervalMs) {
    return;
  }
  lastSafetyCheckMs = nowMs;

  bool speedFresh = speedDataFresh();
  bool busStopped = speedFresh && !lastMoving && lastSpeedKmh <= safeSpeedKmh;
  bool blocked = objectDetected();

  if (!speedFresh) {
    blockDoor("Speed offline");
  } else if (!busStopped) {
    blockDoor("Bus moving");
  } else if (blocked) {
    blockDoor("Object detected");
  } else {
    unlockDoor();
  }
}

void updateDoorState() {
  server.handleClient();

  if (doorState == DOOR_CHECKING || doorState == DOOR_BLOCKED || doorState == DOOR_MOVING) {
    checkSafetyAndMaybeUnlock();
  }

  if (doorState == DOOR_OPENING && millis() - doorOpenedAt >= 500) {
    doorState = DOOR_UNLOCKED;
    lastMessage = "Door open";
  }

  if ((doorState == DOOR_OPENING || doorState == DOOR_UNLOCKED) &&
      millis() - doorOpenedAt >= lockOpenTimeMs) {
    relayOff();
    doorState = DOOR_IDLE;
    lastMessage = "Door closed";
    Serial.println("[Door] Lock closed");
    showStatus("Lock Closed", "System Ready");
  }

  if (doorState == DOOR_CANCELLED &&
      millis() - lastTriggerTime >= cooldownTimeMs) {
    doorState = DOOR_IDLE;
    lastMessage = "System ready";
    showStatus("System Ready", "Waiting...");
  }
}

// ===================== HTTP SERVER =====================

String buildStatusJson() {
  String j = "{";
  j += "\"status\":\"";
  j += stateName();
  j += "\",";
  j += "\"state\":\"";
  j += stateName();
  j += "\",";
  bool doorOpen = doorState == DOOR_OPENING || doorState == DOOR_UNLOCKED;
  j += "\"doorOpen\":" + String(doorOpen ? "true" : "false") + ",";
  j += "\"locked\":" + String(doorOpen ? "false" : "true") + ",";
  j += "\"pirBlocked\":" + String((distance1CM > 0 && distance1CM <= detectDistanceCM) || (distance2CM > 0 && distance2CM <= detectDistanceCM) ? "true" : "false") + ",";
  j += "\"pirClear\":" + String((distance1CM <= 0 || distance1CM > detectDistanceCM) && (distance2CM <= 0 || distance2CM > detectDistanceCM) ? "true" : "false") + ",";
  j += "\"distance1_cm\":" + String(distance1CM, 1) + ",";
  j += "\"distance2_cm\":" + String(distance2CM, 1) + ",";
  j += "\"speed_kmh\":" + String(lastSpeedKmh, 2) + ",";
  j += "\"moving\":" + String(lastMoving ? "true" : "false") + ",";
  j += "\"speedOnline\":" + String(speedDataFresh() ? "true" : "false") + ",";
  j += "\"remaining_seconds\":" + String(remainingSeconds()) + ",";
  j += "\"busId\":" + jsonString(busId) + ",";
  j += "\"accidentType\":" + jsonString(accidentType) + ",";
  j += "\"message\":" + jsonString(lastMessage);
  j += "}";
  return j;
}

void sendJsonResponse(int code, String json) {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(code, "application/json", json);
}

void handleOpen() {
  String body = server.hasArg("plain") ? server.arg("plain") : "";
  String requestBusId = server.hasArg("busId")
    ? server.arg("busId")
    : parseJsonString(body, "busId", "UNKNOWN");
  String requestAccidentType = server.hasArg("alertType")
    ? server.arg("alertType")
    : parseJsonString(body, "alertType", "ACCIDENT");

  startEmergencyCountdown(
    requestBusId,
    requestAccidentType
  );

  sendJsonResponse(200, "{\"status\":\"success\",\"message\":\"Emergency door safety check started\"}");
}

void handleSpeed() {
  String body = server.hasArg("plain") ? server.arg("plain") : "";
  lastSpeedKmh = parseJsonFloat(body, "speed_kmh", lastSpeedKmh);
  lastMoving = parseJsonBool(body, "moving", lastSpeedKmh > safeSpeedKmh);
  lastSpeedOnline = true;
  lastSpeedUpdateMs = millis();

  Serial.print("[SpeedPush] ");
  Serial.print(lastSpeedKmh, 2);
  Serial.print(" km/h | moving=");
  Serial.println(lastMoving ? "YES" : "NO");

  sendJsonResponse(200, "{\"status\":\"success\",\"message\":\"Speed updated\"}");
}

void handleReset() {
  resetDoor();
  sendJsonResponse(200, "{\"status\":\"success\",\"message\":\"Door reset\"}");
}

void handleStatus() {
  sendJsonResponse(200, buildStatusJson());
}

void setupWebServer() {
  server.on("/open", HTTP_POST, handleOpen);
  server.on("/open", HTTP_GET, handleOpen);
  server.on("/reset", HTTP_POST, handleReset);
  server.on("/reset", HTTP_GET, handleReset);
  server.on("/speed", HTTP_POST, handleSpeed);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/", HTTP_GET, []() {
    server.send(200, "text/plain", "SISURAKSHA Emergency Door ESP32");
  });
  server.begin();
  Serial.println("[HTTP] Emergency door server ready");
}

// ===================== SETUP =====================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(SDA_PIN, SCL_PIN);
  lcd.init();
  lcd.backlight();
  showStatus("SISURAKSHA", "Door Starting");

  pinMode(RELAY_PIN, OUTPUT);
  relayOff();

  pinMode(TRIG1_PIN, OUTPUT);
  pinMode(ECHO1_PIN, INPUT);
  pinMode(TRIG2_PIN, OUTPUT);
  pinMode(ECHO2_PIN, INPUT);

  digitalWrite(TRIG1_PIN, LOW);
  digitalWrite(TRIG2_PIN, LOW);

  dfSerial.begin(9600, SERIAL_8N1, DFPLAYER_RX, DFPLAYER_TX);
  delay(1500);

  Serial.println("[DFPlayer] Starting...");
  if (dfPlayer.begin(dfSerial)) {
    dfPlayer.volume(25);
    dfPlayerReady = true;
    Serial.println("[DFPlayer] Ready");
  } else {
    dfPlayerReady = false;
    Serial.println("[DFPlayer] Not detected. Continuing without sound.");
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("[WiFi] Connecting");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Connected. Door ESP32 URL: http://");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WiFi] Failed. /open command will not work until WiFi reconnects.");
  }

  setupWebServer();
  showStatus("System Ready", "Waiting...");
}

// ===================== LOOP =====================

void loop() {
  updateDoorState();
  delay(50);
}
