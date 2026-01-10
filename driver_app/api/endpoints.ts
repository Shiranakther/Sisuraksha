export const API_ENDPOINTS = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  SCHOOLS: '/parent/schools',
  DRIVER_ATTENDANCE:'/driver/attendance',
  ALERTS: '/driver/alerts',

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



} as const;