#include <Arduino.h>
#include "esp_camera.h"
#include <WiFi.h>
#include <ESPmDNS.h>          // mDNS — reach board at sisuraksha-cam.local

// ===========================
// Select camera model in board_config.h
// ===========================
#include "board_config.h"
//ishanggggghgllll

// ===========================
// Direct WiFi mode: edit WIFI_SSID and WIFI_PASSWORD before flashing.
// ===========================
//const char* WIFI_SSID     = "YOUR_WIFI_NAME";
//const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* WIFI_SSID     = "SLT_FIBER_PYt5z";
const char* WIFI_PASSWORD = "07726Padumapks";

#define MDNS_HOSTNAME  "sisuraksha-cam"  // board reachable at sisuraksha-cam.local
#define WIFI_CONNECT_TIMEOUT_MS 20000
#define CAMERA_USE_STABLE_MODE 1
// NOTE: GPIO 4 (flash LED) is managed by app_httpd.cpp via LEDC PWM.
// Do NOT use it here — it will break camera streaming.

void startCameraServer();
void setupLedFlash();

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(false);
  Serial.println();

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.frame_size = CAMERA_USE_STABLE_MODE ? FRAMESIZE_QVGA : FRAMESIZE_VGA;
  config.pixel_format = PIXFORMAT_JPEG;  // for streaming
  //config.pixel_format = PIXFORMAT_RGB565; // for face detection/recognition
  config.grab_mode = CAMERA_GRAB_LATEST;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.jpeg_quality = CAMERA_USE_STABLE_MODE ? 14 : 12;
  config.fb_count = 1;

  // if PSRAM IC present, init with UXGA resolution and higher JPEG quality
  //                      for larger pre-allocated frame buffer.
  if (config.pixel_format == PIXFORMAT_JPEG) {
    if (psramFound()) {
      config.jpeg_quality = CAMERA_USE_STABLE_MODE ? 14 : 12;
      config.fb_count = 2;
      config.grab_mode = CAMERA_GRAB_LATEST;
    } else {
      // Limit the frame size when PSRAM is not available
      config.frame_size = FRAMESIZE_QVGA;
      config.fb_location = CAMERA_FB_IN_DRAM;
      config.jpeg_quality = 14;
      config.fb_count = 1;
    }
  } else {
    // Best option for face detection/recognition
    config.frame_size = FRAMESIZE_240X240;
#if CONFIG_IDF_TARGET_ESP32S3
    config.fb_count = 2;
#endif
  }

#if defined(CAMERA_MODEL_ESP_EYE)
  pinMode(13, INPUT_PULLUP);
  pinMode(14, INPUT_PULLUP);
#endif

  // camera init
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }

  sensor_t *s = esp_camera_sensor_get();
  // initial sensors are flipped vertically and colors are a bit saturated
  if (s->id.PID == OV3660_PID) {
    s->set_vflip(s, 1);        // flip it back
    s->set_brightness(s, 1);   // up the brightness just a bit
    s->set_saturation(s, -2);  // lower the saturation
  }
  // drop down frame size for higher initial frame rate
  if (config.pixel_format == PIXFORMAT_JPEG) {
    s->set_framesize(s, psramFound() ? (CAMERA_USE_STABLE_MODE ? FRAMESIZE_QVGA : FRAMESIZE_VGA) : FRAMESIZE_QVGA);
    s->set_quality(s, psramFound() ? (CAMERA_USE_STABLE_MODE ? 14 : 12) : 14);
    s->set_brightness(s, 1);
    s->set_contrast(s, 1);
    s->set_saturation(s, 0);
    s->set_denoise(s, 1);
    s->set_sharpness(s, 1);
    s->set_lenc(s, 1);
    s->set_exposure_ctrl(s, 1);
    s->set_gain_ctrl(s, 1);
    s->set_whitebal(s, 1);
    s->set_awb_gain(s, 1);
  }

#if defined(CAMERA_MODEL_M5STACK_WIDE) || defined(CAMERA_MODEL_M5STACK_ESP32CAM)
  s->set_vflip(s, 1);
  s->set_hmirror(s, 1);
#endif

#if defined(CAMERA_MODEL_ESP32S3_EYE)
  s->set_vflip(s, 1);
#endif

// Setup LED FLash if LED pin is defined in camera_pins.h
#if defined(LED_GPIO_NUM)
  setupLedFlash();
#endif

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setTxPower(WIFI_POWER_19_5dBm); // MAX OUT TX POWER to reduce stream stutter
  WiFi.setAutoReconnect(true);         // Idea from IR code: Auto heal network connection
  WiFi.persistent(true);               // Idea from IR code: Cache connection properties
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  const unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Connection failed - rebooting");
    delay(1000);
    ESP.restart();
  }

  Serial.println("[WiFi] Connected! IP: " + WiFi.localIP().toString());
  Serial.println("[WiFi] SSID: " + WiFi.SSID());

  // ── mDNS — reach this board at http://sisuraksha-cam.local ─
  if (MDNS.begin(MDNS_HOSTNAME)) {
    Serial.println("[mDNS] Registered: http://" + String(MDNS_HOSTNAME) + ".local");
    MDNS.addService("http", "tcp", 80);
  } else {
    Serial.println("[mDNS] Failed — use IP address instead");
  }

  startCameraServer();

  Serial.print("Camera Ready! Use 'http://");
  Serial.print(WiFi.localIP());
  Serial.println("' to connect");
  Serial.print("OpenCV MJPEG stream: http://");
  Serial.print(WiFi.localIP());
  Serial.println(":81/stream");
}

// WiFi Watchdog Loop - adapted from your IR code!
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WiFi] Dropped - reconnecting...");
      WiFi.reconnect();
      delay(5000);
  }
  vTaskDelay(pdMS_TO_TICKS(5000));
}
