// hooks/mutations/companySettings.mutation.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDispatch } from "react-redux";
import { companySettingsService } from "@/api/services/companySettings.service";
import { setCurrentFY } from "@/store/slices/fySlice";


export const useUpdateFinancialYear = (companyId) => {
  const qc = useQueryClient();
  const dispatch = useDispatch();

  return useMutation({
    mutationFn: (currentFY) =>
      companySettingsService.updateFinancialYear(companyId, currentFY),
    onSuccess: (res) => {
      // res.data = updated settings document
      const fy = res?.data?.financialYear;
      if (fy) {
        dispatch(
          setCurrentFY({
            currentFY: fy.currentFY,
            startDate: fy.startDate,
            endDate: fy.endDate,
          })
        );
      }

      // refresh settings query
      qc.invalidateQueries(["companySettings", "detail", companyId]);
    },
  });
};
