// utils/financialYear.js
const FY_FORMAT_MAP = {
  "april-march": { startMonth: 4, endMonth: 3 },
  "january-december": { startMonth: 1, endMonth: 12 },
  "february-january": { startMonth: 2, endMonth: 1 },
  "march-february": { startMonth: 3, endMonth: 2 },
  "may-april": { startMonth: 5, endMonth: 4 },
  "june-may": { startMonth: 6, endMonth: 5 },
  "july-june": { startMonth: 7, endMonth: 6 },
  "august-july": { startMonth: 8, endMonth: 7 },
  "september-august": { startMonth: 9, endMonth: 8 },
};

export const computeFYDates = (currentFY, fyFormat) => {
  const cfg = FY_FORMAT_MAP[fyFormat || "april-march"];
  if (!cfg) throw new Error(`Unsupported FY format: ${fyFormat}`);

  // currentFY can be "2026-27" or "2026-2027"
  const [startYearStr, rawEnd] = currentFY.split("-");
  const startYear = parseInt(startYearStr, 10);

  let endYear;
  if (rawEnd.length === 2) {
    const short = parseInt(rawEnd, 10);
    const century = Math.floor(startYear / 100) * 100;
    endYear = century + short; // 26-27 => 2026, 2027
  } else {
    endYear = parseInt(rawEnd, 10); // "2027"
  }

  // ✅ Start date: first day of startMonth
  const startDate = new Date(
    Date.UTC(startYear, cfg.startMonth - 1, 1, 0, 0, 0, 0)
  );

  // ✅ End date: last day of endMonth
  const lastDay = new Date(Date.UTC(endYear, cfg.endMonth, 0)).getUTCDate();
  const endDate = new Date(
    Date.UTC(endYear, cfg.endMonth - 1, lastDay, 23, 59, 59, 999)
  );

  return { startDate, endDate };
};
