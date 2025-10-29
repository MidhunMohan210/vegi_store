// services/accountMasterService.js
import axios from "axios";
import { api } from "../client/apiClient.js";

export const accountMasterService = {
  // Search method remains unchanged
  search: async (
    searchTerm,
    companyId,
    branchId,
    accountType,
    limit = 25,
    filters = {}
  ) => {
    try {
      const response = await api.get("/accountmaster/searchAccounts", {
        params: {
          searchTerm,
          companyId,
          branchId,
          accountType,
          limit,
          ...filters,
        },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("An unexpected error occurred");
    }
  },

list: async (
  searchTerm = "",
  companyId,
  branchId = null,
  accountType = null,
  limit = 30,
  filters = {},
  skip = 0  // New param for pagination offset
) => {
  try {
    const response = await api.get("/accountmaster/list", {
      params: { searchTerm, companyId, branchId, accountType, limit, skip, ...filters },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || error.message);
    }
    throw new Error("An unexpected error occurred");
  }
},


  // Create new account master
  create: async (data) => {
    try {
      const response = await api.post("/accountmaster/create", data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("Error creating account");
    }
  },

  // Update existing account master by ID
  update: async (id, data) => {
    try {
      const response = await api.put(`/accountmaster/update/${id}`, data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("Error updating account");
    }
  },

  // Delete account master by ID
  delete: async (id) => {
    try {
      const response = await api.delete(`/accountmaster/delete/${id}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("Error deleting account");
    }
  },
};
