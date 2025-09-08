// src/services/budgetService.js
import { supabase } from "../supabase";

/** Get all budgets (most recent first) */
export async function listBudgets() {
  const { data, error } = await supabase
    .from("budget")
    .select("id, month_year, monthly_budget_amount, created_at")
    .order("month_year", { ascending: false });

  if (error) throw error;
  return data || [];
}

/** Get all expenses that occurred within the given month (by budget.month_year) */
export async function getExpensesForBudgetMonth(monthYearDate /* string or Date */) {
  const monthStart = new Date(monthYearDate);
  const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));

  // Build ISO strings in UTC (avoid TZ off-by-one)
  const gteISO = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const ltISO = nextMonthStart.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("expenses")
    .select("expenseid, expensedate, amount, description, category, createdbyuserid, createdat")
    .gte("expensedate", gteISO)
    .lt("expensedate", ltISO)
    .order("expensedate", { ascending: true });

  if (error) throw error;
  return data || [];
}

/** Get change log for a given budget id from budgethistory */
export async function getBudgetHistory(budgetId) {
  const { data, error } = await supabase
    .from("budgethistory")
    .select("id, old_amount, new_amount, created_at")
    .eq("budget_id", budgetId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}
