#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <LiquidCrystal_I2C.h>
#include <HardwareSerial.h>
#include <DFRobotDFPlayerMini.h>
#include <TinyGPSPlus.h>
#include <SoftwareSerial.h>
#include <WiFi.h>
#include <HTTPClient.h>

// =====================================================
// WIFI + BACKEND STREAMING
// =====================================================
const char* WIFI_SSID     = "SLT_FIBER_PYt5z";
const char* WIFI_PASSWORD = "07726Padumapks";

// Change this when your laptop/backend IP changes.
const char* SISURAKSHA_SERVER_HOST = "192.168.1.17";
const uint16_t NODE_SERVER_PORT = 5000;
const char* DRIVER_ID = "8c394627-e397-4bd5-928f-4cc66cfebac1";
const char* DOOR_ESP32_URL = "http://192.168.1.83";

const unsigned long LIVE_POST_INTERVAL_MS = 1000;
const unsigned long COMMAND_POLL_INTERVAL_MS = 1000;
unsigned long lastLivePostMs = 0;
unsigned long lastCommandPollMs = 0;

// =====================================================
// I2C MODULES: MPU6050 + LCD
// =====================================================
#define SDA_PIN 21
#define SCL_PIN 22

Adafruit_MPU6050 mpu;
LiquidCrystal_I2C lcd(0x27, 16, 2);

// =====================================================
// ANALOG SENSORS
// =====================================================
#define MQ2_AO   34
#define RAIN_AO  35
#define FSR1_AO  36
#define FSR2_AO  39

// =====================================================
// DIGITAL SENSORS
// =====================================================
#define FIRE_DO        26
#define VIBRATION1_DO  32
#define VIBRATION2_DO  33
#define BUTTON_PIN     23

// =====================================================
// DFPLAYER MINI
// =====================================================
HardwareSerial dfSerial(1);
DFRobotDFPlayerMini dfplayer;

#define DF_RX 13   // ESP32 RX <- DFPlayer TX
#define DF_TX 14   // ESP32 TX -> DFPlayer RX

bool dfplayerReady = false;

// =====================================================
// AIR780E 4G LTE MODULE
// =====================================================
HardwareSerial air780(2);

#define AIR780_RX 16   // ESP32 RX2 <- Air780E TXD
#define AIR780_TX 17   // ESP32 TX2 -> Air780E RXD

String receiverNumber = "+94756469929";

// =====================================================
// NEO-M8N GPS
// =====================================================
TinyGPSPlus gps;

#define GPS_RX 4
#define GPS_TX 5   // Not connected physically

SoftwareSerial gpsSerial(GPS_RX, GPS_TX);

// =====================================================
// THRESHOLDS
// =====================================================
float tiltThreshold = 30.0;

int mq2FireThreshold = 2200;
int rainWaterThreshold = 1800;
int fsrThreshold = 1500;

float suddenDecelThreshold = -5.0;

bool FIRE_ACTIVE_LOW = true;
bool VIBRATION_ACTIVE_HIGH = true;

// =====================================================
// ALERT SETTINGS
// =====================================================
const unsigned long cancelTimeMs = 60000;   // 60 seconds

bool alertActive = false;
bool alertSent = false;

unsigned long alertStartTime = 0;

String currentAlertType = "";
String currentAlertMessage = "";
int currentAudioFile = 0;

#define ALERT_NONE     0
#define ALERT_ACCIDENT 1
#define ALERT_FIRE     2
#define ALERT_WATER    3

int currentAlertCode = ALERT_NONE;

// =====================================================
// LIVE STATE FOR BACKEND
// =====================================================
float liveRoll = 0.0;
float livePitch = 0.0;
float liveAx = 0.0;
float liveAy = 0.0;
float liveAz = 0.0;
int liveMq2Value = 0;
int liveRainValue = 0;
int liveFsr1Value = 0;
int liveFsr2Value = 0;
int liveFireValue = HIGH;
int liveVib1Value = LOW;
int liveVib2Value = LOW;
bool liveTiltDetected = false;
bool livePressureDetected = false;
bool liveVibrationDetected = false;
bool liveSuddenDecelDetected = false;
bool liveFireDetected = false;
bool liveSmokeDetected = false;
bool liveWaterDetected = false;
unsigned long liveRemainingSeconds = 0;

// =====================================================
// AUDIO REPEAT SETTINGS
// =====================================================
unsigned long lastAudioPlayTime = 0;
const unsigned long audioRepeatInterval = 5000; // repeat every 5 seconds
const unsigned long alertRearmDelayMs = 15000;  // avoid immediate re-trigger after cancel
unsigned long alertSuppressedUntilMs = 0;

// =====================================================
// LCD HELPER
// =====================================================
void showLCD(String line1, String line2) {
  static String lastLine1 = "";
  static String lastLine2 = "";

  if (line1 == lastLine1 && line2 == lastLine2) {
    return;
  }

  lastLine1 = line1;
  lastLine2 = line2;

  lcd.clear();

  lcd.setCursor(0, 0);
  if (line1.length() > 16) {
    lcd.print(line1.substring(0, 16));
  } else {
    lcd.print(line1);
  }

  lcd.setCursor(0, 1);
  if (line2.length() > 16) {
    lcd.print(line2.substring(0, 16));
  } else {
    lcd.print(line2);
  }
}

// =====================================================
// AIR780E FUNCTIONS
// =====================================================
String readAirResponse(unsigned long timeout) {
  String response = "";
  unsigned long startTime = millis();

  while (millis() - startTime < timeout) {
    while (air780.available()) {
      char c = air780.read();
      response += c;
      Serial.write(c);
    }
  }

  return response;
}

String sendAirCommand(String cmd, unsigned long waitTime = 1000) {
  Serial.print("\nAir780E Command: ");
  Serial.println(cmd);

  air780.println(cmd);
  return readAirResponse(waitTime);
}

bool waitForNetwork(unsigned long timeoutMs) {
  unsigned long startTime = millis();

  Serial.println("Checking Air780E network...");

  while (millis() - startTime < timeoutMs) {
    sendAirCommand("AT", 1000);
    sendAirCommand("AT+CPIN?", 1000);
    sendAirCommand("AT+CSQ", 1000);

    String cregResponse = sendAirCommand("AT+CREG?", 1000);
    String ceregResponse = sendAirCommand("AT+CEREG?", 1000);

    if (
      cregResponse.indexOf("+CREG: 0,1") != -1 ||
      cregResponse.indexOf("+CREG: 0,5") != -1 ||
      ceregResponse.indexOf("+CEREG: 0,1") != -1 ||
      ceregResponse.indexOf("+CEREG: 0,5") != -1 ||
      ceregResponse.indexOf("+CEREG: 1") != -1 ||
      ceregResponse.indexOf("+CEREG: 5") != -1
    ) {
      Serial.println("Air780E Network Registered.");
      return true;
    }

    Serial.println("Network not registered yet...");
    delay(5000);
  }

  Serial.println("Network registration timeout.");
  return false;
}

void sendSMS(String number, String message) {
  Serial.println("\n===== SENDING SMS =====");

  sendAirCommand("AT", 1000);
  sendAirCommand("AT+CMGF=1", 1000);
  sendAirCommand("AT+CSCS=\"GSM\"", 1000);

  air780.print("AT+CMGS=\"");
  air780.print(number);
  air780.println("\"");

  String promptResponse = readAirResponse(5000);

  if (promptResponse.indexOf(">") == -1) {
    Serial.println("No > prompt received. SMS failed.");
    return;
  }

  air780.print(message);
  delay(500);

  air780.write(26);   // CTRL + Z

  Serial.println("CTRL+Z sent. Waiting for SMS response...");

  String finalResponse = readAirResponse(30000);

  if (finalResponse.indexOf("+CMGS:") != -1 && finalResponse.indexOf("OK") != -1) {
    Serial.println("SMS SENT SUCCESSFULLY.");
  } else {
    Serial.println("SMS may have failed.");
  }
}

void makeCall(String number) {
  Serial.println("\n===== CALL STARTING =====");
  Serial.print("Calling: ");
  Serial.println(number);

  air780.print("ATD");
  air780.print(number);
  air780.println(";");

  String response = readAirResponse(8000);

  if (response.indexOf("OK") != -1) {
    Serial.println("Call command accepted.");
  } else if (response.indexOf("ERROR") != -1) {
    Serial.println("Call command failed. Air780E may not support voice call.");
    return;
  } else {
    Serial.println("Call command sent.");
  }

  showLCD("CALLING NUMBER", "Emergency Alert");

  delay(20000);

  sendAirCommand("ATH", 1000);
  Serial.println("Call ended.");
}

// =====================================================
// GPS FUNCTIONS
// =====================================================
void updateGPS() {
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }
}

String getGPSLink() {
  if (gps.location.isValid()) {
    String lat = String(gps.location.lat(), 6);
    String lng = String(gps.location.lng(), 6);
    return "https://maps.google.com/?q=" + lat + "," + lng;
  }

  return "GPS location not available yet";
}

void printGPSStatus() {
  if (gps.location.isValid()) {
    Serial.print("GPS: ");
    Serial.print(gps.location.lat(), 6);
    Serial.print(",");
    Serial.println(gps.location.lng(), 6);

    Serial.print("Google Maps: ");
    Serial.println(getGPSLink());
  } else {
    Serial.println("GPS: Location not fixed yet");
  }

  if (gps.satellites.isValid()) {
    Serial.print("Satellites: ");
    Serial.println(gps.satellites.value());
  } else {
    Serial.println("Satellites: 0");
  }
}

String jsonString(String value) {
  value.replace("\\", "\\\\");
  value.replace("\"", "\\\"");
  value.replace("\n", " ");
  value.replace("\r", " ");
  return "\"" + value + "\"";
}

String buildBackendUrl(const char* path) {
  String url = "http://";
  url += SISURAKSHA_SERVER_HOST;
  url += ":";
  url += String(NODE_SERVER_PORT);
  url += path;
  return url;
}

void postJSON(const String& url, const String& body, const char* label) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(700);

  int code = http.POST(body);
  if (code >= 200 && code < 300) {
    Serial.printf("[%s] Posted OK\n", label);
  } else {
    Serial.printf("[%s] POST failed: %d\n", label, code);
  }

  http.end();
}

String buildSensorJSON() {
  String j = "{";
  j += "\"roll\":" + String(liveRoll, 2) + ",";
  j += "\"pitch\":" + String(livePitch, 2) + ",";
  j += "\"ax\":" + String(liveAx, 3) + ",";
  j += "\"ay\":" + String(liveAy, 3) + ",";
  j += "\"az\":" + String(liveAz, 3) + ",";
  j += "\"mq2\":" + String(liveMq2Value) + ",";
  j += "\"rain\":" + String(liveRainValue) + ",";
  j += "\"fsr1\":" + String(liveFsr1Value) + ",";
  j += "\"fsr2\":" + String(liveFsr2Value) + ",";
  j += "\"fire_do\":" + String(liveFireValue) + ",";
  j += "\"vibration1_do\":" + String(liveVib1Value) + ",";
  j += "\"vibration2_do\":" + String(liveVib2Value) + ",";
  j += "\"tilt\":" + String(liveTiltDetected ? "true" : "false") + ",";
  j += "\"pressure\":" + String(livePressureDetected ? "true" : "false") + ",";
  j += "\"vibration\":" + String(liveVibrationDetected ? "true" : "false") + ",";
  j += "\"sudden_decel\":" + String(liveSuddenDecelDetected ? "true" : "false") + ",";
  j += "\"fire\":" + String(liveFireDetected ? "true" : "false") + ",";
  j += "\"smoke\":" + String(liveSmokeDetected ? "true" : "false") + ",";
  j += "\"water\":" + String(liveWaterDetected ? "true" : "false") + ",";
  j += "\"gps_valid\":" + String(gps.location.isValid() ? "true" : "false") + ",";
  j += "\"lat\":" + String(gps.location.isValid() ? gps.location.lat() : 0.0, 6) + ",";
  j += "\"lng\":" + String(gps.location.isValid() ? gps.location.lng() : 0.0, 6) + ",";
  j += "\"satellites\":" + String(gps.satellites.isValid() ? gps.satellites.value() : 0);
  j += "}";
  return j;
}

String buildLiveStateJSON() {
  bool anyDanger =
    liveTiltDetected ||
    livePressureDetected ||
    liveVibrationDetected ||
    liveSuddenDecelDetected ||
    liveFireDetected ||
    liveSmokeDetected ||
    liveWaterDetected;

  String j = "{";
  j += "\"driver_id\":\"";
  j += DRIVER_ID;
  j += "\",";
  j += "\"online\":true,";
  j += "\"alert_active\":" + String(alertActive ? "true" : "false") + ",";
  j += "\"alert_code\":" + String(currentAlertCode) + ",";
  j += "\"alert_type\":" + jsonString(currentAlertType) + ",";
  j += "\"alert_message\":" + jsonString(currentAlertMessage) + ",";
  j += "\"remaining_seconds\":" + String(liveRemainingSeconds) + ",";
  j += "\"any_danger\":" + String(anyDanger ? "true" : "false") + ",";
  j += "\"sensor_data\":" + buildSensorJSON() + ",";
  j += "\"ts\":" + String(millis());
  j += "}";
  return j;
}

void postLiveState(bool force = false) {
  unsigned long nowMs = millis();
  if (!force && nowMs - lastLivePostMs < LIVE_POST_INTERVAL_MS) {
    return;
  }
  lastLivePostMs = nowMs;
  postJSON(buildBackendUrl("/api/accident/live-state"), buildLiveStateJSON(), "AccidentLive");
}

void postAccidentAlert(String status) {
  String evidence = "";
  if (liveTiltDetected) evidence += "TILT ";
  if (livePressureDetected) evidence += "PRESSURE ";
  if (liveVibrationDetected) evidence += "VIBRATION ";
  if (liveSuddenDecelDetected) evidence += "SUDDEN_DECEL ";
  if (liveFireDetected) evidence += "FIRE_SENSOR ";
  if (liveSmokeDetected) evidence += "SMOKE ";
  if (liveWaterDetected) evidence += "WATER ";
  evidence.trim();

  String j = "{";
  j += "\"driver_id\":\"";
  j += DRIVER_ID;
  j += "\",";
  j += "\"alertType\":" + jsonString(currentAlertType.length() ? currentAlertType : "ACCIDENT") + ",";
  j += "\"status\":" + jsonString(status) + ",";
  j += "\"confidence\":100,";
  j += "\"evidence\":" + jsonString(evidence) + ",";
  j += "\"sensorData\":" + buildSensorJSON();
  j += "}";

  postJSON(buildBackendUrl("/api/accident/alert"), j, "AccidentAlert");
}

void postAccidentCancel() {
  String j = "{";
  j += "\"driver_id\":\"";
  j += DRIVER_ID;
  j += "\"";
  j += "}";
  postJSON(buildBackendUrl("/api/accident/cancel"), j, "AccidentCancel");
}

void commandEmergencyDoorOpen() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Door] WiFi offline. Cannot command emergency door.");
    return;
  }

  String url = String(DOOR_ESP32_URL) + "/open";
  String j = "{";
  j += "\"busId\":\"UNKNOWN\",";
  j += "\"alertType\":";
  j += jsonString(currentAlertType.length() ? currentAlertType : "ACCIDENT");
  j += "}";

  postJSON(url, j, "DoorOpen");
}

bool pollCancelCommand() {
  if (WiFi.status() != WL_CONNECTED || !alertActive) {
    return false;
  }

  unsigned long nowMs = millis();
  if (nowMs - lastCommandPollMs < COMMAND_POLL_INTERVAL_MS) {
    return false;
  }
  lastCommandPollMs = nowMs;

  String url = buildBackendUrl("/api/accident/command?driver_id=");
  url += DRIVER_ID;

  HTTPClient http;
  http.begin(url);
  http.setTimeout(500);
  int code = http.GET();
  bool cancelRequested = false;

  if (code == 200) {
    String body = http.getString();
    cancelRequested = body.indexOf("\"cancelRequested\":true") >= 0;
    if (cancelRequested) {
      Serial.println("[COMMAND] Cancel requested from frontend.");
    }
  }

  http.end();
  return cancelRequested;
}

void setupWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi failed. Accident monitoring continues without backend stream.");
  }
}

// =====================================================
// AUDIO FUNCTION
// =====================================================
void playWarningAudio(int audioFile) {
  if (dfplayerReady && audioFile > 0) {
    Serial.print("Playing audio file: ");
    Serial.println(audioFile);
    dfplayer.play(audioFile);
    lastAudioPlayTime = millis();
  } else {
    Serial.println("Audio skipped. DFPlayer not ready.");
  }
}

void repeatWarningAudioIfNeeded() {
  if (dfplayerReady && currentAudioFile > 0) {
    if (millis() - lastAudioPlayTime >= audioRepeatInterval) {
      Serial.print("Repeating audio file: ");
      Serial.println(currentAudioFile);
      dfplayer.play(currentAudioFile);
      lastAudioPlayTime = millis();
    }
  }
}

// =====================================================
// ALERT START FUNCTION
// =====================================================
void startAlert(int alertCode, String alertType, String alertMessage, int audioFile) {
  if (alertActive) {
    return;
  }

  if (millis() < alertSuppressedUntilMs) {
    Serial.println("Alert condition still present, but countdown is suppressed after cancel.");
    return;
  }

  alertActive = true;
  alertSent = false;

  currentAlertCode = alertCode;
  currentAlertType = alertType;
  currentAlertMessage = alertMessage;
  currentAudioFile = audioFile;

  alertStartTime = millis();

  Serial.println("\n======================================");
  Serial.println("ALERT DETECTED");
  Serial.print("Type: ");
  Serial.println(currentAlertType);
  Serial.print("Message: ");
  Serial.println(currentAlertMessage);
  Serial.println("60 seconds cancel timer started.");
  Serial.println("Press push button to cancel false alert.");
  Serial.println("======================================");

  showLCD(currentAlertType, "Cancel: 60s");

  playWarningAudio(currentAudioFile);
  liveRemainingSeconds = cancelTimeMs / 1000;
  postAccidentAlert("PENDING");
  postLiveState(true);
}

// =====================================================
// CANCEL ALERT
// =====================================================
void cancelAlert() {
  Serial.println("\n======================================");
  Serial.println("ALERT CANCELLED BY DRIVER");
  Serial.println("System returned to normal monitoring.");
  Serial.println("======================================");

  showLCD("Alert Cancelled", "System Normal");

  alertActive = false;
  alertSent = false;
  currentAlertCode = ALERT_NONE;
  currentAlertType = "";
  currentAlertMessage = "";
  currentAudioFile = 0;
  liveRemainingSeconds = 0;
  alertSuppressedUntilMs = millis() + alertRearmDelayMs;

  postAccidentCancel();
  postLiveState(true);
  delay(2000);
}

// =====================================================
// CONFIRM ALERT AFTER 60 SECONDS
// =====================================================
void confirmAlert() {
  Serial.println("\n======================================");
  Serial.println("ALERT CONFIRMED");
  Serial.print("Confirmed Type: ");
  Serial.println(currentAlertType);
  Serial.println("Sending SMS and calling emergency number...");
  Serial.println("======================================");

  showLCD("ALERT CONFIRMED", "SMS + Call");
  postAccidentAlert("CONFIRMED");
  postLiveState(true);
  commandEmergencyDoorOpen();

  String smsMessage = "SISURAKSHA ALERT: ";
  smsMessage += currentAlertType;
  smsMessage += ". ";
  smsMessage += currentAlertMessage;
  smsMessage += ". Location: ";
  smsMessage += getGPSLink();

  if (!alertSent) {
    if (waitForNetwork(60000)) {
      sendSMS(receiverNumber, smsMessage);
      delay(3000);
      makeCall(receiverNumber);
      alertSent = true;
    } else {
      Serial.println("SMS/Call not sent. Air780E network not registered.");
      showLCD("Call Failed", "No Network");
      delay(3000);
    }
  }

  alertActive = false;
  alertSent = false;
  currentAlertCode = ALERT_NONE;
  currentAlertType = "";
  currentAlertMessage = "";
  currentAudioFile = 0;
  liveRemainingSeconds = 0;

  showLCD("SISURAKSHA", "Monitoring...");
  postLiveState(true);
}

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("======================================");
  Serial.println("SISURAKSHA ACCIDENT DETECTION SYSTEM");
  Serial.println("======================================");

  setupWiFi();

  pinMode(FIRE_DO, INPUT);
  pinMode(VIBRATION1_DO, INPUT);
  pinMode(VIBRATION2_DO, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  Wire.begin(SDA_PIN, SCL_PIN);

  lcd.init();
  lcd.backlight();

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SISURAKSHA");
  lcd.setCursor(0, 1);
  lcd.print("LCD TEST OK");
  delay(3000);

  showLCD("SISURAKSHA", "Starting...");
  delay(1500);

  Serial.println("Initializing MPU6050...");

  if (!mpu.begin()) {
    Serial.println("MPU6050 not found. Check wiring!");
    showLCD("MPU6050 ERROR", "Check Wiring");
    while (1) {
      delay(10);
    }
  }

  Serial.println("MPU6050 detected.");

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  dfSerial.begin(9600, SERIAL_8N1, DF_RX, DF_TX);

  Serial.println("Initializing DFPlayer Mini...");

  if (!dfplayer.begin(dfSerial)) {
    Serial.println("DFPlayer not detected. System will continue without sound.");
    showLCD("DFPlayer Error", "No Sound Mode");
    dfplayerReady = false;
    delay(2000);
  } else {
    Serial.println("DFPlayer detected.");
    dfplayer.volume(25);
    dfplayerReady = true;
  }

  air780.begin(9600, SERIAL_8N1, AIR780_RX, AIR780_TX);

  Serial.println("Initializing Air780E...");
  showLCD("Air780E", "Starting...");
  delay(10000);

  sendAirCommand("AT", 1000);
  sendAirCommand("AT+CMEE=2", 1000);
  sendAirCommand("AT+CPIN?", 1000);
  sendAirCommand("AT+CSQ", 1000);
  sendAirCommand("AT+CREG?", 1000);
  sendAirCommand("AT+CEREG?", 1000);

  gpsSerial.begin(9600);

  Serial.println("NEO-M8N GPS started.");
  Serial.println("System Ready.");

  showLCD("SISURAKSHA", "Monitoring...");
  delay(1500);
}

// =====================================================
// LOOP
// =====================================================
void loop() {
  updateGPS();

  int mq2Value = analogRead(MQ2_AO);
  int rainValue = analogRead(RAIN_AO);
  int fsr1Value = analogRead(FSR1_AO);
  int fsr2Value = analogRead(FSR2_AO);

  int fireValue = digitalRead(FIRE_DO);
  int vib1Value = digitalRead(VIBRATION1_DO);
  int vib2Value = digitalRead(VIBRATION2_DO);
  int buttonValue = digitalRead(BUTTON_PIN);

  sensors_event_t acc, gyro, temp;
  mpu.getEvent(&acc, &gyro, &temp);

  float ax = acc.acceleration.x;
  float ay = acc.acceleration.y;
  float az = acc.acceleration.z;

  float roll = atan2(ay, az) * 180.0 / PI;
  float pitch = atan2(-ax, sqrt((ay * ay) + (az * az))) * 180.0 / PI;

  bool tiltDetected = abs(roll) >= tiltThreshold || abs(pitch) >= tiltThreshold;
  bool pressureDetected = fsr1Value > fsrThreshold || fsr2Value > fsrThreshold;

  bool vibration1Detected;
  bool vibration2Detected;

  if (VIBRATION_ACTIVE_HIGH) {
    vibration1Detected = vib1Value == HIGH;
    vibration2Detected = vib2Value == HIGH;
  } else {
    vibration1Detected = vib1Value == LOW;
    vibration2Detected = vib2Value == LOW;
  }

  bool vibrationDetected = vibration1Detected || vibration2Detected;
  bool suddenDecelDetected = ax <= suddenDecelThreshold;

  bool fireDetected;
  if (FIRE_ACTIVE_LOW) {
    fireDetected = fireValue == LOW;
  } else {
    fireDetected = fireValue == HIGH;
  }

  bool smokeDetected = mq2Value >= mq2FireThreshold;
  bool waterDetected = rainValue <= rainWaterThreshold;
  bool buttonPressed = buttonValue == LOW;

  liveRoll = roll;
  livePitch = pitch;
  liveAx = ax;
  liveAy = ay;
  liveAz = az;
  liveMq2Value = mq2Value;
  liveRainValue = rainValue;
  liveFsr1Value = fsr1Value;
  liveFsr2Value = fsr2Value;
  liveFireValue = fireValue;
  liveVib1Value = vib1Value;
  liveVib2Value = vib2Value;
  liveTiltDetected = tiltDetected;
  livePressureDetected = pressureDetected;
  liveVibrationDetected = vibrationDetected;
  liveSuddenDecelDetected = suddenDecelDetected;
  liveFireDetected = fireDetected;
  liveSmokeDetected = smokeDetected;
  liveWaterDetected = waterDetected;

  Serial.println("--------------------------------------");
  Serial.print("Roll: ");
  Serial.print(roll);
  Serial.print(" | Pitch: ");
  Serial.println(pitch);

  Serial.print("Accel X: ");
  Serial.print(ax);
  Serial.print(" | Y: ");
  Serial.print(ay);
  Serial.print(" | Z: ");
  Serial.println(az);

  Serial.print("MQ2 AO: ");
  Serial.println(mq2Value);

  Serial.print("Rain AO: ");
  Serial.println(rainValue);

  Serial.print("FSR1: ");
  Serial.print(fsr1Value);
  Serial.print(" | FSR2: ");
  Serial.println(fsr2Value);

  Serial.print("Fire DO: ");
  Serial.println(fireValue);

  Serial.print("Vibration1: ");
  Serial.print(vib1Value);
  Serial.print(" | Vibration2: ");
  Serial.println(vib2Value);

  Serial.print("Button: ");
  Serial.println(buttonValue);

  printGPSStatus();

  Serial.print("DFPlayer Ready: ");
  Serial.println(dfplayerReady ? "YES" : "NO");

  if (alertActive) {
    unsigned long elapsed = millis() - alertStartTime;
    unsigned long remaining = 0;

    if (elapsed < cancelTimeMs) {
      remaining = (cancelTimeMs - elapsed) / 1000;
    }
    liveRemainingSeconds = remaining;
    postLiveState();

    Serial.print("ALERT ACTIVE: ");
    Serial.println(currentAlertType);
    Serial.print("Remaining cancel time: ");
    Serial.print(remaining);
    Serial.println(" seconds");

    showLCD(currentAlertType, "Cancel: " + String(remaining) + "s");

    repeatWarningAudioIfNeeded();

    if (buttonPressed || pollCancelCommand()) {
      cancelAlert();
      delay(500);
      return;
    }

    if (elapsed >= cancelTimeMs) {
      confirmAlert();
      delay(500);
      return;
    }

    delay(1000);
    return;
  }

  if (fireDetected) {
    startAlert(ALERT_FIRE, "FIRE DETECT", "Fire sensor triggered", 2);
  } 
  else if (smokeDetected) {
    startAlert(ALERT_FIRE, "FIRE DETECT", "High smoke/gas detected", 2);
  } 
  else if (waterDetected) {
    startAlert(ALERT_WATER, "WATER DAMAGE", "Water detected", 3);
  } 
  else if (tiltDetected) {
    startAlert(ALERT_ACCIDENT, "ACCIDENT", "Bus tilted over 30 degrees", 1);
  } 
  else if (pressureDetected && vibrationDetected) {
    startAlert(ALERT_ACCIDENT, "ACCIDENT", "Pressure and vibration detected", 1);
  } 
  else if (suddenDecelDetected) {
    startAlert(ALERT_ACCIDENT, "ACCIDENT", "Sudden speed reduction detected", 1);
  } 
  else {
    liveRemainingSeconds = 0;
    postLiveState();
    showLCD("SISURAKSHA", "Monitoring...");
    Serial.println("System Status: Normal monitoring");
  }

  delay(1000);
}
