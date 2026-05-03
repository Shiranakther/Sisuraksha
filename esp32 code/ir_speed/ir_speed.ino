// ==============================================
// SISURAKSHA - IR + Hall Speed Dashboard Test
// 3x E18-D80NK IR Sensors + LM393 Hall Sensor
// IR: Step 1=D27, Step 2=D26, Step 3=D25
// Hall DO: D33
// AsyncWebServer + SSE dashboard
// ==============================================

#include <WiFi.h>
#include <ESPmDNS.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <HTTPClient.h>

// -- WiFi Credentials --------------------------
const char* WIFI_SSID     = "SLT_FIBER_PYt5z";
const char* WIFI_PASSWORD = "07726Padumapks";

// Change only this laptop/server IP when your hotspot changes.
const char* SISURAKSHA_SERVER_HOST = "10.33.31.198";
const uint16_t NODE_SERVER_PORT = 5000;
const uint16_t PYTHON_WEBHOOK_PORT = 5001;

// -- IR Sensor Pins ----------------------------
#define IR_STEP1  27
#define IR_STEP2  26
#define IR_STEP3  25

#define ENABLE_STEP1  true
#define ENABLE_STEP2  true
#define ENABLE_STEP3  true

// IR sensors are active-low: LOW = object detected, HIGH = clear.
#define DETECTED       LOW
#define IR_INPUT_MODE  INPUT_PULLUP

// -- Hall Sensor Pins --------------------------
#define HALL_AO_PIN 34
#define HALL_DO_PIN 33

const int MAGNETS_PER_ROTATION = 4;
const float WHEEL_DIAMETER_M = 0.051;
const float WHEEL_CIRCUMFERENCE_M = 3.14159 * WHEEL_DIAMETER_M;

const unsigned long MEASURE_INTERVAL_MS = 500;
const unsigned long BROADCAST_INTERVAL_MS = 100;
const unsigned long LIVE_POST_INTERVAL_MS = 200;
const unsigned long SPEED_POST_INTERVAL_MS = 500;
const unsigned long MIN_PULSE_GAP_US = 3000;
const unsigned long MOVING_TIMEOUT_US = 1000000;

// -- Server + SSE ------------------------------
AsyncWebServer server(80);
AsyncEventSource events("/events");

// -- IR state ----------------------------------
volatile bool step1 = false;
volatile bool step2 = false;
volatile bool step3 = false;
bool prevStep1 = false;
bool prevStep2 = false;
bool prevStep3 = false;
bool irPostedOnce = false;

// -- Hall pulse state --------------------------
volatile unsigned long pulseCount = 0;
volatile unsigned long totalPulseCount = 0;
volatile unsigned long lastPulseTimeUs = 0;
volatile unsigned long lastPulseIntervalUs = 0;

// -- Speed state -------------------------------
float currentSpeedKmh = 0.0;
float currentRpm = 0.0;
float currentPulsesPerSecond = 0.0;
unsigned long currentWindowPulses = 0;
bool currentMoving = false;
unsigned long lastMeasureTimeMs = 0;
unsigned long lastLivePostTimeMs = 0;
unsigned long lastSpeedPostTimeMs = 0;
bool lastPostedMoving = false;

// ==============================================
// HTML Dashboard
// ==============================================
const char HTML_PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>SISURAKSHA IR + Speed</title>
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
    .steps{display:flex;gap:10px}
    .step{flex:1;border-radius:8px;padding:18px 8px;text-align:center;transition:all 0.15s ease}
    .step-label{font-size:0.82em;color:#a1a1aa;margin-bottom:8px}
    .step-num{font-size:1.7em;font-weight:bold;margin-bottom:6px}
    .step-status{font-size:0.86em;font-weight:bold}
    .clear{background:#1f2937;border:2px solid #334155}
    .occupied{background:#3f1018;border:2px solid #ef4444;animation:pulse 0.5s infinite alternate}
    @keyframes pulse{from{box-shadow:0 0 5px #ef4444}to{box-shadow:0 0 18px #ef4444}}
    #risk{text-align:center;padding:12px;border-radius:8px;margin:12px 0;font-size:1.2em;font-weight:bold}
    .risk0{background:#064e3b;color:#6ee7b7}
    .risk1{background:#713f12;color:#fbbf24}
    .risk2{background:#7c2d12;color:#fb923c}
    .risk3{background:#7f1d1d;color:#fecaca;animation:pulse 0.4s infinite alternate}
    .speed-panel{background:#1f2937;border:1px solid #334155;border-radius:8px;padding:14px}
    .speed{text-align:center;font-size:3em;font-weight:bold;color:#f8fafc}
    .unit{font-size:0.35em;color:#9ca3af}
    #moveState{text-align:center;font-size:1.3em;font-weight:bold;padding:10px;border-radius:8px;margin-top:10px}
    .moving{background:#7f1d1d;color:#fecaca}
    .stopped{background:#064e3b;color:#6ee7b7}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}
    .metric{text-align:center;background:#0f172a;border-radius:8px;padding:10px}
    .label{color:#9ca3af;font-size:0.75em;margin-bottom:4px}
    .value{font-size:1.2em;font-weight:bold}
    #info{text-align:center;color:#38bdf8;font-size:0.8em;margin:8px 0}
    #meta{text-align:center;color:#64748b;font-size:0.75em;margin-top:15px}
  </style>
</head>
<body>
  <h1>SISURAKSHA</h1>
  <h2>IR + Hall Speed Dashboard</h2>
  <div id='bar' class='dead'>Connecting...</div>

  <div class='section steps'>
    <div class='step clear' id='card1'>
      <div class='step-label'>TOP STEP</div>
      <div class='step-num'>1</div>
      <div class='step-status' id='s1txt'>Clear</div>
    </div>
    <div class='step clear' id='card2'>
      <div class='step-label'>MID STEP</div>
      <div class='step-num'>2</div>
      <div class='step-status' id='s2txt'>Clear</div>
    </div>
    <div class='step clear' id='card3'>
      <div class='step-label'>BOT STEP</div>
      <div class='step-num'>3</div>
      <div class='step-status' id='s3txt'>Clear</div>
    </div>
  </div>

  <div id='risk' class='risk0'>ALL CLEAR</div>

  <div class='section speed-panel'>
    <div class='speed'><span id='speed'>0.0</span> <span class='unit'>km/h</span></div>
    <div id='moveState' class='stopped'>STOPPED</div>
    <div class='grid'>
      <div class='metric'>
        <div class='label'>RPM</div>
        <div class='value' id='rpm'>0.0</div>
      </div>
      <div class='metric'>
        <div class='label'>Pulses/sec</div>
        <div class='value' id='pps'>0.0</div>
      </div>
      <div class='metric'>
        <div class='label'>Pulses</div>
        <div class='value' id='pulses'>0</div>
      </div>
    </div>
  </div>

  <p id='info'></p>
  <p id='meta'>SSE: /events | JSON: /data | Hall DO: GPIO 33</p>

<script>
  var es;
  var t0 = Date.now(), frames = 0;
  var RISK_TEXT  = ['ALL CLEAR','STEP 1 OCCUPIED','STEP 2 OCCUPIED','STEP 3 OCCUPIED - DANGER'];
  var RISK_CLASS = ['risk0','risk1','risk2','risk3'];

  function updateStep(cardId, txtId, occupied) {
    document.getElementById(cardId).className = 'step ' + (occupied ? 'occupied' : 'clear');
    document.getElementById(txtId).textContent = occupied ? 'OCCUPIED' : 'Clear';
  }

  function connect() {
    if (es) es.close();
    es = new EventSource('/events');

    es.onopen = function() {
      document.getElementById('bar').className = 'live';
      document.getElementById('bar').textContent = 'Live - Streaming';
    };

    es.onerror = function() {
      document.getElementById('bar').className = 'dead';
      document.getElementById('bar').textContent = 'Reconnecting...';
    };

    es.addEventListener('s', function(e) {
      try {
        var d = JSON.parse(e.data);
        updateStep('card1','s1txt', d.s1);
        updateStep('card2','s2txt', d.s2);
        updateStep('card3','s3txt', d.s3);

        var risk = 0;
        if (d.s1) risk = 1;
        if (d.s2) risk = 2;
        if (d.s3) risk = 3;

        var riskEl = document.getElementById('risk');
        riskEl.className = RISK_CLASS[risk];
        riskEl.textContent = RISK_TEXT[risk];

        document.getElementById('speed').textContent = Number(d.speed_kmh || 0).toFixed(1);
        document.getElementById('rpm').textContent = Number(d.rpm || 0).toFixed(1);
        document.getElementById('pps').textContent = Number(d.pulses_per_sec || 0).toFixed(1);
        document.getElementById('pulses').textContent = d.pulses || 0;

        var state = document.getElementById('moveState');
        state.textContent = d.moving ? 'MOVING' : 'STOPPED';
        state.className = d.moving ? 'moving' : 'stopped';

        frames++;
        var now = Date.now();
        if (now - t0 >= 1000) {
          document.getElementById('info').textContent =
            (frames*1000/(now-t0)).toFixed(1) + ' updates/sec | ' + new Date().toLocaleTimeString();
          frames = 0; t0 = now;
        }
      } catch(err) {}
    });
  }

  connect();
</script>
</body>
</html>
)rawliteral";

// ==============================================
// Hall ISR
// ==============================================
void IRAM_ATTR hallPulseISR() {
  unsigned long now = micros();
  unsigned long gap = now - lastPulseTimeUs;

  if (lastPulseTimeUs == 0 || gap > MIN_PULSE_GAP_US) {
    if (lastPulseTimeUs != 0) {
      lastPulseIntervalUs = gap;
    }
    pulseCount++;
    totalPulseCount++;
    lastPulseTimeUs = now;
  }
}

bool readIRSensor(uint8_t pin, bool enabled) {
  if (!enabled) return false;
  return digitalRead(pin) == DETECTED;
}

void refreshMovingState() {
  unsigned long lastPulseSnapshot;

  noInterrupts();
  lastPulseSnapshot = lastPulseTimeUs;
  interrupts();

  currentMoving = lastPulseSnapshot > 0 && (micros() - lastPulseSnapshot) <= MOVING_TIMEOUT_US;

  if (!currentMoving) {
    currentSpeedKmh = 0.0;
    currentRpm = 0.0;
    currentPulsesPerSecond = 0.0;
  }
}

void updateSpeedMeasurement() {
  unsigned long nowMs = millis();
  if (nowMs - lastMeasureTimeMs < MEASURE_INTERVAL_MS) {
    return;
  }

  float elapsedSeconds = (nowMs - lastMeasureTimeMs) / 1000.0;
  lastMeasureTimeMs = nowMs;

  unsigned long pulses;
  unsigned long lastIntervalSnapshot;

  noInterrupts();
  pulses = pulseCount;
  pulseCount = 0;
  lastIntervalSnapshot = lastPulseIntervalUs;
  interrupts();

  currentWindowPulses = pulses;

  if (pulses > 0) {
    currentPulsesPerSecond = pulses / elapsedSeconds;
    float rotationsPerSecond = currentPulsesPerSecond / MAGNETS_PER_ROTATION;
    currentRpm = rotationsPerSecond * 60.0;
    currentSpeedKmh = rotationsPerSecond * WHEEL_CIRCUMFERENCE_M * 3.6;
    currentMoving = true;
  } else if (currentMoving && lastIntervalSnapshot > 0) {
    float pulsePeriodSeconds = lastIntervalSnapshot / 1000000.0;
    currentPulsesPerSecond = 1.0 / pulsePeriodSeconds;
    float rotationsPerSecond = currentPulsesPerSecond / MAGNETS_PER_ROTATION;
    currentRpm = rotationsPerSecond * 60.0;
    currentSpeedKmh = rotationsPerSecond * WHEEL_CIRCUMFERENCE_M * 3.6;
  }
}

int getRiskLevel() {
  int risk = 0;
  if (step1) risk = 1;
  if (step2) risk = 2;
  if (step3) risk = 3;
  return risk;
}

String buildJSON() {
  String j = "{";
  j += "\"s1\":" + String(step1 ? "true" : "false") + ",";
  j += "\"s2\":" + String(step2 ? "true" : "false") + ",";
  j += "\"s3\":" + String(step3 ? "true" : "false") + ",";
  j += "\"risk\":" + String(getRiskLevel()) + ",";
  j += "\"speed_kmh\":" + String(currentSpeedKmh, 2) + ",";
  j += "\"rpm\":" + String(currentRpm, 2) + ",";
  j += "\"pulses\":" + String(currentWindowPulses) + ",";
  j += "\"pulses_per_sec\":" + String(currentPulsesPerSecond, 2) + ",";
  j += "\"moving\":" + String(currentMoving ? "true" : "false") + ",";
  j += "\"ts\":" + String(millis());
  j += "}";
  return j;
}

String buildIRJSON() {
  String j = "{";
  j += "\"s1\":" + String(step1 ? "true" : "false") + ",";
  j += "\"s2\":" + String(step2 ? "true" : "false") + ",";
  j += "\"s3\":" + String(step3 ? "true" : "false") + ",";
  j += "\"risk\":" + String(getRiskLevel()) + ",";
  j += "\"speed_kmh\":" + String(currentSpeedKmh, 2) + ",";
  j += "\"moving\":" + String(currentMoving ? "true" : "false") + ",";
  j += "\"ts\":" + String(millis());
  j += "}";
  return j;
}

String buildSpeedJSON() {
  String j = "{";
  j += "\"speed_kmh\":" + String(currentSpeedKmh, 2) + ",";
  j += "\"rpm\":" + String(currentRpm, 2) + ",";
  j += "\"pulses\":" + String(currentWindowPulses) + ",";
  j += "\"pulses_per_sec\":" + String(currentPulsesPerSecond, 2) + ",";
  j += "\"moving\":" + String(currentMoving ? "true" : "false") + ",";
  j += "\"ts\":" + String(millis());
  j += "}";
  return j;
}

String buildUrl(uint16_t port, const char* path) {
  String url = "http://";
  url += SISURAKSHA_SERVER_HOST;
  url += ":";
  url += String(port);
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
  http.setTimeout(500);

  int code = http.POST(body);
  if (code == 200) {
    Serial.printf("[%s] Posted OK\n", label);
  } else {
    Serial.printf("[%s] POST failed: %d\n", label, code);
  }

  http.end();
}

void postIRState() {
  String body = buildIRJSON();
  postJSON(buildUrl(PYTHON_WEBHOOK_PORT, "/ir-webhook"), body, "IR");
}

void postSpeedState() {
  String body = buildSpeedJSON();
  postJSON(buildUrl(PYTHON_WEBHOOK_PORT, "/speed-webhook"), body, "Speed");
}

void postLiveState() {
  String body = buildJSON();
  postJSON(buildUrl(NODE_SERVER_PORT, "/api/safety/live-state"), body, "Live");
}

void broadcastTask(void* param) {
  for (;;) {
    step1 = readIRSensor(IR_STEP1, ENABLE_STEP1);
    step2 = readIRSensor(IR_STEP2, ENABLE_STEP2);
    step3 = readIRSensor(IR_STEP3, ENABLE_STEP3);

    refreshMovingState();
    updateSpeedMeasurement();

    if (events.count() > 0) {
      String json = buildJSON();
      events.send(json.c_str(), "s", millis());
    }

    vTaskDelay(pdMS_TO_TICKS(BROADCAST_INTERVAL_MS));
  }
}

void webhookTask(void* param) {
  for (;;) {
    if (!irPostedOnce ||
        step1 != prevStep1 ||
        step2 != prevStep2 ||
        step3 != prevStep3) {
      postIRState();
      prevStep1 = step1;
      prevStep2 = step2;
      prevStep3 = step3;
      irPostedOnce = true;
    }

    unsigned long nowMs = millis();
    bool dueForLivePost = nowMs - lastLivePostTimeMs >= LIVE_POST_INTERVAL_MS;
    bool movingChanged = currentMoving != lastPostedMoving;
    bool dueForSpeedPost = nowMs - lastSpeedPostTimeMs >= SPEED_POST_INTERVAL_MS;

    if (dueForLivePost) {
      postLiveState();
      lastLivePostTimeMs = nowMs;
    }

    if (movingChanged || dueForSpeedPost) {
      postSpeedState();
      lastPostedMoving = currentMoving;
      lastSpeedPostTimeMs = nowMs;
    }

    vTaskDelay(pdMS_TO_TICKS(BROADCAST_INTERVAL_MS));
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(IR_STEP1, IR_INPUT_MODE);
  pinMode(IR_STEP2, IR_INPUT_MODE);
  pinMode(IR_STEP3, IR_INPUT_MODE);

  pinMode(HALL_DO_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(HALL_DO_PIN), hallPulseISR, FALLING);
  lastMeasureTimeMs = millis();

  Serial.println("====================================");
  Serial.println("SISURAKSHA IR + Hall Speed Dashboard");
  Serial.println("IR pins: D27, D26, D25");
  Serial.println("Hall DO: GPIO 33");
  Serial.print("Server host: ");
  Serial.println(SISURAKSHA_SERVER_HOST);
  Serial.println("Wheel diameter: 5.1 cm");
  Serial.println("Magnets per rotation: 4");
  Serial.println("====================================");

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
    Serial.println("\n[ERROR] WiFi failed - restarting");
    delay(2000);
    ESP.restart();
  }

  Serial.println();
  Serial.println("==============================");
  Serial.println(" WiFi Connected!");
  Serial.print(" IP Address:  http://");
  Serial.println(WiFi.localIP());

  if (MDNS.begin("sisuraksha-ir-speed")) {
    Serial.println(" mDNS hostname: http://sisuraksha-ir-speed.local");
    MDNS.addService("http", "tcp", 80);
  } else {
    Serial.println(" mDNS failed - use IP address instead");
  }

  Serial.println("==============================");

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
    Serial.printf("[SSE] Client connected\n");
    String json = buildJSON();
    client->send(json.c_str(), "s", millis(), 1000);
  });
  server.addHandler(&events);

  server.begin();
  xTaskCreatePinnedToCore(broadcastTask, "IRSpeedBroadcast", 4096, NULL, 1, NULL, 0);
  xTaskCreatePinnedToCore(webhookTask, "IRSpeedWebhook", 6144, NULL, 1, NULL, 1);

  Serial.println("Ready!");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Dropped - reconnecting...");
    WiFi.reconnect();
    delay(5000);
  }
  vTaskDelay(pdMS_TO_TICKS(5000));
}
