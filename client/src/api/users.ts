import { apiClient } from './client';

export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  provider: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateUserDto {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  role?: string;
}

export interface UpdateUserDto {
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  role?: string;
}

export const getUsers = async (page = 1, limit = 20, search?: string) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.append('search', search);
  const { data } = await apiClient.get<UsersResponse>(`/users?${params}`);
  return data;
};

export const getUser = async (id: string) => {
  const { data } = await apiClient.get<User>(`/users/${id}`);
  return data;
};

export const createUser = async (dto: CreateUserDto) => {
  const { data } = await apiClient.post<User>('/users', dto);
  return data;
};

export const updateUser = async (id: string, dto: UpdateUserDto) => {
  const { data } = await apiClient.patch<User>(`/users/${id}`, dto);
  return data;
};

export const deleteUser = async (id: string) => {
  const { data } = await apiClient.delete<User>(`/users/${id}`);
  return data;
};
