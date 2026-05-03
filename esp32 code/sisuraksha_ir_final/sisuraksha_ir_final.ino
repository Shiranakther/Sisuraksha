// ==============================================
// SISURAKSHA - Footboard IR Sensor Dashboard
// IT22610102 | Pinto R.I.S.R
// 3x E18-D80NK IR Sensors
// Step 1 = D27, Step 2 = D26, Step 3 = D25
// AsyncWebServer + SSE — no freezing
// ==============================================

#include <WiFi.h>
#include <ESPmDNS.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <HTTPClient.h>

// -- WiFi Credentials --------------------------
const char* WIFI_SSID     = "SLT_FIBER_PYt5z";
const char* WIFI_PASSWORD = "07726Padumapks";


// -- IR Sensor Pins ----------------------------
#define IR_STEP1  27    // top step    — lowest risk
#define IR_STEP2  26    // middle step — medium risk
#define IR_STEP3  25    // bottom step — highest risk

// Enable only the sensors that are physically connected.
// For a one-sensor test on D25, keep Step 1/2 disabled so their pins cannot float.
#define ENABLE_STEP1  true
#define ENABLE_STEP2  true
#define ENABLE_STEP3  true

// IR sensors are active-low: LOW = object detected, HIGH = clear.
// If a sensor later behaves the opposite way, change both lines to HIGH / INPUT_PULLDOWN.
#define DETECTED       LOW
#define IR_INPUT_MODE  INPUT_PULLUP

// -- Server + SSE ------------------------------
AsyncWebServer   server(80);
AsyncEventSource events("/events");

// -- Node.js Backend ---------------------------
// Change this to your Node.js server IP
// Use mDNS hostname if available
//const char* NODE_SERVER = "http://192.168.1.102:5000/api/safety/alerts";

// Set this to the laptop IP running footboard safety/riyabeth_pro_safety.py
const char* FOOTBOARD_WEBHOOK_URL = "http://192.168.1.102:5001/ir-webhook";

// -- Sensor state (updated every 50ms) ---------
volatile bool step1 = false;
volatile bool step2 = false;
volatile bool step3 = false;

// Previous state — only POST when changed
bool prevStep1 = false;
bool prevStep2 = false;
bool prevStep3 = false;

// ==============================================
// HTML Dashboard
// ==============================================
const char HTML_PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>SISURAKSHA</title>
  <meta name='viewport' content='width=device-width,initial-scale=1'>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;background:#1a1a2e;color:#eee;margin:0;padding:15px}
    h1{color:#e94560;text-align:center;margin-bottom:5px}
    h2{text-align:center;color:#aaa;font-size:1em;font-weight:normal;margin:0 0 12px}
    #bar{text-align:center;padding:8px;border-radius:8px;margin:8px 0;font-weight:bold;font-size:1.1em}
    .live{background:#1a3a1a;color:#44ff44}
    .dead{background:#3a1a1a;color:#ff6666}

    /* Step cards */
    .steps{display:flex;gap:10px;margin:15px 0}
    .step{flex:1;border-radius:12px;padding:20px 10px;text-align:center;transition:all 0.15s ease}
    .step-label{font-size:0.85em;color:#aaa;margin-bottom:8px}
    .step-num{font-size:1.8em;font-weight:bold;margin-bottom:6px}
    .step-status{font-size:0.9em;font-weight:bold}

    .clear{background:#16213e;border:2px solid #0f3460}
    .occupied{background:#3a0a0a;border:2px solid #ff4444;animation:pulse 0.5s infinite alternate}

    @keyframes pulse{from{box-shadow:0 0 5px #ff4444}to{box-shadow:0 0 20px #ff4444}}

    /* Risk banner */
    #risk{text-align:center;padding:12px;border-radius:10px;margin:15px 0;font-size:1.3em;font-weight:bold;transition:all 0.2s}
    .risk0{background:#1a3a1a;color:#44ff44}
    .risk1{background:#3a2a00;color:#ffaa00}
    .risk2{background:#3a1500;color:#ff6600}
    .risk3{background:#3a0000;color:#ff2222;animation:pulse 0.4s infinite alternate}

    /* Info */
    #info{text-align:center;color:#00b4d8;font-size:0.82em;margin:6px 0}
    #meta{text-align:center;color:#444;font-size:0.75em;margin-top:15px}

    /* Log */
    .card{background:#16213e;border-radius:10px;padding:12px;margin:12px 0}
    h3{color:#fff;background:#0f3460;padding:6px 10px;border-radius:6px;margin:0 0 8px}
    #log{font-family:monospace;font-size:0.82em;color:#aaa;height:120px;overflow-y:auto}
    .log-entry{padding:2px 0;border-bottom:1px solid #0f3460}
    .log-alert{color:#ff6666}
    .log-clear{color:#44ff44}
  </style>
</head>
<body>
  <h1>SISURAKSHA</h1>
  <h2>Footboard Safety Monitor</h2>

  <div id='bar' class='dead'>Connecting...</div>

  <!-- Step Cards -->
  <div class='steps'>
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

  <!-- Risk Banner -->
  <div id='risk' class='risk0'>ALL CLEAR</div>

  <p id='info'></p>

  <!-- Event Log -->
  <div class='card'>
    <h3>Event Log</h3>
    <div id='log'></div>
  </div>

  <p id='meta'>IT22610102 Pinto R.I.S.R | SISURAKSHA 25-26J-282</p>

<script>
  var es;
  var t0 = Date.now(), frames = 0;
  var prev = {s1:false, s2:false, s3:false};

  var RISK_TEXT  = ['ALL CLEAR','STEP 1 OCCUPIED','STEP 2 OCCUPIED','STEP 3 OCCUPIED - DANGER'];
  var RISK_CLASS = ['risk0','risk1','risk2','risk3'];

  function addLog(msg, isAlert) {
    var log  = document.getElementById('log');
    var entry = document.createElement('div');
    var time  = new Date().toLocaleTimeString();
    entry.className = 'log-entry ' + (isAlert ? 'log-alert' : 'log-clear');
    entry.textContent = '[' + time + '] ' + msg;
    log.insertBefore(entry, log.firstChild);
    // Keep max 50 entries
    while (log.children.length > 50) log.removeChild(log.lastChild);
  }

  function updateStep(cardId, txtId, occupied, stepName) {
    document.getElementById(cardId).className = 'step ' + (occupied ? 'occupied' : 'clear');
    document.getElementById(txtId).textContent  = occupied ? 'OCCUPIED' : 'Clear';
  }

  function connect() {
    if (es) es.close();
    es = new EventSource('/events');

    es.onopen = function() {
      document.getElementById('bar').className   = 'live';
      document.getElementById('bar').textContent = 'Live - Streaming';
    };

    es.onerror = function() {
      document.getElementById('bar').className   = 'dead';
      document.getElementById('bar').textContent = 'Reconnecting...';
    };

    es.addEventListener('s', function(e) {
      try {
        var d = JSON.parse(e.data);

        // Update step cards
        updateStep('card1','s1txt', d.s1, 'Step 1');
        updateStep('card2','s2txt', d.s2, 'Step 2');
        updateStep('card3','s3txt', d.s3, 'Step 3');

        // Risk level — step 3 = highest risk
        var risk = 0;
        if (d.s1) risk = 1;
        if (d.s2) risk = 2;
        if (d.s3) risk = 3;

        var riskEl = document.getElementById('risk');
        riskEl.className   = RISK_CLASS[risk];
        riskEl.textContent = RISK_TEXT[risk];

        // Log changes only
        if (d.s1 !== prev.s1) addLog('Step 1: ' + (d.s1 ? 'OCCUPIED' : 'Clear'), d.s1);
        if (d.s2 !== prev.s2) addLog('Step 2: ' + (d.s2 ? 'OCCUPIED' : 'Clear'), d.s2);
        if (d.s3 !== prev.s3) addLog('Step 3: ' + (d.s3 ? 'OCCUPIED' : 'Clear'), d.s3);
        prev = {s1:d.s1, s2:d.s2, s3:d.s3};

        // FPS
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
  addLog('Dashboard loaded', false);
</script>
</body>
</html>
)rawliteral";

// ==============================================
// Build compact JSON
// ==============================================
String buildJSON() {
    String j = "{";
    j += "\"s1\":" + String(step1 ? "true" : "false") + ",";
    j += "\"s2\":" + String(step2 ? "true" : "false") + ",";
    j += "\"s3\":" + String(step3 ? "true" : "false");
    j += "}";
    return j;
}

bool readIRSensor(uint8_t pin, bool enabled) {
    if (!enabled) return false;
    return digitalRead(pin) == DETECTED;
}

// ==============================================
// Post to Node.js backend
// Called only when sensor state changes
// ==============================================
void postToNode(bool s1, bool s2, bool s3) {
    // Calculate risk level
    int risk = 0;
    if (s1) risk = 1;
    if (s2) risk = 2;
    if (s3) risk = 3;

    String body = "{";
    body += "\"s1\":"   + String(s1 ? "true" : "false") + ",";
    body += "\"s2\":"   + String(s2 ? "true" : "false") + ",";
    body += "\"s3\":"   + String(s3 ? "true" : "false") + ",";
    body += "\"risk\":" + String(risk) + ",";
    body += "\"ts\":"   + String(millis());  // timestamp
    body += "}";

    HTTPClient http;
    http.begin(FOOTBOARD_WEBHOOK_URL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(500);  // 500ms timeout — don't block long

    int code = http.POST(body);

    if (code == 200) {
        Serial.printf("[Node] Posted OK | risk=%d\n", risk);
    } else {
        Serial.printf("[Node] POST failed: %d\n", code);
    }

    http.end();
}

// ==============================================
// Broadcast task — Core 0
// Reads sensors, pushes SSE every 100ms
// Posts to Node.js only on state change
// ==============================================
void broadcastTask(void* param) {
    for (;;) {
        // Read all 3 IR sensors
        step1 = readIRSensor(IR_STEP1, ENABLE_STEP1);
        step2 = readIRSensor(IR_STEP2, ENABLE_STEP2);
        step3 = readIRSensor(IR_STEP3, ENABLE_STEP3);

        // Push SSE to dashboard clients
        if (events.count() > 0) {
            String json = buildJSON();
            events.send(json.c_str(), "s", millis());
        }

        // POST to Node.js only when state changes
        if (step1 != prevStep1 ||
            step2 != prevStep2 ||
            step3 != prevStep3) {
            postToNode(step1, step2, step3);
            prevStep1 = step1;
            prevStep2 = step2;
            prevStep3 = step3;
        }

        vTaskDelay(pdMS_TO_TICKS(100));  // 10 updates/sec
    }
}

// ==============================================
void setup() {
    Serial.begin(115200);
    delay(500);

    // IR sensor pins
    pinMode(IR_STEP1, IR_INPUT_MODE);
    pinMode(IR_STEP2, IR_INPUT_MODE);
    pinMode(IR_STEP3, IR_INPUT_MODE);
    Serial.println("[IR] Sensors initialized on D27, D26, D25");

    // WiFi
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

    // mDNS — fixed hostname on any network
    if (MDNS.begin("sisuraksha-footboard")) {
        Serial.println(" mDNS hostname: http://sisuraksha-footboard.local");
        MDNS.addService("http", "tcp", 80);
    } else {
        Serial.println(" mDNS failed - use IP address instead");
    }

    Serial.println("==============================");

    // Routes
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

    // Single broadcast task on Core 0
    // Digital reads are safe on any core — no I2C contention
    xTaskCreatePinnedToCore(broadcastTask, "Broadcast", 4096, NULL, 1, NULL, 0);

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
