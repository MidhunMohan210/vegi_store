export const  getFinancialYearForDate=(date, startMonth) =>{
  const m = date.getMonth() + 1; // 1–12
  const y = date.getFullYear();
  // If month >= FY start, FY = same calendar year, else previous
  return m >= startMonth ? y : y - 1;
}