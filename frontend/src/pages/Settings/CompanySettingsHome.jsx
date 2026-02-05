// pages/Settings/CompanySettingsHome.jsx
import React from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Calendar } from "lucide-react";

const CompanySettingsHome = () => {
  const navigate = useNavigate();

  const selectedCompany = useSelector(
    (state) => state.companyBranch?.selectedCompany
  );

  const handleOpenFY = () => {
    navigate("/settings/financial-year");
  };

  const cardClass =
    "w-full bg-white border border-slate-200 rounded-lg px-5 py-4 " +
    "flex items-center justify-between hover:bg-slate-50 cursor-pointer " +
    "transition shadow-sm";

  return (
    <div className="h-[calc(100vh-110px)] bg-slate-50">
      {/* Top bar area */}
      <div className="px-6 pt-4 pb-2 border-b border-slate-200 bg-slate-50/80">
        <h1 className="text-base font-semibold text-slate-900">Settings</h1>
        {selectedCompany && (
          <p className="text-[11px] text-slate-500 mt-0.5">
            Company:{" "}
            <span className="font-medium text-slate-700">
              {selectedCompany.companyName}
            </span>
          </p>
        )}
      </div>

      {/* Centered content */}
      <div className="px-6 py-6 flex justify-center overflow-y-auto">
        <div className="w-full max-w-5xl">
          {/* Section label */}
          <div className="text-[11px] font-semibold text-slate-500 uppercase mb-3">
            Company Essentials
          </div>

          {/* Financial Year tile */}
          <div onClick={handleOpenFY} className={cardClass}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                    Financial Year &amp; Period
                  </div>
                  <span className="inline-flex items-center px-2 py-[2px] rounded-full bg-emerald-50 text-[10px] font-medium text-emerald-700">
                    Recommended
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Configure current financial year used for reports and entries
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-medium text-indigo-600">
              <span>Manage</span>
              <span className="text-slate-400">&gt;</span>
            </div>
          </div>

          {/* Placeholder description when only one tile exists */}
          <p className="text-[11px] text-slate-400 mt-3">
            More configuration options will appear here as new settings are
            added for this company.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CompanySettingsHome;
