// src/services/budgetService.js
import { supabase } from '../supabase';
import { listExpensesByMonth } from '../api/expenses'; // reuse the working monthly loader

/** Budgets list */
export async function listBudgets() {
  const { data, error } = await supabase
    .from('budget')
    .select('id, month_year, monthly_budget_amount')
    .order('month_year', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Use the shared monthly expenses API to avoid schema drift */
export async function getExpensesForBudgetMonth(monthYearDateLike) {
  try {
    const d = new Date(monthYearDateLike);
    if (Number.isNaN(+d)) throw new Error('Invalid month_year date');

    const yyyy = d.getUTCFullYear();
    const mm = d.getUTCMonth() + 1; // listExpensesByMonth expects 1-based month

    const rows = await listExpensesByMonth(yyyy, mm);
    // Normalize to just what BudgetHistory renders
    return rows.map(r => ({
      id: r.id,
      occurred_on: r.occurred_on,
      amount: r.amount,
      notes: r.notes ?? '',
      category_path: r.category_path ?? null,
    }));
  } catch (e) {
    console.error('getExpensesForBudgetMonth failed:', e);
    throw e;
  }
}

/** Budget change log */
export async function getBudgetHistory(budgetId) {
  if (!budgetId) return [];
  const { data, error } = await supabase
    .from('budgethistory')
    .select('id, old_amount, new_amount, created_at')
    .eq('budget_id', budgetId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
