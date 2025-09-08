import React, { useState } from "react";
import { supabase } from "../supabase";
import { useExpenses } from "../hooks/useExpense";
import { useBudget } from "../hooks/useBudget";
import { getDailyTotal, getMonthlyTotal, getMonthlyChartData, getWeeklyBarData } from "../utils/expenseUtils";
import SummaryCards from "../components/SummaryCards";
import ExpenseTable from "../components/ExpenseTable";
import ExpenseFormModal from "../components/ExpenseFormModal";
import BudgetFormModal from "../components/BudgetFormModal";
import MonthlyLineChart from "../components/MonthlyLineChart";
import WeeklyBarChart from "../components/WeeklyBarChart";
import CalendarPanel from "../components/CalendarPanel";

export default function ExpenseDashboard() {
  const { expenses, addExpense, updateExpense, deleteExpense } = useExpenses();
  const { budget, saveBudget } = useBudget();

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [newExpense, setNewExpense] = useState({ description: "", category: "", amount: "", expensedate: new Date().toISOString().split("T")[0] });
  const [newBudgetAmount, setNewBudgetAmount] = useState("");
  const [calendarDate, setCalendarDate] = useState(new Date());

  const handleSaveExpense = async () => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return alert("User not logged in");

    if (editingExpense) {
      await updateExpense(editingExpense.expenseid, newExpense);
    } else {
      await addExpense(newExpense, user.id);
    }
    setShowExpenseModal(false);
    setEditingExpense(null);
    setNewExpense({ description: "", category: "", amount: "", expensedate: new Date().toISOString().split("T")[0] });
  };

  const handleSaveBudget = async () => {
    await saveBudget(newBudgetAmount);
    setShowBudgetModal(false);
    setNewBudgetAmount("");
  };

  return (
    <div className="dashboard-container">
      <SummaryCards
        daily={getDailyTotal(expenses, calendarDate)}
        monthly={getMonthlyTotal(expenses)}
        budget={budget}
        onEditBudget={() => setShowBudgetModal(true)}
      />

      {getMonthlyTotal(expenses) > budget && (
        <div className="warning-banner">
          ⚠️ You're over your monthly budget by ₱{(getMonthlyTotal(expenses) - budget).toFixed(2)}!
        </div>
      )}

      <section className="actions">
        <button onClick={() => {
          setNewExpense({ description: "", category: "", amount: "", expensedate: new Date().toISOString().split("T")[0] });
          setEditingExpense(null);
          setShowExpenseModal(true);
        }}>
          Add Expense
        </button>
      </section>

      <ExpenseTable
        expenses={expenses}
        onEdit={(expense) => {
          setEditingExpense(expense);
          setNewExpense(expense);
          setShowExpenseModal(true);
        }}
        onDelete={deleteExpense}
      />

      {/* Charts & Calendar */}
      <div className="chart-and-calendar">
        <div className="chart-container">
          <h3>Monthly Expenses Trend</h3>
          <MonthlyLineChart data={getMonthlyChartData(expenses)} />
        </div>
        <div className="chart-container">
          <h3>Weekly Expenses</h3>
          <WeeklyBarChart data={getWeeklyBarData(expenses)} />
        </div>
        <CalendarPanel date={calendarDate} onChange={setCalendarDate} />
      </div>

      {/* Modals */}
      <ExpenseFormModal
        show={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        onSave={handleSaveExpense}
        expenseData={newExpense}
        setExpenseData={setNewExpense}
        isEdit={!!editingExpense}
      />

      <BudgetFormModal
        show={showBudgetModal}
        onClose={() => setShowBudgetModal(false)}
        onSave={handleSaveBudget}
        value={newBudgetAmount}
        setValue={setNewBudgetAmount}
      />
    </div>
  );
}
