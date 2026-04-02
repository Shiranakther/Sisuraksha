export const API_ENDPOINTS = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  
  // Driver Profile Endpoints
  DRIVER_PROFILE_GET: '/driver/profile',
  DRIVER_PROFILE_UPDATE: '/driver/profile',
  DRIVER_PROFILE_DELETE: '/driver/profile',

  SCHOOLS: '/parent/schools',
  DRIVER_ATTENDANCE:'/driver/attendance',
  ALERTS: '/driver/alerts',

  // Vehicle Management Endpoints
  VEHICLE_GET: '/driver/vehicle',
  VEHICLE_CREATE: '/driver/vehicle',
  VEHICLE_UPDATE: '/driver/vehicle',
  VEHICLE_DELETE: '/driver/vehicle',

 // Footboard Safety endpoints
  SAFETY_STATUS: '/safety/status',
  SAFETY_ALERTS: '/safety/alerts',
  SAFETY_STATS: '/safety/stats',
  
  // Footboard Model control endpoints
  MODEL_START: '/safety/model/start',
  MODEL_STOP: '/safety/model/stop',
  MODEL_STATUS: '/safety/model/status',


  // Driver Monitor endpoints
  DRIVER_MONITOR_STATUS: '/driver-monitor/status',
  DRIVER_MONITOR_ALERTS: '/driver-monitor/alerts',
  DRIVER_MONITOR_STATS: '/driver-monitor/stats',
  
  // Driver Monitor Model control endpoints
  DRIVER_MODEL_START: '/driver-monitor/model/start',
  DRIVER_MODEL_STOP: '/driver-monitor/model/stop',
  DRIVER_MODEL_STATUS: '/driver-monitor/model/status',

    // Window Safety endpoints
  WINDOW_SAFETY_STATUS: '/window-safety/status',
  WINDOW_SAFETY_ALERTS: '/window-safety/alerts',
  WINDOW_SAFETY_STATS: '/window-safety/stats',
  
  // Window Model control endpoints
  WINDOW_MODEL_START: '/window-safety/model/start',
  WINDOW_MODEL_STOP: '/window-safety/model/stop',
  WINDOW_MODEL_STATUS: '/window-safety/model/status',

    // Face Recognition
  FACE_VERIFY: '/face/verify',
  FACE_SERVICE_STATUS: '/face/service/status',

} as const;