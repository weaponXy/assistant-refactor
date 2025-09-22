export const getDailyTotal = (expenses, date = new Date()) => {
  const selectedDateStr = date.toLocaleDateString("en-CA");
  return expenses
    .filter(e => (e.expensedate ?? e.expense_date ?? e.expenseDate ?? e.date ?? e.created_at)?.startsWith(selectedDateStr))
    .reduce((acc, curr) => acc + Number(curr.amount), 0);
};

export const getMonthlyTotal = (expenses, month = new Date().getMonth()) => {
  return expenses
    .filter(e => new Date(e.expensedate ?? e.expense_date ?? e.expenseDate ?? e.date ?? e.created_at).getMonth() === month)
    .reduce((sum, e) => sum + Number(e.amount), 0);
};

export const getMonthlyChartData = (expenses) => {
  return Array.from({ length: 12 }, (_, month) => {
    const monthName = new Date(0, month).toLocaleString("default", { month: "short" });
    const total = getMonthlyTotal(expenses, month);
    return { month: monthName, total };
  });
};

export const getWeeklyBarData = (expenses) => {
  const current = new Date();
  const monday = new Date(current.setDate(current.getDate() - current.getDay() + 1));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dayLabel = date.toLocaleDateString("default", { weekday: "short" });
    const total = expenses
      .filter(e => {
        const d = new Date(e.expensedate ?? e.expense_date ?? e.expenseDate ?? e.date ?? e.created_at);
        return d.toDateString() === date.toDateString();
      })
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return { day: dayLabel, total };
  });
};
