import { queryOptions } from "@tanstack/react-query";
import { openingBalanceService } from "@/api/services/openingBalance.service";

/**
 * ============================================
 * OPENING BALANCE QUERIES
 * ============================================
 * 
 * Purpose: React Query configurations for opening balance operations
 * 
 * ============================================
 */
export const openingBalanceQueries = {
  all: () => ["openingBalance"],

  /**
   * Get year-wise opening balances list
   */
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

  // NOTE: recalculationImpact query removed
  // Impact analysis is now handled directly in the mutation
  // using openingBalanceService.analyzeImpact()
};
