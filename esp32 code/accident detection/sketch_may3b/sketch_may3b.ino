#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <LiquidCrystal_I2C.h>
#include <HardwareSerial.h>
#include <DFRobotDFPlayerMini.h>
#include <TinyGPSPlus.h>
#include <SoftwareSerial.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

// =====================================================
// WIFI + DASHBOARD
// =====================================================
const char* WIFI_SSID     = "SLT_FIBER_PYt5z";
const char* WIFI_PASSWORD = "07726Padumapks";

AsyncWebServer server(80);
AsyncEventSource events("/events");

const unsigned long DASHBOARD_BROADCAST_INTERVAL_MS = 500;
unsigned long lastDashboardBroadcastMs = 0;

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

// =====================================================
// NEW MODULE 1: OPTIMUS AIR780E 4G LTE MODULE
// =====================================================
HardwareSerial air780(2);

#define AIR780_RX 16   // ESP32 RX2 <- Air780E TXD
#define AIR780_TX 17   // ESP32 TX2 -> Air780E RXD

String receiverNumber = "+94756469929";   // change receiver number here

// =====================================================
// NEW MODULE 2: NEO-M8N GPS MODULE
// =====================================================
TinyGPSPlus gps;

#define GPS_RX 4       // ESP32 GPIO4 <- NEO-M8N TX
#define GPS_TX 5       // not connected physically

SoftwareSerial gpsSerial(GPS_RX, GPS_TX);

// =====================================================
// HTML Dashboard
// =====================================================
const char HTML_PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>SISURAKSHA Accident</title>
  <meta name='viewport' content='width=device-width,initial-scale=1'>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;background:#151923;color:#e5e7eb;margin:0;padding:15px}
    h1{color:#38bdf8;text-align:center;margin:0 0 5px}
    h2{text-align:center;color:#9ca3af;font-size:1em;font-weight:normal;margin:0 0 12px}
    #bar{text-align:center;padding:8px;border-radius:8px;margin:8px 0;font-weight:bold;font-size:1.05em}
    .live{background:#064e3b;color:#6ee7b7}
    .dead{background:#4c0519;color:#fda4af}
    .section{margin:14px 0}
    #alert{padding:13px;border-radius:8px;text-align:center;font-size:1.1em;font-weight:bold}
    .safe{background:#064e3b;color:#6ee7b7}
    .danger{background:#7f1d1d;color:#fecaca;animation:pulse 0.45s infinite alternate}
    .warn{background:#713f12;color:#fbbf24}
    @keyframes pulse{from{box-shadow:0 0 5px #ef4444}to{box-shadow:0 0 18px #ef4444}}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
    .card{background:#1f2937;border:1px solid #334155;border-radius:8px;padding:12px}
    .label{color:#9ca3af;font-size:0.75em;margin-bottom:4px}
    .value{font-size:1.2em;font-weight:bold}
    .chip{display:inline-block;padding:5px 8px;border-radius:999px;font-size:0.78em;font-weight:bold;margin:3px}
    .on{background:#7f1d1d;color:#fecaca}
    .off{background:#064e3b;color:#6ee7b7}
    .muted{color:#94a3b8}
    #info{text-align:center;color:#38bdf8;font-size:0.8em;margin:8px 0}
    #meta{text-align:center;color:#64748b;font-size:0.75em;margin-top:15px}
  </style>
</head>
<body>
  <h1>SISURAKSHA</h1>
  <h2>Accident Detection Dashboard</h2>
  <div id='bar' class='dead'>Connecting...</div>
  <div id='alert' class='safe'>SYSTEM SAFE</div>

  <div class='section grid'>
    <div class='card'><div class='label'>Roll</div><div class='value'><span id='roll'>0.0</span> deg</div></div>
    <div class='card'><div class='label'>Pitch</div><div class='value'><span id='pitch'>0.0</span> deg</div></div>
    <div class='card'><div class='label'>Accel X</div><div class='value' id='ax'>0.00</div></div>
    <div class='card'><div class='label'>Accel Y / Z</div><div class='value'><span id='ay'>0.00</span> / <span id='az'>0.00</span></div></div>
  </div>

  <div class='section grid'>
    <div class='card'><div class='label'>MQ2 Smoke/Gas</div><div class='value' id='mq2'>0</div></div>
    <div class='card'><div class='label'>Rain/Water</div><div class='value' id='rain'>0</div></div>
    <div class='card'><div class='label'>FSR Pressure</div><div class='value'><span id='fsr1'>0</span> / <span id='fsr2'>0</span></div></div>
    <div class='card'><div class='label'>GPS</div><div class='value' id='gps'>No fix</div></div>
  </div>

  <div class='section card'>
    <div class='label'>Detected Conditions</div>
    <div id='chips'></div>
  </div>

  <p id='info'></p>
  <p id='meta'>SSE: /events | JSON: /data</p>

<script>
  var es, frames = 0, t0 = Date.now();
  function setText(id, value){ document.getElementById(id).textContent = value; }
  function chip(name, active){
    return "<span class='chip " + (active ? "on" : "off") + "'>" + name + ": " + (active ? "YES" : "NO") + "</span>";
  }
  function update(d){
    setText('roll', Number(d.roll || 0).toFixed(1));
    setText('pitch', Number(d.pitch || 0).toFixed(1));
    setText('ax', Number(d.ax || 0).toFixed(2));
    setText('ay', Number(d.ay || 0).toFixed(2));
    setText('az', Number(d.az || 0).toFixed(2));
    setText('mq2', d.mq2 || 0);
    setText('rain', d.rain || 0);
    setText('fsr1', d.fsr1 || 0);
    setText('fsr2', d.fsr2 || 0);
    setText('gps', d.gps_valid ? (Number(d.lat).toFixed(6) + ', ' + Number(d.lng).toFixed(6)) : 'No fix');

    var alert = document.getElementById('alert');
    alert.className = d.alert_active ? 'danger' : (d.any_danger ? 'warn' : 'safe');
    alert.textContent = d.alert_active
      ? ('ALERT ACTIVE - ' + (d.alert_type || 'UNKNOWN'))
      : (d.any_danger ? 'DANGER CONDITION DETECTED' : 'SYSTEM SAFE');

    document.getElementById('chips').innerHTML =
      chip('Tilt', d.tilt) + chip('Pressure', d.pressure) + chip('Vibration', d.vibration) +
      chip('Sudden Decel', d.sudden_decel) + chip('Fire', d.fire) +
      chip('Smoke', d.smoke) + chip('Water', d.water);

    frames++;
    var now = Date.now();
    if (now - t0 >= 1000) {
      setText('info', (frames*1000/(now-t0)).toFixed(1) + ' updates/sec | ' + new Date().toLocaleTimeString());
      frames = 0; t0 = now;
    }
  }
  function connect(){
    if (es) es.close();
    es = new EventSource('/events');
    es.onopen = function(){ document.getElementById('bar').className='live'; document.getElementById('bar').textContent='Live - Streaming'; };
    es.onerror = function(){ document.getElementById('bar').className='dead'; document.getElementById('bar').textContent='Reconnecting...'; };
    es.addEventListener('s', function(e){ try { update(JSON.parse(e.data)); } catch(err){} });
  }
  fetch('/data').then(function(r){return r.json()}).then(update).catch(function(){});
  connect();
</script>
</body>
</html>
)rawliteral";

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
const unsigned long cancelTimeMs = 60000;

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
// LIVE DASHBOARD STATE
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
int liveButtonValue = HIGH;

bool liveTiltDetected = false;
bool livePressureDetected = false;
bool liveVibrationDetected = false;
bool liveSuddenDecelDetected = false;
bool liveFireDetected = false;
bool liveSmokeDetected = false;
bool liveWaterDetected = false;
bool liveGpsValid = false;
double liveGpsLat = 0.0;
double liveGpsLng = 0.0;
uint32_t liveGpsSatellites = 0;
unsigned long liveUpdatedAtMs = 0;

// =====================================================
// LCD HELPER
// =====================================================
void showLCD(String line1, String line2) {
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
  Serial.print("\nAIR780E Command: ");
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
    sendAirCommand("AT+COPS?", 1000);

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

    Serial.println("Air780E network not registered yet...");
    delay(5000);
  }

  Serial.println("Air780E network registration timeout.");
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

  air780.write(26);
  Serial.println("CTRL+Z sent. Waiting for SMS response...");

  String finalResponse = readAirResponse(30000);

  if (finalResponse.indexOf("+CMGS:") != -1 && finalResponse.indexOf("OK") != -1) {
    Serial.println("SMS SENT SUCCESSFULLY.");
  } else {
    Serial.println("SMS may have failed. Check balance, network, or Air780E SMS support.");
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
// NEO-M8N GPS FUNCTIONS
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
    Serial.print("NEO-M8N GPS: ");
    Serial.print(gps.location.lat(), 6);
    Serial.print(",");
    Serial.println(gps.location.lng(), 6);

    Serial.print("Google Maps: ");
    Serial.println(getGPSLink());
  } else {
    Serial.println("NEO-M8N GPS: Location not fixed yet");
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

String buildJSON() {
  bool anyDanger =
    liveTiltDetected ||
    livePressureDetected ||
    liveVibrationDetected ||
    liveSuddenDecelDetected ||
    liveFireDetected ||
    liveSmokeDetected ||
    liveWaterDetected;

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
  j += "\"button\":" + String(liveButtonValue) + ",";
  j += "\"tilt\":" + String(liveTiltDetected ? "true" : "false") + ",";
  j += "\"pressure\":" + String(livePressureDetected ? "true" : "false") + ",";
  j += "\"vibration\":" + String(liveVibrationDetected ? "true" : "false") + ",";
  j += "\"sudden_decel\":" + String(liveSuddenDecelDetected ? "true" : "false") + ",";
  j += "\"fire\":" + String(liveFireDetected ? "true" : "false") + ",";
  j += "\"smoke\":" + String(liveSmokeDetected ? "true" : "false") + ",";
  j += "\"water\":" + String(liveWaterDetected ? "true" : "false") + ",";
  j += "\"any_danger\":" + String(anyDanger ? "true" : "false") + ",";
  j += "\"alert_active\":" + String(alertActive ? "true" : "false") + ",";
  j += "\"alert_code\":" + String(currentAlertCode) + ",";
  j += "\"alert_type\":" + jsonString(currentAlertType) + ",";
  j += "\"alert_message\":" + jsonString(currentAlertMessage) + ",";
  j += "\"gps_valid\":" + String(liveGpsValid ? "true" : "false") + ",";
  j += "\"lat\":" + String(liveGpsLat, 6) + ",";
  j += "\"lng\":" + String(liveGpsLng, 6) + ",";
  j += "\"satellites\":" + String(liveGpsSatellites) + ",";
  j += "\"ts\":" + String(millis());
  j += "}";
  return j;
}

void broadcastDashboard(bool force = false) {
  unsigned long nowMs = millis();
  if (!force && nowMs - lastDashboardBroadcastMs < DASHBOARD_BROADCAST_INTERVAL_MS) {
    return;
  }

  lastDashboardBroadcastMs = nowMs;

  if (events.count() > 0) {
    String json = buildJSON();
    events.send(json.c_str(), "s", millis());
  }
}

void setupDashboardServer() {
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

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[WiFi] Failed. Dashboard disabled, accident monitoring continues.");
    return;
  }

  Serial.println();
  Serial.println("==============================");
  Serial.println(" WiFi Connected!");
  Serial.print(" Dashboard: http://");
  Serial.println(WiFi.localIP());

  if (MDNS.begin("sisuraksha-accident")) {
    Serial.println(" mDNS: http://sisuraksha-accident.local");
    MDNS.addService("http", "tcp", 80);
  } else {
    Serial.println(" mDNS failed - use IP address");
  }

  server.on("/", HTTP_GET, [](AsyncWebServerRequest* req) {
    req->send_P(200, "text/html", HTML_PAGE);
  });

  server.on("/data", HTTP_GET, [](AsyncWebServerRequest* req) {
    String json = buildJSON();
    AsyncWebServerResponse* res =
      req->beginResponse(200, "application/json", json);
    res->addHeader("Access-Control-Allow-Origin", "*");
    req->send(res);
  });

  events.onConnect([](AsyncEventSourceClient* client) {
    Serial.println("[SSE] Client connected");
    String json = buildJSON();
    client->send(json.c_str(), "s", millis(), 1000);
  });
  server.addHandler(&events);

  server.begin();
  Serial.println("Dashboard server ready.");
}

// =====================================================
// ALERT FUNCTIONS
// =====================================================
void startAlert(int alertCode, String alertType, String alertMessage, int audioFile) {
  if (alertActive) {
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

  if (currentAudioFile > 0) {
    Serial.print("Playing audio file: ");
    Serial.println(currentAudioFile);
    dfplayer.play(currentAudioFile);
  }

  broadcastDashboard(true);
}

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

  broadcastDashboard(true);
  delay(2000);
}

void confirmAlert() {
  Serial.println("\n======================================");
  Serial.println("ALERT CONFIRMED");
  Serial.print("Confirmed Type: ");
  Serial.println(currentAlertType);
  Serial.println("Sending SMS and making call...");
  Serial.println("======================================");

  showLCD("ALERT CONFIRMED", "SMS + Call");

  String gpsLink = getGPSLink();

  String smsMessage = "SISURAKSHA ALERT: ";
  smsMessage += currentAlertType;
  smsMessage += ". ";
  smsMessage += currentAlertMessage;
  smsMessage += ". Location: ";
  smsMessage += gpsLink;

  if (!alertSent) {
    if (waitForNetwork(60000)) {
      sendSMS(receiverNumber, smsMessage);
      delay(3000);
      makeCall(receiverNumber);
      alertSent = true;
    } else {
      Serial.println("SMS/Call not sent. Air780E network not registered.");
      showLCD("Alert Failed", "No Network");
      delay(3000);
    }
  }

  alertActive = false;
  alertSent = false;
  currentAlertCode = ALERT_NONE;
  currentAlertType = "";
  currentAlertMessage = "";
  currentAudioFile = 0;

  showLCD("SISURAKSHA", "Monitoring...");
  broadcastDashboard(true);
}

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("======================================");
  Serial.println("SISURAKSHA ACCIDENT DETECTION SYSTEM");
  Serial.println("NEO-M8N GPS + AIR780E 4G LTE");
  Serial.println("======================================");

  setupDashboardServer();

  pinMode(FIRE_DO, INPUT);
  pinMode(VIBRATION1_DO, INPUT);
  pinMode(VIBRATION2_DO, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  Wire.begin(SDA_PIN, SCL_PIN);

  lcd.init();
  lcd.backlight();

  showLCD("SISURAKSHA", "Starting...");
  delay(1500);

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

  if (!dfplayer.begin(dfSerial)) {
    Serial.println("DFPlayer not detected. Check wiring, SD card and speaker.");
    showLCD("DFPlayer Error", "Check Module");
    while (1) {
      delay(10);
    }
  }

  Serial.println("DFPlayer detected.");
  dfplayer.volume(25);

  air780.begin(9600, SERIAL_8N1, AIR780_RX, AIR780_TX);

  Serial.println("Initializing Air780E 4G LTE...");
  showLCD("Air780E", "Starting...");
  delay(15000);

  sendAirCommand("AT", 1000);
  sendAirCommand("AT+CMEE=2", 1000);
  sendAirCommand("AT+CPIN?", 1000);
  sendAirCommand("AT+CSQ", 1000);
  sendAirCommand("AT+CREG?", 1000);
  sendAirCommand("AT+CEREG?", 1000);
  sendAirCommand("AT+COPS?", 1000);

  gpsSerial.begin(9600);

  Serial.println("NEO-M8N GPS started.");
  Serial.println("Keep GPS antenna near window or outside for location fix.");
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
  liveButtonValue = buttonValue;
  liveTiltDetected = tiltDetected;
  livePressureDetected = pressureDetected;
  liveVibrationDetected = vibrationDetected;
  liveSuddenDecelDetected = suddenDecelDetected;
  liveFireDetected = fireDetected;
  liveSmokeDetected = smokeDetected;
  liveWaterDetected = waterDetected;
  liveGpsValid = gps.location.isValid();
  liveGpsLat = liveGpsValid ? gps.location.lat() : 0.0;
  liveGpsLng = liveGpsValid ? gps.location.lng() : 0.0;
  liveGpsSatellites = gps.satellites.isValid() ? gps.satellites.value() : 0;
  liveUpdatedAtMs = millis();

  broadcastDashboard();

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

  if (alertActive) {
    unsigned long elapsed = millis() - alertStartTime;
    unsigned long remaining = 0;

    if (elapsed < cancelTimeMs) {
      remaining = (cancelTimeMs - elapsed) / 1000;
    }

    Serial.print("ALERT ACTIVE: ");
    Serial.println(currentAlertType);
    Serial.print("Remaining cancel time: ");
    Serial.print(remaining);
    Serial.println(" seconds");

    showLCD(currentAlertType, "Cancel: " + String(remaining) + "s");

    if (buttonPressed) {
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
  } else if (smokeDetected) {
    startAlert(ALERT_FIRE, "FIRE DETECT", "High smoke/gas detected by MQ2", 2);
  } else if (waterDetected) {
    startAlert(ALERT_WATER, "WATER DAMAGE", "Water detected by rain sensor", 3);
  } else if (tiltDetected) {
    startAlert(ALERT_ACCIDENT, "ACCIDENT", "Bus tilted more than 30 degrees", 1);
  } else if (pressureDetected && vibrationDetected) {
    startAlert(ALERT_ACCIDENT, "ACCIDENT", "Pressure and vibration detected", 1);
  } else if (suddenDecelDetected) {
    startAlert(ALERT_ACCIDENT, "ACCIDENT", "Sudden speed reduction detected", 1);
  } else {
    showLCD("SISURAKSHA", "Monitoring...");
    Serial.println("System Status: Normal monitoring");
  }

  delay(1000);
}
