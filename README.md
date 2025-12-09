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

## Folder Structure

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


## 📊 Machine Learning Models
### 1. Behavior Monitoring Model  
- CNN + Transformer hybrid  
- Detects falls, unsafe movements, hand outside window  
- Metrics: Precision, Recall, F1, Latency  

### 2. Driver Vigilance Model  
- Face detection + fatigue estimation  
- Phone-use/distraction detection  

### 3. Routing & Delay Prediction Model  
- K-means clustering  
- ETA prediction using Random Forest / LSTM  

### 4. Anomaly Detection Model  
- Fraudulent NFC patterns  
- Unsafe route patterns  

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

