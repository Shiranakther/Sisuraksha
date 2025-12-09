export type UserRole = 'SuperAdmin' | 'CompanyAdmin' | 'Driver' | 'Parent' | 'Student';

export interface User {
  userId: string;
  role: UserRole;
  email?: string;
}

export interface AuthResponse {
  status: string;
  message: string;
  token: string;
  data: User;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (accessToken: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
}