import { queryOptions } from "@tanstack/react-query";
import { userService } from "../../api/services/user.service";

export const userQueries = {
  all: () => ["user"],

  getUserById: (userId, options = {}) =>
    queryOptions({
      queryKey: [...userQueries.all(), userId],
      queryFn: () => userService.getUserById(userId),
      enabled: !!userId,
      ...options,
    }),
};
