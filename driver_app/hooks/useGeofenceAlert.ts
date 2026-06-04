import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { Vibration } from 'react-native';
import { usePendingDropoffs } from './useApi';

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; 
};

export const useGeofenceAlert = (isTripActive: boolean) => {
  const [missedChildren, setMissedChildren] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const { data: pendingDropoffs } = usePendingDropoffs(isTripActive);

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;
    let snoozedIds = new Set<string>();

    const startWatching = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 10,
        },
        (location) => {
          if (!pendingDropoffs || pendingDropoffs.length === 0) return;

          const currentLat = location.coords.latitude;
          const currentLon = location.coords.longitude;
          
          const nearbyMissed = pendingDropoffs.filter((child: any) => {
            if (snoozedIds.has(child.child_id)) return false;
            if (!child.target_lat || !child.target_lon) return false;
            
            const dist = getDistance(currentLat, currentLon, child.target_lat, child.target_lon);
            return dist <= 100; // Increased to 100 meters
          });

          if (nearbyMissed.length > 0) {
            setMissedChildren(nearbyMissed);
            setShowModal(true);
            Vibration.vibrate([0, 500, 200, 500]);
          }
        }
      );
    };

    if (isTripActive) startWatching();

    return () => {
      if (locationSubscription) locationSubscription.remove();
    };
  }, [isTripActive, pendingDropoffs]);

  const dismissAlert = () => {
    setShowModal(false);
  };

  return { showModal, missedChildren, dismissAlert };
};
