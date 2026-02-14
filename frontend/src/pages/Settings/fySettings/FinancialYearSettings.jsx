// pages/Settings/FinancialYearSettings.jsx
import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Loader2 } from "lucide-react";

import { companySettingsQueries } from "@/hooks/queries/companySettings.queries";
import { useUpdateFinancialYear } from "@/hooks/mutations/companySettings.mutation";
import { toast } from "sonner";

const FinancialYearSettings = () => {
  const navigate = useNavigate();
  const selectedCompany = useSelector(
    (state) => state.companyBranch?.selectedCompany,
  );
  const companyId = selectedCompany?._id;

  const { data, isLoading } = useQuery(
    companySettingsQueries.detail(companyId),
  );

  // console.log(data);
  

  const updateFYMutation = useUpdateFinancialYear(companyId);

 

  const yearOptions = useMemo(() => {
    const options = [];
    for (let start = 2020; start <= 2040; start++) {
      const end = start + 1;
      options.push({
        value: `${start}-${end}`,
        label: `${start}-${end}`,
      });
    }
    return options;
  }, []);

  const currentFY = data?.data?.financialYear?.currentFY;

  const handleChange = (e) => {
    const newFY = e.target.value;
    if (!newFY || newFY === currentFY) return;
    updateFYMutation.mutate(newFY);
  };

  if (!companyId) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-4 text-sm text-red-500">
        No company selected. Please select a company first.
      </div>
    );
  }

  if (updateFYMutation.isError) {
  toast.error("Failed to update financial year. Please try again.");
  }

  return (
    <div className="h-[calc(100vh-110px)] bg-slate-50">
      {/* Header */}
      <div className="px-6 pt-4 pb-3 border-b border-slate-200 bg-slate-50/80 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1 rounded-full hover:bg-slate-200"
        >
          <ArrowLeft className="w-4 h-4 text-slate-700" />
        </button>
        <div>
          <div className="text-[11px] text-slate-500 uppercase font-semibold">
            Settings
          </div>
          <h1 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            Financial Year Adjustment
          </h1>
          {selectedCompany && (
            <p className="text-[11px] text-slate-500 mt-0.5">
              Company:{" "}
              <span className="font-medium text-slate-700">
                {selectedCompany.companyName}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6 flex justify-center overflow-y-auto">
        <div className="w-full max-w-3xl">
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <div className="mb-4">
              <div className="text-xs font-semibold text-slate-700">
                Select Financial Year
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                This controls the current financial year used for reporting for
                this company.
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading financial year...
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <select
                  className="border border-slate-300 rounded-md text-xs px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                  value={currentFY || ""}
                  onChange={handleChange}
                  disabled={updateFYMutation.isPending}
                >
                  <option value="">Select financial year</option>
                  {yearOptions.map((y) => (
                    <option key={y.value} value={y.value}>
                      {y.label}
                    </option>
                  ))}
                </select>

                {updateFYMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
                )}
              </div>
            )}

            {currentFY && (
              <p className="text-[11px] text-slate-500 mt-3">
                Current financial year:{" "}
                <span className="font-semibold text-slate-700">
                  {currentFY}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialYearSettings;
