import moment from 'moment';
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
  const format = fyFormat || "april-march";
  const cfg = FY_FORMAT_MAP[format];
  if (!cfg) throw new Error(`Unsupported FY format: ${format}`);

  const [startYearStr, rawEnd] = currentFY.split("-");
  const startYear = parseInt(startYearStr, 10);

  let endYear;
  if (format === "january-december") {
    // 🔹 Special rule: Jan–Dec FY is within the SAME start year
    endYear = startYear;
  } else {
    // Normal cross-year logic: 2025-26 or 2025-2026 => 2025, 2026
    if (rawEnd.length === 2) {
      const short = parseInt(rawEnd, 10);
      const century = Math.floor(startYear / 100) * 100;
      endYear = century + short;
    } else {
      endYear = parseInt(rawEnd, 10);
    }
  }

  // Start date: first day of start month
  const startDate = new Date(
    Date.UTC(startYear, cfg.startMonth - 1, 1, 0, 0, 0, 0)
  );

  // End date: last day of end month
  const lastDay = new Date(Date.UTC(endYear, cfg.endMonth, 0)).getUTCDate();
  const endDate = new Date(
    Date.UTC(endYear, cfg.endMonth - 1, lastDay, 23, 59, 59, 999)
  );

  return { startDate, endDate };
};




/**
 * ============================================
 * FINANCIAL YEAR UTILITY FUNCTIONS
 * ============================================
 * 
 * Purpose: Handle all FY-related calculations
 * - Calculate which FY a date falls into
 * - Generate list of FYs between two years
 * - Get date ranges for a specific FY
 * 
 * Dependencies: Company FY configuration
 * ============================================
 */


/**
 * Calculate which Financial Year a given date falls into
 * 
 * @param {Date} date - The date to check
 * @param {Object} fyConfig - Company FY configuration
 * @param {String} fyConfig.format - "april-march", "january-december", etc.
 * @param {Number} fyConfig.startMonth - Start month (1-12)
 * @param {Number} fyConfig.startingYear - First FY year of company
 * 
 * @returns {String} - FY string like "2024-2025"
 * 
 * @example
 * calculateFinancialYear(new Date('2024-05-15'), { format: 'april-march', startMonth: 4 })
 * // Returns: "2024-2025"
 */
export const calculateFinancialYear = (date, fyConfig) => {
  console.log(`[FY Utils] Calculating FY for date: ${date}`);
  
  const momentDate = moment(date);
  const month = momentDate.month() + 1; // moment months are 0-indexed
  const year = momentDate.year();
  
  const { startMonth } = fyConfig;
  
  // If date month >= FY start month, FY starts this year
  // Otherwise, FY started last year
  let fyStartYear;
  
  if (month >= startMonth) {
    fyStartYear = year;
  } else {
    fyStartYear = year - 1;
  }
  
  const fyEndYear = fyStartYear + 1;
  const fyString = `${fyStartYear}-${fyEndYear}`;
  
  console.log(`[FY Utils] Date ${date} falls in FY: ${fyString}`);
  
  return fyString;
};


/**
 * Generate list of Financial Years between start and end
 * 
 * @param {String} startFY - Starting FY string (e.g., "2024-2025")
 * @param {String} endFY - Ending FY string (e.g., "2026-2027")
 * @param {Object} fyConfig - Company FY configuration (not used, kept for consistency)
 * 
 * @returns {Array<String>} - Array of FY strings ["2024-2025", "2025-2026", "2026-2027"]
 */
export const generateFYList = (startFY, endFY, fyConfig) => {
  console.log("startFY", startFY);
  console.log("endFY", endFY);
  
  console.log(`[FY Utils] Generating FY list from ${startFY} to ${endFY}`);
  
  const fyList = [];
  
  // Extract start and end years from FY strings
  const startYear = parseInt(startFY.split('-')[0]);
  const endYear = parseInt(endFY.split('-')[0]);
  
  console.log(`[FY Utils] Start year: ${startYear}, End year: ${endYear}`);
  
  // Generate FY strings from startYear to endYear
  for (let year = startYear; year <= endYear; year++) {
    const fyString = `${year}-${year + 1}`;
    fyList.push(fyString);
  }
  
  console.log(`[FY Utils] Generated FY list:`, fyList);
  
  return fyList;
};



/**
 * Get start and end date for a specific Financial Year
 * 
 * @param {String} fyString - FY string like "2024-2025"
 * @param {Object} fyConfig - Company FY configuration
 * @param {Number} fyConfig.startMonth - Start month (1-12)
 * @param {Number} fyConfig.endMonth - End month (1-12)
 * 
 * @returns {Object} - { start: Date, end: Date }
 * 
 * @example
 * getFYDateRange("2024-2025", { startMonth: 4, endMonth: 3 })
 * // Returns: { start: 2024-04-01, end: 2025-03-31 }
 */
export const getFYDateRange = (fyString, fyConfig) => {
  console.log(`[FY Utils] Getting date range for FY: ${fyString}`);
  
  // Extract start and end year from "2024-2025"
  const [startYearStr, endYearStr] = fyString.split('-');
  const startYear = parseInt(startYearStr);
  const endYear = parseInt(endYearStr);
  
  const { startMonth, endMonth } = fyConfig;
  
  // FY start date: startYear-startMonth-01 00:00:00
  const start = moment()
    .year(startYear)
    .month(startMonth - 1) // moment months are 0-indexed
    .date(1)
    .startOf('day')
    .toDate();
  
  // FY end date: endYear-endMonth-lastDay 23:59:59
  const end = moment()
    .year(endYear)
    .month(endMonth - 1)
    .endOf('month')
    .endOf('day')
    .toDate();
  
  console.log(`[FY Utils] FY ${fyString} range:`, { start, end });
  
  return { start, end };
};


/**
 * Get list of months in a Financial Year
 * 
 * @param {String} fyString - FY string like "2024-2025"
 * @param {Object} fyConfig - Company FY configuration
 * @param {Number} fyConfig.startMonth - Start month (1-12)
 * 
 * @returns {Array<Object>} - Array of month objects with year and month
 * 
 * @example
 * getMonthsInFY("2024-2025", { startMonth: 4 })
 * // Returns: [
 * //   { year: 2024, month: 4, label: "Apr-2024" },
 * //   { year: 2024, month: 5, label: "May-2024" },
 * //   ...
 * //   { year: 2025, month: 3, label: "Mar-2025" }
 * // ]
 */
export const getMonthsInFY = (fyString, fyConfig) => {
  console.log(`[FY Utils] Getting months for FY: ${fyString}`);
  
  const [startYearStr] = fyString.split('-');
  const startYear = parseInt(startYearStr);
  
  const { startMonth } = fyConfig;
  
  const months = [];
  
  // Generate 12 months starting from startMonth
  for (let i = 0; i < 12; i++) {
    const monthNumber = ((startMonth - 1 + i) % 12) + 1; // Wrap around after 12
    const year = startMonth + i > 12 ? startYear + 1 : startYear;
    
    const monthLabel = moment()
      .year(year)
      .month(monthNumber - 1)
      .format('MMM-YYYY');
    
    months.push({
      year,
      month: monthNumber,
      label: monthLabel
    });
  }
  
  console.log(`[FY Utils] Generated ${months.length} months for FY ${fyString}`);
  
  return months;
};


/**
 * Get start and end date for a specific month
 * 
 * @param {Number} year - Year (e.g., 2024)
 * @param {Number} month - Month (1-12)
 * 
 * @returns {Object} - { start: Date, end: Date }
 * 
 * @example
 * getMonthDateRange(2024, 5)
 * // Returns: { start: 2024-05-01 00:00:00, end: 2024-05-31 23:59:59 }
 */
export const getMonthDateRange = (year, month) => {
  const start = moment()
    .year(year)
    .month(month - 1)
    .date(1)
    .startOf('day')
    .toDate();
  
  const end = moment()
    .year(year)
    .month(month - 1)
    .endOf('month')
    .endOf('day')
    .toDate();
  
  return { start, end };
};

