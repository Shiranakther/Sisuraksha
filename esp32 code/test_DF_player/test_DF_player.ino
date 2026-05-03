// ==============================================
// ESP32 + DFPlayer Mini Test
// Wiring:
// DFPlayer TX -> ESP32 RX2 / GPIO16
// DFPlayer RX -> ESP32 TX2 / GPIO17 through 1k resistor
// ESP32 5V/VIN       -> DFPlayer VCC
// ESP32 GND          -> DFPlayer GND
// Speaker            -> DFPlayer SPK_1 and SPK_2
//
// SD card:
// Best test layout:
// Root: /0001.mp3
// MP3 folder: /mp3/0001.mp3
// Folder mode: /01/001.mp3
//
// Library:
// Install "DFRobotDFPlayerMini" from Arduino Library Manager.
// ==============================================

#include <Arduino.h>
#include <DFRobotDFPlayerMini.h>

// These are ESP32 Serial2 pins.
#define ESP32_RX2_PIN 16
#define ESP32_TX2_PIN 17

HardwareSerial dfSerial(2);
DFRobotDFPlayerMini dfPlayer;

int volumeLevel = 25;
bool dfPlayerReady = false;

void printMenu() {
  Serial.println();
  Serial.println("DFPlayer Mini test commands:");
  Serial.println("  1 = play root file 0001.mp3");
  Serial.println("  2 = play root file 0002.mp3");
  Serial.println("  m = play /mp3/0001.mp3");
  Serial.println("  f = play /01/001.mp3");
  Serial.println("  n = next track");
  Serial.println("  p = previous track");
  Serial.println("  s = stop");
  Serial.println("  r = resume");
  Serial.println("  + = volume up");
  Serial.println("  - = volume down");
  Serial.println("  ? = show this menu");
  Serial.println();
}

void printDfPlayerStatus(uint8_t type, int value) {
  switch (type) {
    case TimeOut:
      Serial.println("DFPlayer timeout.");
      break;
    case WrongStack:
      Serial.println("DFPlayer command stack error.");
      break;
    case DFPlayerCardInserted:
      Serial.println("SD card inserted.");
      break;
    case DFPlayerCardRemoved:
      Serial.println("SD card removed.");
      break;
    case DFPlayerCardOnline:
      Serial.println("SD card online.");
      break;
    case DFPlayerUSBInserted:
      Serial.println("USB inserted.");
      break;
    case DFPlayerUSBRemoved:
      Serial.println("USB removed.");
      break;
    case DFPlayerPlayFinished:
      Serial.print("Track finished: ");
      Serial.println(value);
      break;
    case 11:
      Serial.print("Track finished/status complete: ");
      Serial.println(value);
      break;
    case DFPlayerError:
      Serial.print("DFPlayer error: ");
      switch (value) {
        case Busy:
          Serial.println("card not found");
          break;
        case Sleeping:
          Serial.println("sleeping");
          break;
        case SerialWrongStack:
          Serial.println("serial command error");
          break;
        case CheckSumNotMatch:
          Serial.println("checksum mismatch");
          break;
        case FileIndexOut:
          Serial.println("file index out of range");
          break;
        case FileMismatch:
          Serial.println("file not found");
          break;
        case Advertise:
          Serial.println("advertise error");
          break;
        default:
          Serial.println(value);
          break;
      }
      break;
    default:
      Serial.print("DFPlayer status type ");
      Serial.print(type);
      Serial.print(", value ");
      Serial.println(value);
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("Starting DFPlayer Mini test...");
  Serial.println("Wiring should be:");
  Serial.println("  DFPlayer TX -> ESP32 RX2 / GPIO16");
  Serial.println("  DFPlayer RX -> ESP32 TX2 / GPIO17");
  Serial.println("  DFPlayer GND -> ESP32 GND");

  dfSerial.begin(9600, SERIAL_8N1, ESP32_RX2_PIN, ESP32_TX2_PIN);

  Serial.println("Trying DFPlayer normal mode...");
  dfPlayerReady = dfPlayer.begin(dfSerial);

  if (!dfPlayerReady) {
    Serial.println("Normal mode failed. Trying no-ACK mode for clone modules...");
    dfPlayerReady = dfPlayer.begin(dfSerial, false, false);
  }

  if (!dfPlayerReady) {
    Serial.println("DFPlayer Mini not detected.");
    Serial.println("Check power, common GND, RX/TX crossing, SD card format, and GPIO16/GPIO17.");
    Serial.println("The sketch will keep running so you can reset after fixing wiring.");
    printMenu();
    return;
  }

  dfPlayer.volume(volumeLevel);
  dfPlayer.EQ(DFPLAYER_EQ_NORMAL);
  dfPlayer.outputDevice(DFPLAYER_DEVICE_SD);

  Serial.println("DFPlayer Mini ready.");
  Serial.print("Volume: ");
  Serial.println(volumeLevel);
  printMenu();
}

void loop() {
  if (dfPlayerReady && dfPlayer.available()) {
    printDfPlayerStatus(dfPlayer.readType(), dfPlayer.read());
  }

  if (!Serial.available()) {
    return;
  }

  char command = Serial.read();

  switch (command) {
    case '1':
      if (!dfPlayerReady) {
        Serial.println("DFPlayer is not ready yet. Reset ESP32 after checking wiring/power.");
        break;
      }
      Serial.println("Playing root file 0001.mp3");
      dfPlayer.play(1);
      break;
    case '2':
      if (!dfPlayerReady) {
        Serial.println("DFPlayer is not ready yet. Reset ESP32 after checking wiring/power.");
        break;
      }
      Serial.println("Playing root file 0002.mp3");
      dfPlayer.play(2);
      break;
    case 'm':
    case 'M':
      if (!dfPlayerReady) {
        Serial.println("DFPlayer is not ready yet. Reset ESP32 after checking wiring/power.");
        break;
      }
      Serial.println("Playing /mp3/0001.mp3");
      dfPlayer.playMp3Folder(1);
      break;
    case 'f':
    case 'F':
      if (!dfPlayerReady) {
        Serial.println("DFPlayer is not ready yet. Reset ESP32 after checking wiring/power.");
        break;
      }
      Serial.println("Playing /01/001.mp3");
      dfPlayer.playFolder(1, 1);
      break;
    case 'n':
    case 'N':
      if (!dfPlayerReady) {
        Serial.println("DFPlayer is not ready yet. Reset ESP32 after checking wiring/power.");
        break;
      }
      Serial.println("Next track");
      dfPlayer.next();
      break;
    case 'p':
    case 'P':
      if (!dfPlayerReady) {
        Serial.println("DFPlayer is not ready yet. Reset ESP32 after checking wiring/power.");
        break;
      }
      Serial.println("Previous track");
      dfPlayer.previous();
      break;
    case 's':
    case 'S':
      if (!dfPlayerReady) {
        Serial.println("DFPlayer is not ready yet. Reset ESP32 after checking wiring/power.");
        break;
      }
      Serial.println("Stop");
      dfPlayer.stop();
      break;
    case 'r':
    case 'R':
      if (!dfPlayerReady) {
        Serial.println("DFPlayer is not ready yet. Reset ESP32 after checking wiring/power.");
        break;
      }
      Serial.println("Resume");
      dfPlayer.start();
      break;
    case '+':
      if (!dfPlayerReady) {
        Serial.println("DFPlayer is not ready yet. Reset ESP32 after checking wiring/power.");
        break;
      }
      if (volumeLevel < 30) {
        volumeLevel++;
        dfPlayer.volume(volumeLevel);
      }
      Serial.print("Volume: ");
      Serial.println(volumeLevel);
      break;
    case '-':
      if (!dfPlayerReady) {
        Serial.println("DFPlayer is not ready yet. Reset ESP32 after checking wiring/power.");
        break;
      }
      if (volumeLevel > 0) {
        volumeLevel--;
        dfPlayer.volume(volumeLevel);
      }
      Serial.print("Volume: ");
      Serial.println(volumeLevel);
      break;
    case '?':
      printMenu();
      break;
    case '\n':
    case '\r':
      break;
    default:
      Serial.println("Unknown command. Send ? for help.");
      break;
  }
}
