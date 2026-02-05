import React from "react";
import {
  Building2,
  GitBranch,
  CalendarDays,
} from "lucide-react";
import { useSelector } from "react-redux";

function TopBar() {
  const selectedCompanyFromStore = useSelector(
    (state) => state.companyBranch?.selectedCompany
  );
  const selectedBranchFromStore = useSelector(
    (state) => state.companyBranch?.selectedBranch
  );

  // From fySlice: { currentFY, startDate, endDate }
  const fy = useSelector((state) => state.fy);

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

const formatFYEndDate = (dateStr) => {
  if (!dateStr) return "";

  const d = new Date(dateStr);

  // if time is exactly 00:00:00.000 UTC, treat it as start of next day and subtract 1
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    d.setUTCDate(d.getUTCDate() - 1);
  }

  return d.toLocaleDateString("en-IN", {
    timeZone: "UTC",   // ⭐ KEY FIX
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};



  return (
    <div className="bg-emerald-500 text-white px-5 py-2.5 text-xs">
      <div className="mx-auto flex justify-between items-center">
        {/* Left side: company & branch */}
        <div className="flex items-center space-x-4">
          {selectedCompanyFromStore?.companyName && (
            <div className="flex items-center space-x-1">
              <Building2 size={12} />
              <span>{selectedCompanyFromStore.companyName}</span>
            </div>
          )}

          {selectedBranchFromStore?.branchName && (
            <div className="flex items-center space-x-1">
              <GitBranch size={12} />
              <span>{selectedBranchFromStore.branchName}</span>
            </div>
          )}
        </div>

        {/* Right side: Financial year & period */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <CalendarDays size={12} />
            <span className="font-semibold">
              {fy.currentFY || "FY not set"}
            </span>
          </div>

          {fy.startDate && fy.endDate && (
            <span className="text-[11px] text-emerald-100">
              {formatDate(fy.startDate)} – {formatFYEndDate(fy.endDate)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default TopBar;
