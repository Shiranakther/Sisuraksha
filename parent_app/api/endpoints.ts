export const API_ENDPOINTS = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  CREATE_PARENT: '/parent/parent_register',
  LOCATION:'/profile/location',
  SCHOOLS:'/parent/schools',
  REGISTER_CHILD:"/parent/register_child",
  GET_MY_CHILD:"/parent/my-children",
  SHOW_ROUTES:"/assign/nearest-routes",
  ASSIGN_DRIVER:"/assign/assign-driver"
} as const;