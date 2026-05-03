// ==============================================
// SISURAKSHA - Hall Sensor Speed Stream
// LM393 Hall Sensor + 4 Magnets
// Prototype wheel diameter = 5.1 cm
// AsyncWebServer + SSE + Flask webhook push
// ==============================================

#include <WiFi.h>
#include <ESPmDNS.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <HTTPClient.h>

// -- WiFi Credentials --------------------------
const char* WIFI_SSID     = "SLT_FIBER_PYt5z";
const char* WIFI_PASSWORD = "07726Padumapks";

// Set this to the laptop IP running footboard safety/riyabeth_pro_safety.py
const char* FOOTBOARD_SPEED_WEBHOOK_URL = "http://192.168.1.102:5001/speed-webhook";

// -- Hall Sensor Pins --------------------------
#define HALL_AO_PIN 34
#define HALL_DO_PIN 27   // Change to 33 if your final Hall pin is GPIO 33

const int MAGNETS_PER_ROTATION = 4;
const float WHEEL_DIAMETER_M = 0.051;
const float WHEEL_CIRCUMFERENCE_M = 3.14159 * WHEEL_DIAMETER_M;

// 500ms gives quick movement updates while still smoothing speed.
const unsigned long MEASURE_INTERVAL_MS = 500;
const unsigned long BROADCAST_INTERVAL_MS = 100;
const unsigned long SPEED_POST_INTERVAL_MS = 500;

// Noise filter and movement timeout.
const unsigned long MIN_PULSE_GAP_US = 3000;
const unsigned long MOVING_TIMEOUT_US = 1000000;

// -- Server + SSE ------------------------------
AsyncWebServer server(80);
AsyncEventSource events("/events");

// -- Pulse state from ISR ----------------------
volatile unsigned long pulseCount = 0;
volatile unsigned long totalPulseCount = 0;
volatile unsigned long lastPulseTimeUs = 0;
volatile unsigned long lastPulseIntervalUs = 0;

// -- Calculated speed state --------------------
float currentSpeedKmh = 0.0;
float currentRpm = 0.0;
float currentPulsesPerSecond = 0.0;
unsigned long currentWindowPulses = 0;
bool currentMoving = false;

unsigned long lastMeasureTimeMs = 0;
unsigned long lastPostTimeMs = 0;
bool lastPostedMoving = false;

// ==============================================
// HTML Dashboard
// ==============================================
const char HTML_PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>SISURAKSHA Speed</title>
  <meta name='viewport' content='width=device-width,initial-scale=1'>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;background:#111827;color:#e5e7eb;margin:0;padding:16px}
    h1{text-align:center;color:#38bdf8;margin:0 0 4px}
    h2{text-align:center;color:#94a3b8;font-size:1em;font-weight:normal;margin:0 0 16px}
    #bar{text-align:center;padding:8px;border-radius:8px;margin:8px 0;font-weight:bold}
    .live{background:#064e3b;color:#6ee7b7}
    .dead{background:#4c0519;color:#fda4af}
    .panel{background:#1f2937;border:1px solid #334155;border-radius:8px;padding:16px;margin:14px 0}
    .speed{text-align:center;font-size:3.2em;font-weight:bold;color:#f8fafc}
    .unit{font-size:0.35em;color:#94a3b8}
    .moving{background:#7f1d1d;border-color:#ef4444}
    .stopped{background:#064e3b;border-color:#22c55e}
    #state{text-align:center;font-size:1.5em;font-weight:bold;padding:12px;border-radius:8px;margin-top:12px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    .metric{text-align:center;background:#0f172a;border-radius:8px;padding:12px}
    .label{color:#94a3b8;font-size:0.78em;margin-bottom:4px}
    .value{font-size:1.35em;font-weight:bold}
    #meta{text-align:center;color:#64748b;font-size:0.75em;margin-top:15px}
  </style>
</head>
<body>
  <h1>SISURAKSHA</h1>
  <h2>Hall Sensor Speed Stream</h2>
  <div id='bar' class='dead'>Connecting...</div>

  <div class='panel'>
    <div class='speed'><span id='speed'>0.0</span> <span class='unit'>km/h</span></div>
    <div id='state' class='stopped'>STOPPED</div>
  </div>

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

  <p id='meta'>Webhook: /speed-webhook | SSE: /events | Data: /data</p>

<script>
  var es;

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
        document.getElementById('speed').textContent = Number(d.speed_kmh || 0).toFixed(1);
        document.getElementById('rpm').textContent = Number(d.rpm || 0).toFixed(1);
        document.getElementById('pps').textContent = Number(d.pulses_per_sec || 0).toFixed(1);
        document.getElementById('pulses').textContent = d.pulses || 0;

        var state = document.getElementById('state');
        state.textContent = d.moving ? 'MOVING' : 'STOPPED';
        state.className = d.moving ? 'moving' : 'stopped';
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

// ==============================================
// Build compact JSON
// ==============================================
String buildJSON() {
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

// ==============================================
// Post to Python footboard webhook
// ==============================================
void postToFootboard() {
  String body = buildJSON();

  HTTPClient http;
  http.begin(FOOTBOARD_SPEED_WEBHOOK_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(500);

  int code = http.POST(body);

  if (code == 200) {
    Serial.printf("[Speed] Posted OK | %.2f km/h | moving=%s\n",
                  currentSpeedKmh,
                  currentMoving ? "true" : "false");
  } else {
    Serial.printf("[Speed] POST failed: %d\n", code);
  }

  http.end();
}

// ==============================================
// Broadcast task - Core 0
// Calculates speed, pushes SSE, posts to Python
// ==============================================
void broadcastTask(void* param) {
  for (;;) {
    refreshMovingState();
    updateSpeedMeasurement();

    if (events.count() > 0) {
      String json = buildJSON();
      events.send(json.c_str(), "s", millis());
    }

    unsigned long nowMs = millis();
    bool movingChanged = currentMoving != lastPostedMoving;
    bool dueForPost = nowMs - lastPostTimeMs >= SPEED_POST_INTERVAL_MS;

    if (movingChanged || dueForPost) {
      postToFootboard();
      lastPostedMoving = currentMoving;
      lastPostTimeMs = nowMs;
    }

    vTaskDelay(pdMS_TO_TICKS(BROADCAST_INTERVAL_MS));
  }
}

// ==============================================
void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(HALL_DO_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(HALL_DO_PIN), hallPulseISR, FALLING);
  lastMeasureTimeMs = millis();

  Serial.println("====================================");
  Serial.println("SISURAKSHA Hall Sensor Speed Stream");
  Serial.println("Wheel diameter: 5.1 cm");
  Serial.println("Wheel circumference: 0.160 m");
  Serial.println("Magnets per rotation: 4");
  Serial.println("Hall DO: GPIO 27");
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

  if (MDNS.begin("sisuraksha-speed")) {
    Serial.println(" mDNS hostname: http://sisuraksha-speed.local");
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

  xTaskCreatePinnedToCore(broadcastTask, "SpeedBroadcast", 4096, NULL, 1, NULL, 0);

  Serial.println("Ready!");
}

// WiFi watchdog
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Dropped - reconnecting...");
    WiFi.reconnect();
    delay(5000);
  }
  vTaskDelay(pdMS_TO_TICKS(5000));
}
