// hooks/queries/companySettings.queries.ts
import { queryOptions } from "@tanstack/react-query";
import { companySettingsService } from "@/api/services/companySettings.service";

export const companySettingsQueries = {
  all: () => ["companySettings"],

  detail: (companyId) =>
    queryOptions({
      queryKey: [...companySettingsQueries.all(), "detail", companyId],
      queryFn: () => companySettingsService.get(companyId),
      enabled: !!companyId,
      staleTime: 5 * 60 * 1000,
    }),
};
