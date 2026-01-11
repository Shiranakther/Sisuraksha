# 🚌 Smart School Bus Safety and Monitoring Ecosystem - SISURAKSHA 
### AI-driven child safety, intelligent routing, and real-time monitoring for school transportation

---

## 📌 Project Overview  
This research project develops a complete safety and monitoring ecosystem for school buses by integrating AI, computer vision, NFC based identity verification, behavior detection, predictive routing, and automated emergency response.  
The system ensures verified boarding, safe travel, real-time driver vigilance monitoring, accurate ETAs, and immediate emergency communication with parents and school authorities.

This 1-year research focuses on solving long standing problems in school transportation such as:
- Unverified drivers and unsafe vehicles  
- Manual student attendance and missing children cases  
- Unsafe behaviors (leaning out, footboard travel, falls)  
- Driver fatigue and distraction  
- Lack of real-time ETA accuracy  
- Slow emergency response  
- No unified safety ecosystem  

Our solution provides a **smart, automated, and trustworthy platform** combining AI, IoT, mobile apps, and blockchain-backed integrity.

---

## 🎯 Main Objective  
To develop an AI driven school transportation safety ecosystem that integrates student identity validation, driver and vehicle verification, real-time behavior monitoring, intelligent routing, and automated emergency response to ensure secure, transparent, and reliable school bus operations.

---

## 🎯 Sub Objectives  
- Build secure NFC based student authentication and exit validation  
- Implement ML based driver identity and vehicle document verification  
- Develop in bus AI for child safety behavior detection  
- Build driver fatigue and distraction monitoring  
- Develop GPS + IMU-based intelligent routing and ETA prediction  
- Implement crash detection and priority-based SOS alerting  
- Create parent and driver mobile applications  
- Use blockchain hashing for tamper proof safety records  

---

## 🧩 System Features  
### 1. Identity & Trust Layer  
- NFC based student check-in/out  
- Driver license + selfie verification using ML  
- Vehicle insurance OCR and safety scoring  
- Blockchain hashing for critical events  

### 2. AI Safety Layer  
- In bus behavior detection (falls, unsafe movements, hand outside window)  
- Exit Guardian for footboard and leaning detection  
- Driver fatigue + distraction detection  
- Real time alerts to driver + admin  

### 3. Routing & Tracking Layer  
- GPS + IMU live tracking  
- ETA prediction using ML  
- Traffic delay detection  
- Alternate vehicle suggestions during breakdowns  

### 4. Emergency Layer  
- Crash detection sensors  
- Priority based automated SOS pipeline  
- Camera based injury posture analysis  
- Parent notifications  

### 5. Mobile Apps  
- Parent App: wallet, notifications, tracking  
- Driver App: verification, safety alerts, trip control  

---

## 🏗️ System Architecture Diagram


<img width="1787" height="952" alt="er_diagram drawio" src="https://github.com/user-attachments/assets/a0458a52-f5e2-4f1e-99ad-869c30488723" />


Typical architecture layers:

1. **Edge Layer**  
   Jetson Nano / Raspberry Pi  
   - In bus CV monitoring  
   - Driver monitoring  
   - NFC device integration  

2. **Backend Layer**  
   Node.js / Python  
   - Verification pipeline  
   - Routing engine  
   - SOS service  
   - ML inference APIs  

3. **Mobile Layer**  
   - Parent App  
   - Driver App  

4. **Blockchain Layer**  
   - Immutable event hashing  

---

## 🛠️ Technology Stack  
**Frontend:** React Native  
**Backend:** Node.js + Express / Python FastAPI  
**AI Models:** PyTorch, TensorFlow, MediaPipe, YOLO, Transformers  
**Edge Device:** Jetson Nano / Raspberry Pi  
**NFC Module:** PN532 Reader  
**Database:** PostgreSQL ( Superbase ) 
**Deployment:** Docker
**Others:** OpenCV, SHA-256, GPS/IMU Modules  

---

## 📂 Folder Structure

```
/server             # APIs, validation, routing engine, event hashing    
/parent_app         # Parent app  
/driver_app         # Driver app  
/ml-models          # Training notebooks & models  

```

---

## How to install

```
create .env file
 
cd server               # Navigate to server folder 
npm install             # install dependancies
npm run dev

cd driver_app           # Navigate to driver app
npm install
npm install -g expo-cli
npx expo install react-native-gesture-handler react-native-reanimated react-native-screens react-native-safe-area-context @react-navigation/native @react-navigation/bottom-tabs
npx tailwindcss init
npx expo start

cd parent_app           # Navigate to driver app
npm install
npm install -g expo-cli
npx expo install react-native-gesture-handler react-native-reanimated react-native-screens react-native-safe-area-context @react-navigation/native @react-navigation/bottom-tabs
npx tailwindcss init
npx expo start

```

## 👥 Team & Individual Contributions  

| Member | Reg No | Responsibilities |
|--------|--------|------------------|
| **M.H.S. Akther** | IT22590312 | Trust platform, NFC validation, driver/vehicle verification, blockchain hashing, parent & driver apps |
| **R.I.S.R. Pinto** | IT22610102 | Exit Guardian, footboard detection, driver fatigue & distraction AI, A-pillar CV optimization |
| **A.M.D.C. Kumara** | IT22600134 | Routing engine, ETA prediction, delay ML model, breakdown handling |
| **T.A.P.K. Shameera** | IT22606624 | Behavior detection, fall detection, posture analysis, safety alerts, edge inference pipeline |


## 📊 Used IOT Components

| Member Name | Assigned Hardware / Components |
|-------------|--------------------------------|
| **Shiran** | ESP32 (with Built-in OLED)<br>PN532 NFC/RFID Module<br>NEO-6M GPS Module<br>MicroSD Card Adapter Module<br>Passive Buzzer |
| **Kasun** | ESP32 Module<br>Raspberry Pi<br>Pressure Sensor<br>Vibration Sensor<br>Gyroscope<br>Piezo Set<br>MQ2 Smoke & Gas Sensor<br>Fire Sensor<br>Arduino Uno Board |
| **Ishan** | Raspberry Pi<br>RPI NoIR Camera<br>ESP32-CAM Module<br>NEO-6M GPS or Ublox NEO-M8N GPS Module (SMA Connector – MD0895)<br>Passive Buzzer<br>Enclosures for Pi Board with Fans<br>SD Card for Pi Board<br>NodeMCU ESP32 WiFi Bluetooth Dual Mode IoT Dev Board (MD0245)<br>**E18-D80NK Infrared Proximity Sensor (Yellow, NPN-NO, with Cable)**<br>Small Speaker |
| **Dilshan** | MPU6050<br>NEO-6M GPS Module<br>ESP32-S3 Microcontroller<br>Camera Module<br>Hall Effect Sensor<br>Fail-Safe Solenoid Deadbolt<br>Ultrasonic Sensors (HC-SR04 Type)<br>77GHz Millimeter-Wave Radar<br>Class 3R Green Laser Projectors (532nm)<br>Pneumatic Aspirator System<br>Directional Broadband Sounders<br>Floor Proximity LED Strips<br>Inertia Switch (Crash Sensor)<br>Pyrotechnic Disconnect Relay<br>Supercapacitors |


## 📊 Machine Learning Models
### 1. Behavior Monitoring Model  
- Student Behaviour - YOLO V8 s

### 2. Driver Vigilance Model  
- Face detection - YOLO V8s
- Phone-use/distraction detection  

### 3. Routing & Delay Prediction Model  
- K-means clustering  
- Poliline Geo Routing

---

## 🐳 Deployment & Containerization

The backend services, including the Node.js APIs, routing engine, and ML inference endpoints, are containerized using Docker. Docker ensures consistent environments across development, testing, and deployment, simplifies dependency management, and allows the backend to be easily scaled or deployed on cloud platforms. Each service runs in its own container, and environment variables are managed via .env files for security and flexibility.

## 🧪 Dataset Details  
- Student behavior dataset (video + annotation)  
- Driver vigilance dataset  
- Insurance OCR dataset  
- GPS route history logs  
- Attendance and delay logs  
- All datasets anonymized
- 
---

## 📅 Research Timeline (1-Year Plan)
| Month | Work |
|-------|------|
| 1–2 | Literature survey, project planning, architecture |
| 3–4 | Driver & vehicle verification pipeline |
| 5 | NFC module integration |
| 6–7 | Behavior dataset collection + model training |
| 8 | Driver monitoring + Exit Guardian |
| 9 | Routing engine + ETA prediction |
| 10 | Emergency handling + crash detection |
| 11 | System integration |
| 12 | Testing, evaluation, final documentation |

---

## 📄 Documentation  
All research documents are stored in `/docs`:

- Project Proposal  
- Topic Assessment Form  
- Research Log  
- Mid Evaluation Report  
- Final Report  
- Architecture Diagrams  
- Sprint Notes  

---

## 🙏 Acknowledgements  
We thank our supervisor(s), mentors, and institutions supporting this research.

