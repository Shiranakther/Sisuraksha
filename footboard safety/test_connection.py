"""
Test script to verify connection between Python model and server
"""
import requests
from datetime import datetime

SERVER_URL = "http://localhost:5000/api/safety"
DRIVER_ID = "8c394627-e397-4bd5-928f-4cc66cfebac1"

print("=" * 50)
print("Testing Footboard Safety System Connection")
print("=" * 50)

# Test 1: Check server status
print("\n1. Testing GET /status...")
try:
    r = requests.get(f"{SERVER_URL}/status", timeout=5)
    print(f"   ✓ Status: {r.status_code}")
    print(f"   Response: {r.json()}")
except Exception as e:
    print(f"   ✗ Error: {e}")

# Test 2: Send heartbeat
print("\n2. Testing POST /heartbeat...")
try:
    r = requests.post(f"{SERVER_URL}/heartbeat", json={"driver_id": DRIVER_ID}, timeout=5)
    print(f"   ✓ Status: {r.status_code}")
    print(f"   Response: {r.json()}")
except Exception as e:
    print(f"   ✗ Error: {e}")

# Test 3: Check status again (should be online now)
print("\n3. Testing GET /status (should be online now)...")
try:
    r = requests.get(f"{SERVER_URL}/status?driver_id={DRIVER_ID}", timeout=5)
    print(f"   ✓ Status: {r.status_code}")
    print(f"   Response: {r.json()}")
except Exception as e:
    print(f"   ✗ Error: {e}")

# Test 4: Send test alert
print("\n4. Testing POST /alerts...")
try:
    payload = {
        "driver_id": DRIVER_ID,
        "timestamp": datetime.now().isoformat(),
        "alert_type": "Test",
        "status": "WARNING",
        "speed": 10.5,
        "confidence": 0.95,
        "message": "Test alert from Python script"
    }
    r = requests.post(f"{SERVER_URL}/alerts", json=payload, timeout=5)
    print(f"   ✓ Status: {r.status_code}")
    print(f"   Response: {r.json()}")
except Exception as e:
    print(f"   ✗ Error: {e}")

# Test 5: Get alerts
print("\n5. Testing GET /alerts...")
try:
    r = requests.get(f"{SERVER_URL}/alerts?limit=5", timeout=5)
    print(f"   ✓ Status: {r.status_code}")
    print(f"   Found {len(r.json())} alerts")
    if r.json():
        print(f"   Latest: {r.json()[0]}")
except Exception as e:
    print(f"   ✗ Error: {e}")

print("\n" + "=" * 50)
print("Test Complete!")
print("=" * 50)
