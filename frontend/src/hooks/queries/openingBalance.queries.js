// hooks/queries/openingBalance.queries.ts
import { queryOptions } from "@tanstack/react-query";
import { openingBalanceService } from "@/api/services/openingBalance.service";

export const openingBalanceQueries = {
  all: () => ["openingBalance"],

  // Get list of year-wise balances for an entity
  list: (entityType, entityId, companyId, branchId) =>
    queryOptions({
      queryKey: [...openingBalanceQueries.all(), "list", entityType, entityId, companyId, branchId],
      queryFn: () => openingBalanceService.getYearWiseBalances(entityType, entityId, companyId, branchId),
      enabled: !!entityId && !!companyId && !!branchId,
      staleTime: 1000 * 60 * 5, // 5 minutes cache
    }),
};
