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
};

