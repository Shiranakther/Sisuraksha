import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

export const authApi = {
  login: async (email, password) => {
    return await axios.post(`${API_BASE_URL}/auth/login`, { email, password });
  }
};

export const userApi = {
  getAllUsers: async () => {
    return await axios.get(`${API_BASE_URL}/admin/users`);
  }
};

export const blockchainApi = {
  validate: async () => {
    return await axios.get(`${API_BASE_URL}/blockchain/validate`);
  },
  verifyBlock: async (blockId) => {
    return await axios.get(`${API_BASE_URL}/blockchain/verify/${blockId}`);
  }
};

export const vehicleApi = {
  getAllVehicles: async () => {
    return await axios.get(`${API_BASE_URL}/admin/vehicles`);
  },
  toggleStatus: async (vehicleId, field, value) => {
    return await axios.patch(`${API_BASE_URL}/admin/vehicles/${vehicleId}/status`, { field, value });
  }
};
