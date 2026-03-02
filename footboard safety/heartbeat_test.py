"""
Simple heartbeat and alert test script - no camera required
"""
import requests
import time
import random

SERVER_URL = "http://localhost:5000/api/safety"
DRIVER_ID = "8c394627-e397-4bd5-928f-4cc66cfebac1"  # Working driver ID

def send_heartbeat():
    try:
        r = requests.post(f"{SERVER_URL}/heartbeat", json={"driver_id": DRIVER_ID}, timeout=2)
        return r.status_code == 200
    except:
        return False

def send_test_alert(alert_type, status, message):
    try:
        data = {
            "driver_id": DRIVER_ID,
            "alert_type": alert_type,
            "status": status,
            "speed": round(random.uniform(5, 30), 1),
            "confidence": round(random.uniform(0.85, 0.99), 2),
            "message": message,
            "sound": status == "CRITICAL"
        }
        r = requests.post(f"{SERVER_URL}/alerts", json=data, timeout=2)
        print(f"📨 Alert sent: {status} - {message}")
        return r.status_code == 201
    except Exception as e:
        print(f"❌ Alert failed: {e}")
        return False

print("=" * 50)
print("🚌 Footboard Safety System - Test Mode")
print(f"📡 Server: {SERVER_URL}")
print(f"👤 Driver: {DRIVER_ID}")
print("=" * 50)
print("\nSending heartbeats every 5 seconds...")
print("Press Ctrl+C to stop\n")

# Send initial heartbeat
if send_heartbeat():
    print("✅ System ONLINE - Connected to server")
else:
    print("❌ Failed to connect to server")

# Send a test alert on startup
send_test_alert("Test", "WARNING", "System test - Footboard monitoring active")

heartbeat_count = 0
try:
    while True:
        time.sleep(5)
        if send_heartbeat():
            heartbeat_count += 1
            print(f"💓 Heartbeat #{heartbeat_count} sent")
            
            # Send random alert every 30 seconds for testing
            if heartbeat_count % 6 == 0:
                alerts = [
                    ("Danger", "CRITICAL", "CRITICAL: Bus moving with footboard occupied!"),
                    ("Warning", "WARNING", "WARNING: Person detected near footboard"),
                    ("Safe", "SAFE", "Footboard clear - Safe to proceed"),
                ]
                alert = random.choice(alerts)
                send_test_alert(*alert)
        else:
            print("⚠️ Heartbeat failed - server may be down")
            
except KeyboardInterrupt:
    print("\n\n🛑 Test stopped by user")
