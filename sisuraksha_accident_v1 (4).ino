// =============================================================
// SISURAKSHA — Accident Detection System
// IT22610102 | Pinto R.I.S.R | Project 25-26J-282
//
// Architecture (mirrors sisuraksha_ir_final):
//   Core 0 — sensorTask: reads sensors, runs fusion engine,
//             pushes SSE every 100ms, POSTs to Node on
//             state change only
//   Core 1 — loop(): WiFi watchdog only
//
// Sensors:
//   MPU6050  — I2C (SDA=21, SCL=22)
//   LCD 16x2 — I2C 0x27
//   MQ-2     — ADC pin 35  (gas / smoke)
//   Fire     — ADC pin 34
//   Pressure — ADC pins 32, 33
//   Vibration— Digital pins 25, 26
//   Water    — ADC pin 27
//   Buzzer   — pin 13
//   Button   — pin 4  (cancel / reset)
//   DFPlayer — Serial2 TX=17 RX=16 (optional voice alert)
// =============================================================

#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <LiquidCrystal_I2C.h>
#include <DFRobotDFPlayerMini.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// =============================================================
// WiFi + Backend Config
// =============================================================
const char* WIFI_SSID      = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD  = "YOUR_WIFI_PASS";

// Match IP to your Node server (same pattern as IR .ino)
const char* NODE_ALERT_URL  = "http://10.60.136.164:5000/api/accident/alert";
const char* NODE_CANCEL_URL = "http://10.60.136.164:5000/api/accident/cancel";

// Driver email — used by server to identify which bus crashed
const char* DRIVER_EMAIL = "driver@sisuraksha.com";  // <-- set to the driver's registered email

// =============================================================
// Pin Definitions
// =============================================================
const int MQ2_PIN     = 35;
const int FIRE_PIN    = 34;
const int PRESS_PIN1  = 32;
const int PRESS_PIN2  = 33;
const int BUTTON_PIN  = 4;
const int BUZZER_PIN  = 13;
const int VIB_PIN1    = 25;
const int VIB_PIN2    = 26;
const int WATER_PIN   = 27;

// =============================================================
// Objects
// =============================================================
Adafruit_MPU6050    mpu;
LiquidCrystal_I2C   lcd(0x27, 16, 2);
HardwareSerial      dfSerial(2);
DFRobotDFPlayerMini dfPlayer;

AsyncWebServer   server(80);
AsyncEventSource events("/events");

// I2C mutex — MPU6050 and LCD share the same bus
// Both are read from Core 0 only so the mutex is a safety guard
SemaphoreHandle_t i2cMutex;

// =============================================================
// State Machine
// =============================================================
enum BusState { STATE_NORMAL, STATE_PENDING, STATE_CONFIRMED };
BusState currentState = STATE_NORMAL;

// =============================================================
// Sensor Snapshot — written by Core 0, read by SSE + POST
// Wrapped in a simple struct so JSON building is clean
// =============================================================
struct SensorSnap {
  // Raw ADC / digital
  int   gasVal;
  int   fireVal;
  int   press1Val;
  int   press2Val;
  int   waterVal;
  int   vib1Val;
  int   vib2Val;
  int   btnState;

  // Kinematics
  float totalAcc;
  float jerk;
  float fusedRoll;
  float fusedPitch;
  float rollRateDeg;
  float pitchRateDeg;

  // Fusion result
  float  confidence;
  String accidentType;
  String evidence;

  // State for dashboard
  BusState state;
  unsigned long pendingSecondsLeft;  // countdown
  unsigned long uptimeMs;
};

SensorSnap snap;   // always holds latest reading

// =============================================================
// Fusion Variables (Core 0 private)
// =============================================================
float prevAcc       = 0.0f;
float jerk_         = 0.0f;
float compRoll      = 0.0f;
float compPitch     = 0.0f;
const float CF_ALPHA = 0.96f;

struct KF {
  float Q=0.001f, R=0.03f, P=1.0f, K=0.0f, x=0.0f;
  float update(float m, float gr, float dt){
    x=x+gr*dt; P=P+Q;
    K=P/(P+R); x=x+K*(m-x); P=(1.0f-K)*P;
    return x;
  }
} kfRoll, kfPitch;

// Decision struct — must be in global scope so Arduino sees it
// before auto-generating function prototypes
struct Decision {
  float  score;
  String type;
  String evidence;
};

float fusedRoll_     = 0.0f;
float fusedPitch_    = 0.0f;
float rollRateDeg_   = 0.0f;
float pitchRateDeg_  = 0.0f;
float movementAcc_   = 99.0f;

bool  postImpactWindow_ = false;
unsigned long impactTime_ = 0;

int   vibCount_     = 0;
unsigned long vibWinStart_ = 0;

bool  accidentSuspect_ = false;
unsigned long suspectStart_ = 0;
const unsigned long CONFIRM_WINDOW_MS = 800;

unsigned long prevLoopMs_ = 0;

// State machine timing
unsigned long emergencyStartMs_ = 0;
const unsigned long CANCEL_WINDOW_MS = 180000UL;  // 3 minutes

// HTTP throttle
unsigned long lastPostMs_       = 0;
const unsigned long POST_COOLDOWN_MS = 5000UL;

// Buzzer non-blocking
unsigned long buzzerToggleMs_ = 0;
bool buzzerOn_ = false;

// =============================================================
// HTML DASHBOARD
// Mirrors the style of sisuraksha_ir_final dashboard
// =============================================================
const char HTML_PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SISURAKSHA — Accident Monitor</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#0d0d1a;color:#eee;padding:14px}

    /* Header */
    .header{text-align:center;margin-bottom:14px}
    .header h1{color:#e94560;font-size:1.6em;letter-spacing:2px}
    .header h2{color:#888;font-size:0.85em;font-weight:normal;margin-top:3px}

    /* Connection bar */
    #bar{text-align:center;padding:7px 12px;border-radius:8px;
         font-weight:bold;font-size:0.95em;margin-bottom:12px}
    .live{background:#122212;color:#44ff44;border:1px solid #44ff44}
    .dead{background:#221212;color:#ff6666;border:1px solid #ff6666}

    /* State banner */
    #stateBanner{
      text-align:center;padding:16px;border-radius:10px;
      font-size:1.4em;font-weight:bold;margin-bottom:12px;
      transition:all 0.3s
    }
    .sNormal  {background:#122212;color:#44ff44;border:2px solid #44ff44}
    .sPending {background:#2a1a00;color:#ffaa00;border:2px solid #ffaa00;
               animation:pulse 0.8s infinite alternate}
    .sConfirmed{background:#2a0000;color:#ff2222;border:2px solid #ff2222;
                animation:pulse 0.4s infinite alternate}
    @keyframes pulse{
      from{box-shadow:0 0 6px currentColor}
      to  {box-shadow:0 0 22px currentColor}
    }

    /* Accident info card */
    #accCard{
      background:#16213e;border-radius:10px;padding:12px;
      margin-bottom:12px;display:none
    }
    #accCard.show{display:block}
    .acc-row{display:flex;justify-content:space-between;
             padding:4px 0;border-bottom:1px solid #1e3060;font-size:0.9em}
    .acc-label{color:#888}
    .acc-val{color:#fff;font-weight:bold}
    .acc-val.danger{color:#ff4444}
    .acc-val.warn  {color:#ffaa00}
    .acc-val.ok    {color:#44ff44}
    #countdown{
      text-align:center;font-size:2em;font-weight:bold;
      color:#ffaa00;margin:10px 0;
      text-shadow:0 0 12px #ffaa00
    }

    /* Sensor grid */
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
    .sensor-card{
      background:#16213e;border-radius:8px;padding:10px 8px;
      text-align:center;border:1px solid #0f3460
    }
    .sensor-card.alert{border-color:#ff4444;background:#1a0808;
                       animation:pulse 0.6s infinite alternate}
    .sensor-label{font-size:0.72em;color:#888;margin-bottom:4px}
    .sensor-val  {font-size:1.3em;font-weight:bold;color:#00b4d8}
    .sensor-val.danger{color:#ff4444}
    .sensor-val.warn  {color:#ffaa00}
    .sensor-val.ok    {color:#44ff44}

    /* Fusion breakdown */
    #fusionCard{background:#16213e;border-radius:10px;padding:12px;margin-bottom:12px}
    #fusionCard h3{color:#00b4d8;font-size:0.9em;margin-bottom:8px;
                   border-bottom:1px solid #0f3460;padding-bottom:4px}
    #evidenceTags{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
    .etag{background:#0f3460;color:#9DC3E6;padding:3px 8px;
          border-radius:4px;font-size:0.75em;font-family:monospace}
    #confBar{height:8px;border-radius:4px;background:#0f3460;margin-top:8px;overflow:hidden}
    #confFill{height:100%;border-radius:4px;background:#44ff44;
              transition:width 0.5s,background 0.5s}

    /* Event log */
    .card{background:#16213e;border-radius:10px;padding:12px;margin-bottom:12px}
    .card h3{color:#fff;background:#0f3460;padding:5px 10px;
             border-radius:6px;margin-bottom:8px;font-size:0.9em}
    #log{font-family:monospace;font-size:0.78em;color:#aaa;
         height:120px;overflow-y:auto}
    .le{padding:2px 0;border-bottom:1px solid #0f3460}
    .le-alert  {color:#ff6666}
    .le-warn   {color:#ffaa00}
    .le-ok     {color:#44ff44}
    .le-info   {color:#888}

    #meta{text-align:center;color:#333;font-size:0.72em;margin-top:8px}
  </style>
</head>
<body>

<div class="header">
  <h1>SISURAKSHA</h1>
  <h2>Accident Detection Monitor — Bus BUS_001</h2>
</div>

<div id="bar" class="dead">Connecting...</div>

<!-- State Banner -->
<div id="stateBanner" class="sNormal">SYSTEM NORMAL</div>

<!-- Accident Detail Card (shown only when PENDING/CONFIRMED) -->
<div id="accCard">
  <div class="acc-row">
    <span class="acc-label">Accident Type</span>
    <span class="acc-val danger" id="accType">—</span>
  </div>
  <div class="acc-row">
    <span class="acc-label">Confidence Score</span>
    <span class="acc-val warn" id="accConf">—</span>
  </div>
  <div class="acc-row">
    <span class="acc-label">Evidence</span>
    <span class="acc-val" id="accEvid">—</span>
  </div>
  <div id="countdown">3:00</div>
</div>

<!-- Sensor Grid -->
<div class="grid">
  <div class="sensor-card" id="cAcc">
    <div class="sensor-label">TOTAL ACC (m/s²)</div>
    <div class="sensor-val" id="vAcc">—</div>
  </div>
  <div class="sensor-card" id="cJerk">
    <div class="sensor-label">JERK (m/s³)</div>
    <div class="sensor-val" id="vJerk">—</div>
  </div>
  <div class="sensor-card" id="cRoll">
    <div class="sensor-label">FUSED ROLL (°)</div>
    <div class="sensor-val" id="vRoll">—</div>
  </div>
  <div class="sensor-card" id="cRollRate">
    <div class="sensor-label">ROLL RATE (°/s)</div>
    <div class="sensor-val" id="vRollRate">—</div>
  </div>
  <div class="sensor-card" id="cGas">
    <div class="sensor-label">GAS (MQ-2)</div>
    <div class="sensor-val" id="vGas">—</div>
  </div>
  <div class="sensor-card" id="cFire">
    <div class="sensor-label">FIRE SENSOR</div>
    <div class="sensor-val" id="vFire">—</div>
  </div>
  <div class="sensor-card" id="cP1">
    <div class="sensor-label">PRESSURE 1</div>
    <div class="sensor-val" id="vP1">—</div>
  </div>
  <div class="sensor-card" id="cP2">
    <div class="sensor-label">PRESSURE 2</div>
    <div class="sensor-val" id="vP2">—</div>
  </div>
  <div class="sensor-card" id="cWater">
    <div class="sensor-label">WATER SENSOR</div>
    <div class="sensor-val" id="vWater">—</div>
  </div>
  <div class="sensor-card" id="cVib1">
    <div class="sensor-label">VIBRATION 1</div>
    <div class="sensor-val" id="vVib1">—</div>
  </div>
  <div class="sensor-card" id="cVib2">
    <div class="sensor-label">VIBRATION 2</div>
    <div class="sensor-val" id="vVib2">—</div>
  </div>
  <div class="sensor-card" id="cVibCount">
    <div class="sensor-label">VIB BURST /500ms</div>
    <div class="sensor-val" id="vVibCount">—</div>
  </div>
</div>

<!-- Fusion Breakdown -->
<div id="fusionCard">
  <h3>Fusion Engine</h3>
  <div style="display:flex;justify-content:space-between;font-size:0.85em">
    <span style="color:#888">Confidence</span>
    <span id="confNum" style="color:#fff;font-weight:bold">0%</span>
  </div>
  <div id="confBar"><div id="confFill" style="width:0%"></div></div>
  <div id="evidenceTags"></div>
</div>

<!-- Event Log -->
<div class="card">
  <h3>Event Log</h3>
  <div id="log"></div>
</div>

<p id="meta">IT22610102 Pinto R.I.S.R | SISURAKSHA 25-26J-282</p>

<script>
var es;
var prevState = 'NORMAL';
var countdownInterval = null;
var pendingSecondsLeft = 180;

// ── Logging ───────────────────────────────────────────
function addLog(msg, cls) {
  var log   = document.getElementById('log');
  var entry = document.createElement('div');
  entry.className  = 'le ' + (cls || 'le-info');
  entry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
  log.insertBefore(entry, log.firstChild);
  while (log.children.length > 60) log.removeChild(log.lastChild);
}

// ── Countdown timer ───────────────────────────────────
function startCountdown(seconds) {
  clearInterval(countdownInterval);
  pendingSecondsLeft = seconds;
  countdownInterval = setInterval(function() {
    pendingSecondsLeft = Math.max(0, pendingSecondsLeft - 1);
    var m = Math.floor(pendingSecondsLeft / 60);
    var s = pendingSecondsLeft % 60;
    document.getElementById('countdown').textContent =
      m + ':' + (s < 10 ? '0' : '') + s;
    if (pendingSecondsLeft <= 0) clearInterval(countdownInterval);
  }, 1000);
}

// ── SSE update handler ────────────────────────────────
function onData(d) {
  // ── Connection bar
  document.getElementById('bar').className   = 'live';
  document.getElementById('bar').textContent = 'Live — streaming | uptime: ' + (d.uptime|0) + 's';

  // ── State banner
  var banner = document.getElementById('stateBanner');
  var accCard = document.getElementById('accCard');

  if (d.state === 'NORMAL') {
    banner.className   = 'sNormal';
    banner.textContent = 'SYSTEM NORMAL';
    accCard.classList.remove('show');
    clearInterval(countdownInterval);
    document.getElementById('countdown').textContent = '3:00';
  }
  else if (d.state === 'PENDING') {
    banner.className   = 'sPending';
    banner.textContent = '⚠ ACCIDENT DETECTED — DRIVER CAN CANCEL';
    accCard.classList.add('show');
    if (prevState !== 'PENDING') {
      startCountdown(d.secondsLeft || 180);
      addLog('ACCIDENT PENDING: ' + d.accType + ' (conf: ' + d.confidence.toFixed(0) + '%)', 'le-warn');
    } else {
      pendingSecondsLeft = d.secondsLeft || pendingSecondsLeft;
    }
  }
  else if (d.state === 'CONFIRMED') {
    banner.className   = 'sConfirmed';
    banner.textContent = '🚨 EMERGENCY CONFIRMED — PARENTS + POLICE NOTIFIED';
    accCard.classList.add('show');
    clearInterval(countdownInterval);
    document.getElementById('countdown').textContent = 'CONFIRMED';
    if (prevState !== 'CONFIRMED') {
      addLog('EMERGENCY CONFIRMED: ' + d.accType, 'le-alert');
    }
  }
  prevState = d.state;

  // ── Accident card
  if (d.state !== 'NORMAL') {
    document.getElementById('accType').textContent = d.accType  || '—';
    document.getElementById('accConf').textContent = d.confidence.toFixed(1) + '%';
    document.getElementById('accEvid').textContent = d.evidence || '—';
  }

  // ── Sensor cards
  setCard('vAcc',      d.totalAcc.toFixed(2),  'cAcc',      d.totalAcc > 22);
  setCard('vJerk',     d.jerk.toFixed(1),       'cJerk',     d.jerk > 80);
  setCard('vRoll',     d.fusedRoll.toFixed(1),  'cRoll',     Math.abs(d.fusedRoll) > 30);
  setCard('vRollRate', d.rollRate.toFixed(1),   'cRollRate', Math.abs(d.rollRate) > 80);
  setCard('vGas',      d.gasVal,                'cGas',      d.gasVal > 900);
  setCard('vFire',     d.fireVal,               'cFire',     d.fireVal < 500);
  setCard('vP1',       d.press1,                'cP1',       d.press1 < 500);  // LOW = pressed
  setCard('vP2',       d.press2,                'cP2',       d.press2 < 500);  // LOW = pressed
  setCard('vWater',    d.waterVal,              'cWater',    d.waterVal > 700);
  setCard('vVib1',     d.vib1 ? 'HIT' : 'OK',  'cVib1',     d.vib1);
  setCard('vVib2',     d.vib2 ? 'HIT' : 'OK',  'cVib2',     d.vib2);
  setCard('vVibCount', d.vibCount,              'cVibCount', d.vibCount > 8);

  // ── Fusion bar
  var conf = d.confidence;
  var fill = document.getElementById('confFill');
  fill.style.width = conf + '%';
  fill.style.background = conf >= 80 ? '#ff4444' : conf >= 55 ? '#ffaa00' : '#44ff44';
  document.getElementById('confNum').textContent = conf.toFixed(1) + '%';

  // ── Evidence tags
  var tags = document.getElementById('evidenceTags');
  tags.innerHTML = '';
  if (d.evidence) {
    d.evidence.trim().split(/\s+/).forEach(function(t) {
      if (!t) return;
      var span = document.createElement('span');
      span.className   = 'etag';
      span.textContent = t;
      tags.appendChild(span);
    });
  }
}

function setCard(valId, val, cardId, isAlert) {
  var el = document.getElementById(valId);
  var card = document.getElementById(cardId);
  el.textContent = val;
  el.className = 'sensor-val ' + (isAlert ? 'danger' : 'ok');
  card.className = 'sensor-card ' + (isAlert ? 'alert' : '');
}

// ── SSE connect ───────────────────────────────────────
function connect() {
  if (es) es.close();
  es = new EventSource('/events');

  es.onopen = function() {
    document.getElementById('bar').className   = 'live';
    document.getElementById('bar').textContent = 'Live — streaming';
    addLog('Connected to ESP32', 'le-ok');
  };
  es.onerror = function() {
    document.getElementById('bar').className   = 'dead';
    document.getElementById('bar').textContent = 'Reconnecting...';
    setTimeout(connect, 3000);
  };
  es.addEventListener('s', function(e) {
    try { onData(JSON.parse(e.data)); } catch(err) {}
  });
}

connect();
addLog('Dashboard loaded', 'le-info');
</script>
</body>
</html>
)rawliteral";

// =============================================================
// JSON Builder — called from Core 0 task
// Produces compact JSON for SSE push
// =============================================================
String buildSSEJson(const SensorSnap &s) {
  StaticJsonDocument<512> doc;

  // State string
  String stateStr;
  switch (s.state) {
    case STATE_NORMAL:    stateStr = "NORMAL";    break;
    case STATE_PENDING:   stateStr = "PENDING";   break;
    case STATE_CONFIRMED: stateStr = "CONFIRMED"; break;
  }
  doc["state"]       = stateStr;
  doc["secondsLeft"] = s.pendingSecondsLeft;
  doc["accType"]     = s.accidentType;
  doc["confidence"]  = s.confidence;
  doc["evidence"]    = s.evidence;
  doc["uptime"]      = s.uptimeMs / 1000;

  // Kinematics
  doc["totalAcc"]  = s.totalAcc;
  doc["jerk"]      = s.jerk;
  doc["fusedRoll"] = s.fusedRoll;
  doc["fusedPitch"]= s.fusedPitch;
  doc["rollRate"]  = s.rollRateDeg;

  // Raw sensors
  doc["gasVal"]   = s.gasVal;
  doc["fireVal"]  = s.fireVal;
  doc["press1"]   = s.press1Val;
  doc["press2"]   = s.press2Val;
  doc["waterVal"] = s.waterVal;
  doc["vib1"]     = (s.vib1Val == HIGH);
  doc["vib2"]     = (s.vib2Val == HIGH);
  doc["vibCount"] = vibCount_;

  String out;
  serializeJson(doc, out);
  return out;
}

// =============================================================
// HTTP POST helpers
// =============================================================
void postAlert(const String &type, float score, const String &evidence,
               const SensorSnap &s, const String &status) {
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastPostMs_ < POST_COOLDOWN_MS) return;

  StaticJsonDocument<512> doc;
  doc["driverEmail"] = DRIVER_EMAIL;
  doc["alertType"]  = type;
  doc["status"]     = status;
  doc["confidence"] = score;
  doc["evidence"]   = evidence;

  JsonObject sd = doc.createNestedObject("sensorData");
  sd["totalAcc"]   = s.totalAcc;
  sd["jerk"]       = s.jerk;
  sd["fusedRoll"]  = s.fusedRoll;
  sd["rollRate"]   = s.rollRateDeg;
  sd["gasValue"]   = s.gasVal;
  sd["fireValue"]  = s.fireVal;
  sd["press1"]     = s.press1Val;
  sd["press2"]     = s.press2Val;
  sd["waterValue"] = s.waterVal;

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(NODE_ALERT_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(800);
  int code = http.POST(body);
  Serial.printf("[POST] %s | type=%s | conf=%.1f | HTTP %d\n",
                status.c_str(), type.c_str(), score, code);
  http.end();
  lastPostMs_ = millis();
}

void postCancel() {
  if (WiFi.status() != WL_CONNECTED) return;
  StaticJsonDocument<128> doc;
  doc["driverEmail"] = DRIVER_EMAIL;
  doc["status"] = "CANCELLED";
  String body;
  serializeJson(doc, body);
  HTTPClient http;
  http.begin(NODE_CANCEL_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(800);
  http.POST(body);
  http.end();
  Serial.println("[POST] CANCELLED");
}

// =============================================================
// Fusion helpers
// =============================================================
void updateFilters(float dt, const sensors_event_t &a, const sensors_event_t &g) {
  // Complementary filter
  float aRoll  = atan2f(a.acceleration.y, a.acceleration.z) * 180.0f / PI;
  float aPitch = atan2f(-a.acceleration.x,
    sqrtf(a.acceleration.y * a.acceleration.y +
          a.acceleration.z * a.acceleration.z)) * 180.0f / PI;

  compRoll  = CF_ALPHA * (compRoll  + g.gyro.x * 180.0f / PI * dt) + (1.0f - CF_ALPHA) * aRoll;
  compPitch = CF_ALPHA * (compPitch + g.gyro.y * 180.0f / PI * dt) + (1.0f - CF_ALPHA) * aPitch;

  // Kalman on top — more accurate
  fusedRoll_    = kfRoll.update(aRoll,  g.gyro.x * 180.0f / PI, dt);
  fusedPitch_   = kfPitch.update(aPitch, g.gyro.y * 180.0f / PI, dt);
  rollRateDeg_  = g.gyro.x * 180.0f / PI;
  pitchRateDeg_ = g.gyro.y * 180.0f / PI;
}

void updateVibWindow(int v1, int v2) {
  if (v1 == HIGH || v2 == HIGH) vibCount_++;
  if (millis() - vibWinStart_ >= 500) {
    vibWinStart_ = millis();
    vibCount_ = 0;
  }
}

void updatePostImpact(float totalAcc) {
  if (totalAcc > 20.0f && !postImpactWindow_) {
    postImpactWindow_ = true;
    impactTime_ = millis();
  }
  if (postImpactWindow_) {
    unsigned long e = millis() - impactTime_;
    if (e > 1200 && e < 3500) movementAcc_ = fabsf(totalAcc - 9.81f);
    if (e >= 3500) { postImpactWindow_ = false; movementAcc_ = 99.0f; }
  }
}

// ── Signature detectors (each returns 0.0–1.0) ────────────

float sigFrontal(float totalAcc, float jerk, int p1, int p2, int vc) {
  float s = 0.0f;
  if (jerk > 120.0f)              s += 0.28f;
  if (p1 < 500 && p2 < 500)       s += 0.30f;  // LOW = pressed (inverted sensor)
  if (fusedPitch_ > 10.0f)        s += 0.20f;
  if (totalAcc > 20.0f)           s += 0.15f;
  if (vc > 6)                     s += 0.07f;
  return min(s, 1.0f);
}

float sigSide(float jerk, int p1, int p2) {
  float s = 0.0f;
  if (fabsf(rollRateDeg_) > 80.0f) s += 0.30f;
  if ((p1 < 500) != (p2 < 500))    s += 0.28f;  // only one LOW = side impact
  if (fabsf(fusedRoll_) > 15.0f)   s += 0.22f;
  if (jerk > 80.0f)                s += 0.20f;
  return min(s, 1.0f);
}

float sigRollover() {
  float s = 0.0f;
  float absRoll = fabsf(fusedRoll_);
  float absRate = fabsf(rollRateDeg_);

  // Roll rate — fast spin (crash/flip)
  if (absRate > 150.0f) s += 0.40f;
  else if (absRate > 60.0f) s += 0.20f;   // slower rotation still counts

  // Tilt angle — graduated scoring
  // 20° = bus leaning noticeably
  // 35° = bus seriously tipping
  // 50° = bus on its side
  if      (absRoll > 50.0f) s += 0.50f;
  else if (absRoll > 35.0f) s += 0.35f;
  else if (absRoll > 20.0f) s += 0.18f;

  if (vibCount_ > 6) s += 0.10f;
  return min(s, 1.0f);
}

float sigFire(int fireV, int gasV) {
  float s = 0.0f;
  if (fireV < 500)                  s += 0.50f;
  if (gasV  > 800)                  s += 0.30f;
  if (fireV < 800 && gasV > 600)    s += 0.15f;
  return min(s, 1.0f);
}

float sigWater(int waterV, float totalAcc) {
  float s = 0.0f;
  if (waterV > 700)                 s += 0.50f;
  if (totalAcc < 10.5f)            s += 0.25f;
  if (waterV > 1500)                s += 0.25f;
  return min(s, 1.0f);
}

// ── Master fusion engine ──────────────────────────────────

Decision runFusion(float totalAcc, float jerk,
                   int p1, int p2, int fireV, int gasV, int waterV) {
  Decision d = { 0.0f, "NONE", "" };

  float frontal  = sigFrontal(totalAcc, jerk, p1, p2, vibCount_);
  float side     = sigSide(jerk, p1, p2);
  float rollover = sigRollover();
  float fire     = sigFire(fireV, gasV);
  float water    = sigWater(waterV, totalAcc);

  // Method-level boosters (evidence string)
  float boost = 0.0f;
  if (jerk > 100.0f)                               { boost += 15.0f; d.evidence += "JERK ";      }
  if (fabsf(rollRateDeg_) > 60.0f)                 { boost += 15.0f; d.evidence += "GYRO_RATE "; }  // was 100
  if (postImpactWindow_ && movementAcc_ < 0.4f)    { boost += 12.0f; d.evidence += "POST_STILL ";}
  if (vibCount_ > 8)                               { boost += 10.0f; d.evidence += "VIB_BURST("; d.evidence += vibCount_; d.evidence += ") "; }

  // Graduated tilt boost — angle alone should raise confidence
  float absRoll = fabsf(fusedRoll_);
  if      (absRoll > 50.0f) { boost += 25.0f; d.evidence += "TILT_SEVERE "; }
  else if (absRoll > 35.0f) { boost += 18.0f; d.evidence += "TILT_HIGH ";   }
  else if (absRoll > 20.0f) { boost += 10.0f; d.evidence += "TILT ";        }

  if ((p1 < 500) && (p2 < 500))                    { boost +=  8.0f; d.evidence += "BOTH_PRESS ";}

  // Weighted scores
  float sc[5]   = { frontal, side, rollover, fire * 1.3f, water * 1.1f };
  String ty[5]  = { "FRONTAL CRASH", "SIDE IMPACT", "ROLLOVER", "FIRE", "SUBMERSION" };

  int   best  = 0;
  int   above = 0;
  for (int i = 0; i < 5; i++) {
    if (sc[i] > sc[best]) best = i;
    if (sc[i] > 0.25f) above++;
  }

  // Correlation bonus — multiple independent methods agree
  if (above >= 2) boost += 10.0f;
  if (above >= 3) boost += 15.0f;

  d.score = min(sc[best] * 70.0f + boost, 100.0f);
  d.type  = ty[best];
  return d;
}

// ── Non-blocking buzzer ───────────────────────────────────
void handleBuzzer(BusState state) {
  unsigned long now = millis();
  unsigned long interval = 0;

  if (state == STATE_PENDING)   interval = 500;
  if (state == STATE_CONFIRMED) interval = 200;

  if (state == STATE_NORMAL) {
    digitalWrite(BUZZER_PIN, LOW);
    buzzerOn_ = false;
    return;
  }

  if (now - buzzerToggleMs_ >= interval) {
    buzzerOn_ = !buzzerOn_;
    digitalWrite(BUZZER_PIN, buzzerOn_ ? HIGH : LOW);
    buzzerToggleMs_ = now;
  }
}

// ── LCD helper (guarded by mutex) ────────────────────────
void updateLCD(BusState state, const String &type, unsigned long secLeft) {
  if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(20)) != pdTRUE) return;

  lcd.clear();
  switch (state) {
    case STATE_NORMAL:
      lcd.setCursor(0, 0); lcd.print("Status: Safe");
      lcd.setCursor(0, 1); lcd.print("System OK");
      break;
    case STATE_PENDING:
      lcd.setCursor(0, 0); lcd.print("!! ACCIDENT !!");
      lcd.setCursor(0, 1);
      lcd.print("Cancel:");
      lcd.print(secLeft);
      lcd.print("s  ");
      break;
    case STATE_CONFIRMED:
      lcd.setCursor(0, 0); lcd.print("!!! EMERGENCY");
      lcd.setCursor(0, 1); lcd.print(type.substring(0, 16));
      break;
  }
  xSemaphoreGive(i2cMutex);
}

// =============================================================
// CORE 0 TASK — sensor reading, fusion, SSE, POST
// Mirrors broadcastTask() from sisuraksha_ir_final
// =============================================================
void sensorTask(void *param) {
  // Local state (not shared — only this task modifies these)
  BusState     localState        = STATE_NORMAL;
  String       accidentType      = "";
  float        detectedScore     = 0.0f;
  String       detectedEvidence  = "";
  unsigned long emergencyStartMs = 0;
  bool          pendingPosted    = false;

  unsigned long lcdUpdateMs = 0;

  for (;;) {
    unsigned long now = millis();

    // ── Delta time ──────────────────────────────────────
    float dt = (now - prevLoopMs_) / 1000.0f;
    if (dt <= 0.0f || dt > 1.0f) dt = 0.1f;
    prevLoopMs_ = now;

    // ── Read MPU6050 (I2C — guarded) ───────────────────
    sensors_event_t a, g, temp;
    if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
      mpu.getEvent(&a, &g, &temp);
      xSemaphoreGive(i2cMutex);
    }

    // ── Read all other sensors ──────────────────────────
    int gasVal    = analogRead(MQ2_PIN);
    int fireVal   = analogRead(FIRE_PIN);
    int press1Val = analogRead(PRESS_PIN1);
    int press2Val = analogRead(PRESS_PIN2);
    int waterVal  = analogRead(WATER_PIN);
    int vib1Val   = digitalRead(VIB_PIN1);
    int vib2Val   = digitalRead(VIB_PIN2);
    int btnState  = digitalRead(BUTTON_PIN);

    float totalAcc = sqrtf(
      a.acceleration.x * a.acceleration.x +
      a.acceleration.y * a.acceleration.y +
      a.acceleration.z * a.acceleration.z);

    // ── Update fusion modules ───────────────────────────
    jerk_    = fabsf(totalAcc - prevAcc) / dt;
    prevAcc  = totalAcc;
    updateFilters(dt, a, g);
    updateVibWindow(vib1Val, vib2Val);
    updatePostImpact(totalAcc);

    // ── Serial output (same format as IR .ino) ──────────
    Serial.printf(
      "ACC:%.2f JRK:%.1f ROLL:%.1f RATE:%.1f "
      "GAS:%d FIRE:%d W:%d P1:%d P2:%d V1:%d V2:%d VBC:%d STATE:%d\n",
      totalAcc, jerk_, fusedRoll_, rollRateDeg_,
      gasVal, fireVal, waterVal, press1Val, press2Val,
      vib1Val, vib2Val, vibCount_, (int)localState);

    // ────────────────────────────────────────────────────
    // STATE MACHINE
    // ────────────────────────────────────────────────────

    if (localState == STATE_NORMAL) {

      // ── Pothole filter: require 800ms sustained + secondary ──
      bool impactActive   = (totalAcc > 22.0f);
      bool secondaryFired = (press1Val < 500 || press2Val < 500)  // LOW = pressed
                         || (vib1Val == HIGH  || vib2Val == HIGH)
                         || (fabsf(fusedRoll_) > 15.0f);          // tilt counts as secondary

      // Start suspect clock on first impact
      if (impactActive && !accidentSuspect_) {
        accidentSuspect_ = true;
        suspectStart_    = now;
      }

      // Too short — pothole, reset
      if (accidentSuspect_ && !impactActive &&
          (now - suspectStart_) < 300) {
        accidentSuspect_ = false;
        Serial.println("[FILTER] Pothole rejected");
      }

      // Confirmation window expired
      if (accidentSuspect_ && (now - suspectStart_ >= CONFIRM_WINDOW_MS)) {
        accidentSuspect_ = false;

        if (impactActive && secondaryFired) {
          Decision result = runFusion(totalAcc, jerk_,
                              press1Val, press2Val,
                              fireVal, gasVal, waterVal);

          if (result.score >= 55.0f) {
            localState         = STATE_PENDING;
            accidentType       = result.type;
            detectedScore      = result.score;
            detectedEvidence   = result.evidence;
            emergencyStartMs   = now;
            pendingPosted      = false;
            Serial.printf("[STATE] -> PENDING | type=%s score=%.1f\n",
                          result.type.c_str(), result.score);
          }
        }
      }

      // ── Tilt bypass — slow rollover doesn't produce high acc ──
      // Bus tipping over happens slowly — no acceleration spike needed
      // Sustained tilt > 35° for 1 second = definite rollover event
      static unsigned long tiltSustainStart = 0;
      if (fabsf(fusedRoll_) > 35.0f) {
        if (tiltSustainStart == 0) tiltSustainStart = now;
        if ((now - tiltSustainStart) >= 1000) {  // sustained 1 second
          Decision result = runFusion(totalAcc, jerk_,
                              press1Val, press2Val,
                              fireVal, gasVal, waterVal);
          if (result.score >= 55.0f) {
            localState       = STATE_PENDING;
            accidentType     = result.type;
            detectedScore    = result.score;
            detectedEvidence = result.evidence;
            emergencyStartMs = now;
            pendingPosted    = false;
            tiltSustainStart = 0;
            Serial.printf("[STATE] -> PENDING (tilt) | type=%s score=%.1f\n",
                          result.type.c_str(), result.score);
          }
        }
      } else {
        tiltSustainStart = 0;  // reset if tilt drops below threshold
      }

      // ── Pressure bypass — passenger load without impact ──
      // Both sensors pressed with no movement = passengers trapped / crush
      static unsigned long pressSustainStart = 0;
      bool bothPressed = (press1Val < 500 && press2Val < 500);
      if (bothPressed) {
        if (pressSustainStart == 0) pressSustainStart = now;
        if ((now - pressSustainStart) >= 2000) {  // sustained 2 seconds
          Decision result = runFusion(totalAcc, jerk_,
                              press1Val, press2Val,
                              fireVal, gasVal, waterVal);
          if (result.score >= 40.0f) {  // lower threshold — pressure is direct evidence
            localState       = STATE_PENDING;
            accidentType     = result.type;
            detectedScore    = result.score;
            detectedEvidence = result.evidence;
            emergencyStartMs = now;
            pendingPosted    = false;
            pressSustainStart = 0;
            Serial.printf("[STATE] -> PENDING (pressure) | type=%s score=%.1f\n",
                          result.type.c_str(), result.score);
          }
        }
      } else {
        pressSustainStart = 0;
      }

      // Fire / submersion: bypass pothole filter — immediate
      Decision env = runFusion(totalAcc, jerk_,
                       press1Val, press2Val, fireVal, gasVal, waterVal);
      if (env.score >= 90.0f &&
          (env.type == "FIRE" || env.type == "SUBMERSION")) {
        localState       = STATE_CONFIRMED;
        accidentType     = env.type;
        detectedScore    = env.score;
        detectedEvidence = env.evidence;
        postAlert(env.type, env.score, env.evidence, snap, "CONFIRMED");
        Serial.println("[STATE] -> CONFIRMED (env) | " + env.type);
      }
    }

    else if (localState == STATE_PENDING) {
      unsigned long elapsed = now - emergencyStartMs;
      unsigned long secLeft = (elapsed < CANCEL_WINDOW_MS)
                              ? (CANCEL_WINDOW_MS - elapsed) / 1000
                              : 0;

      // POST PENDING once
      if (!pendingPosted) {
        postAlert(accidentType, detectedScore, detectedEvidence, snap, "PENDING");
        pendingPosted = true;
      }

      // Driver pressed button = CANCEL
      if (btnState == LOW) {
        localState   = STATE_NORMAL;
        accidentType = "";
        detectedScore = 0.0f;
        detectedEvidence = "";
        accidentSuspect_ = false;
        digitalWrite(BUZZER_PIN, LOW);
        postCancel();
        Serial.println("[STATE] -> NORMAL (driver cancelled)");

        if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(30)) == pdTRUE) {
          lcd.clear(); lcd.print("Alert Cancelled");
          xSemaphoreGive(i2cMutex);
        }
        vTaskDelay(pdMS_TO_TICKS(1500));

        if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(30)) == pdTRUE) {
          lcd.clear();
          xSemaphoreGive(i2cMutex);
        }
      }

      // 3 minutes with no cancel = CONFIRMED
      if (elapsed >= CANCEL_WINDOW_MS) {
        localState = STATE_CONFIRMED;
        postAlert(accidentType, detectedScore, detectedEvidence, snap, "CONFIRMED");
        Serial.println("[STATE] -> CONFIRMED (timeout) | " + accidentType);
      }
    }

    // STATE_CONFIRMED: hold until power cycle / manual reset
    // (no auto-reset — this is intentional for accident records)

    // ── Buzzer (non-blocking) ────────────────────────────
    handleBuzzer(localState);

    // ── LCD (every 500ms to avoid I2C flooding) ─────────
    if (now - lcdUpdateMs >= 500) {
      unsigned long secLeft = 0;
      if (localState == STATE_PENDING) {
        unsigned long elapsed = now - emergencyStartMs;
        secLeft = (elapsed < CANCEL_WINDOW_MS) ? (CANCEL_WINDOW_MS - elapsed) / 1000 : 0;
      }
      updateLCD(localState, accidentType, secLeft);
      lcdUpdateMs = now;
    }

    // ── Build sensor snapshot for SSE ───────────────────
    {
      // Direct member assignment — no cast needed for volatile struct fields
      snap.gasVal    = gasVal;
      snap.fireVal   = fireVal;
      snap.press1Val = press1Val;
      snap.press2Val = press2Val;
      snap.waterVal  = waterVal;
      snap.vib1Val   = vib1Val;
      snap.vib2Val   = vib2Val;
      snap.btnState  = btnState;
      snap.totalAcc  = totalAcc;
      snap.jerk      = jerk_;
      snap.fusedRoll = fusedRoll_;
      snap.fusedPitch= fusedPitch_;
      snap.rollRateDeg = rollRateDeg_;

      snap.state        = localState;
      snap.confidence   = detectedScore;
      snap.accidentType = accidentType;
      snap.evidence     = detectedEvidence;
      snap.uptimeMs     = now;

      if (localState == STATE_PENDING) {
        unsigned long elapsed = now - emergencyStartMs;
        snap.pendingSecondsLeft = (elapsed < CANCEL_WINDOW_MS)
                                  ? (CANCEL_WINDOW_MS - elapsed) / 1000
                                  : 0;
      } else {
        snap.pendingSecondsLeft = 180;
      }
    }

    // ── Push SSE to all connected dashboard clients ──────
    if (events.count() > 0) {
      String json = buildSSEJson(snap);
      events.send(json.c_str(), "s", now);
    }

    // 10 updates/sec — same as sisuraksha_ir_final
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

// =============================================================
// SETUP
// =============================================================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[SISURAKSHA] Accident Detection System booting...");

  // ── I2C mutex ──────────────────────────────────────────
  i2cMutex = xSemaphoreCreateMutex();

  // ── Pin modes ──────────────────────────────────────────
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(VIB_PIN1,   INPUT);
  pinMode(VIB_PIN2,   INPUT);
  pinMode(PRESS_PIN1, INPUT);
  pinMode(PRESS_PIN2, INPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // ── LCD ────────────────────────────────────────────────
  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0); lcd.print("SISURAKSHA");
  lcd.setCursor(0, 1); lcd.print("Booting...");

  // ── MPU6050 ────────────────────────────────────────────
  if (!mpu.begin()) {
    Serial.println("[ERROR] MPU6050 not found — check wiring");
    lcd.setCursor(0, 1); lcd.print("MPU ERROR      ");
  } else {
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    Serial.println("[OK] MPU6050 ready");
  }

  // ── DFPlayer (optional voice alert) ───────────────────
  dfSerial.begin(9600, SERIAL_8N1, 16, 17);
  if (dfPlayer.begin(dfSerial)) {
    dfPlayer.volume(25);
    Serial.println("[OK] DFPlayer ready");
  } else {
    Serial.println("[WARN] DFPlayer not found — continuing without audio");
  }

  // ── WiFi ───────────────────────────────────────────────
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  lcd.setCursor(0, 1); lcd.print("WiFi...        ");
  Serial.print("[WiFi] Connecting");

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected: " + WiFi.localIP().toString());
    lcd.setCursor(0, 1); lcd.print(WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] FAILED — running in offline mode");
    lcd.setCursor(0, 1); lcd.print("WiFi FAILED    ");
  }

  delay(1500);

  // ── mDNS (same as IR .ino) ─────────────────────────────
  if (MDNS.begin("sisuraksha-accident")) {
    Serial.println("[mDNS] http://sisuraksha-accident.local");
    MDNS.addService("http", "tcp", 80);
  }

  // ── Web server routes ──────────────────────────────────
  // Main dashboard
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *req) {
    req->send_P(200, "text/html", HTML_PAGE);
  });

  // Instant JSON snapshot (same as /data in IR .ino)
  server.on("/data", HTTP_GET, [](AsyncWebServerRequest *req) {
    String json = buildSSEJson(snap);
    AsyncWebServerResponse *res =
      req->beginResponse(200, "application/json", json);
    res->addHeader("Access-Control-Allow-Origin", "*");
    req->send(res);
  });

  // SSE endpoint — dashboard auto-subscribes
  events.onConnect([](AsyncEventSourceClient *client) {
    Serial.printf("[SSE] Dashboard client connected\n");
    String json = buildSSEJson(snap);
    client->send(json.c_str(), "s", millis(), 1000);
  });
  server.addHandler(&events);

  server.begin();
  Serial.println("[HTTP] Server ready");

  // ── Sensor task on Core 0 ─────────────────────────────
  // Mirrors broadcastTask() in sisuraksha_ir_final
  // Stack 8KB — larger than IR task because of fusion math
  xTaskCreatePinnedToCore(
    sensorTask,   // function
    "SensorTask", // name
    8192,         // stack bytes
    NULL,         // params
    1,            // priority
    NULL,         // handle
    0             // Core 0
  );

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("SISURAKSHA OK");
  lcd.setCursor(0, 1); lcd.print("Monitoring...");
  Serial.println("[READY] System online");
}

// =============================================================
// LOOP — Core 1 — WiFi watchdog only
// Identical pattern to sisuraksha_ir_final loop()
// =============================================================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Dropped — reconnecting...");
    WiFi.reconnect();
    delay(5000);
  }
  vTaskDelay(pdMS_TO_TICKS(5000));
}
