// hooks/queries/accountMasterQueries.js
import { queryOptions } from '@tanstack/react-query';
import { accountMasterService } from '../../api/services/accountMaster.service';

export const accountMasterQueries = {
  all: () => ['accountMaster'],
  
list: (searchTerm = "", companyId, branchId = null, accountType = null, limit = 30) => queryOptions({
  queryKey: [...accountMasterQueries.all(), 'list', companyId, searchTerm],
  queryFn: ({ pageParam = 0 }) => accountMasterService.list(searchTerm, companyId, null, null, limit, {}, pageParam),
  enabled: !!companyId,
  staleTime: 5 * 60 * 1000,
  initialPageParam: 0, // Add this for v5
}),

  search: (searchTerm, companyId,branchId,accountType,limit=25,filters={}, options = {},) => queryOptions({
    queryKey: [...accountMasterQueries.all(), 'search', searchTerm, companyId,branchId,accountType, limit,filters],
    queryFn: () => accountMasterService.search(searchTerm, companyId,branchId,accountType, limit,filters  ),
    staleTime: 10 * 1000,
    ...options
  }),

  detail: (id) => queryOptions({
    queryKey: [...accountMasterQueries.all(), 'detail', id],
    queryFn: () => accountMasterService.getById(id),
    enabled: !!id,
  }),


};
