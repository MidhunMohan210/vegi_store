import axios from "axios";
import { api } from "../client/apiClient.js";
import { createResourceApi } from "../client/apiFactory.js";
export const userApi = createResourceApi("user", {
  create: "createusers", //POST route
  getAll: "users", //GET route
  update: "update", //PUT route
  delete: "delete", //DELETE route
});

export const userService = {
  // Inherit all base methods
  ...userApi,

  getUserById: async (userId) => {
    try {
      const response = await api.get(`/user/${userId}`, {
      
      });

      return response.data;
    } catch (error) {
      console.log("error", error);
      
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("An unexpected error occurred");
    }
  },

  updateUserAccess: async (userId, access) => {
    try {
      const response = await api.put(`/user/update-access/${userId}`, {
        access,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("An unexpected error occurred");
    }
  },
};
