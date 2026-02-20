import { userService } from "@/api/services/user.service";
import { toast } from "sonner";

export const userMutations = {
  updateAccess: (queryClient) => ({
    mutationFn: ({ userId, access }) => userService.updateUserAccess(userId, access),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["user", variables.userId] });
      toast.success("User access updated successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update user access");
    },
  }),
};
