// hooks/queries/openingBalance.queries.ts
import { queryOptions } from "@tanstack/react-query";
import { openingBalanceService } from "@/api/services/openingBalance.service";

// hooks/queries/openingBalance.queries.ts
export const openingBalanceQueries = {
  all: () => ["openingBalance"],

  list: (entityType, entityId, companyId, branchId, page) =>
    queryOptions({
      queryKey: [
        ...openingBalanceQueries.all(),
        "list",
        entityType,
        entityId,
        companyId,
        branchId,
        page,
      ],
      queryFn: () =>
        openingBalanceService.getYearWiseBalances(
          entityType,
          entityId,
          companyId,
          branchId,
          page
        ),
      enabled: !!entityId && !!companyId && !!branchId,
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      
    }),

  // Get recalculation impact summary
  recalculationImpact: (entityType, entityId, companyId, branchId) =>
    queryOptions({
      queryKey: [
        ...openingBalanceQueries.all(),
        "recalculationImpact",
        entityType,
        entityId,
        companyId,
        branchId,
      ],
      queryFn: () =>
        openingBalanceService.getRecalculationImpact(
          entityType,
          entityId,
          companyId,
          branchId
        ),
      enabled: !!entityType && !!entityId && !!companyId,
      staleTime: 60 * 1000, // 1 minute
      retry: 2, // Retry failed requests twice
      refetchOnWindowFocus: false,
    }),
};

