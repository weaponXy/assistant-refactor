import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { supabase } from '../supabase';
import "../expenses/ExpenseDashboard.css";
import BudgetHistory from '../budget/BudgetHistory';

function formatYYYYMM(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
function extractYYYYMM(dateLike) {
  const s = String(dateLike || '');
  if (s.length >= 7 && /^\d{4}-\d{2}/.test(s)) return s.slice(0, 7); // "YYYY-MM"
  const d = new Date(dateLike);
  if (isNaN(d)) return '';
  return formatYYYYMM(d);
}

function monthBounds(yyyyMM) {
  const [y, m] = yyyyMM.split('-').map(Number);
  const start = new Date(y, m - 1, 1);        // first day of month
  const end = new Date(y, m, 0);              // last day of month
  return { start, end };
}


const ExpenseDashboard = () => {
  const [expenses, setExpenses] = useState([]);
  const navigate = useNavigate();
  const [budget, setBudget] = useState(0);
  const [initialBudget, setInitialBudget] = useState(0);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddBudgetModal, setShowAddBudgetModal] = useState(false);
  const [showBudgetHistory, setShowBudgetHistory] = useState(false);

  const [editExpenseId, setEditExpenseId] = useState(null);
  const [newExpense, setNewExpense] = useState({
    description: '', category: '', amount: '', date: '',
  });
  const [newBudgetAmount, setNewBudgetAmount] = useState('');
  const [calendarDate, setCalendarDate] = useState(new Date());

  const [selectedMonth, setSelectedMonth] = useState(formatYYYYMM(new Date())); // default to current month
  const { start: monthStart, end: monthEnd } = useMemo(
    () => monthBounds(selectedMonth),
    [selectedMonth]
  );

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortMode, setSortMode] = useState('date_desc'); // date_desc | date_asc | amount_desc | amount_asc

  useEffect(() => {
    fetchExpenses();
  }, []);

  
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (error || !user) {
        // Redirect to login if no session
        window.location.href = '/login';
      }
    })();
    return () => { isMounted = false; };
  }, []);


  useEffect(() => {
  // Jump calendar to the start of the newly selected month
  setCalendarDate(new Date(`${selectedMonth}-01`));
  }, [selectedMonth]);

  useEffect(() => {
    setBudget(0);
    setInitialBudget(0);
    fetchBudget(selectedMonth);
  }, [selectedMonth]);



  const fetchExpenses = async () => {
    const { data, error } = await supabase.from('expenses').select('*');
    if (error) console.error('Error fetching expenses:', error);
    else setExpenses(data || []);
  };

  const fetchBudget = async (yyyyMM) => {
  const monthYear = `${yyyyMM}-01`;

  const { data, error } = await supabase
      .from('budget')
      .select('id, monthly_budget_amount')
      .eq('month_year', monthYear)
      .maybeSingle();

    if (error) {
      console.error("❌ Failed to fetch budget:", error);
      return;
    }

    if (data) {
      const amt = Number(data.monthly_budget_amount) || 0;
      setBudget(amt);
      setInitialBudget(amt);
    } else {
      setBudget(0);
      setInitialBudget(0);
    }
  };


  const handleSaveBudget = async () => {
    const monthYear = `${selectedMonth}-01`;
    const newAmt = Number(newBudgetAmount);

    // 1) Read current budget row (if any) for this month
    const { data: existing, error: readErr } = await supabase
      .from('budget')
      .select('id, monthly_budget_amount')
      .eq('month_year', monthYear)
      .maybeSingle();

    if (readErr && readErr.code !== 'PGRST116') {
      console.error('Failed to read existing budget:', readErr);
      alert('⚠️ Failed saving budget. Try again.');
      return;
    }

    // 2) Upsert the budget row
    const { data: upserted, error: upsertErr } = await supabase
      .from('budget')
      .upsert({ month_year: monthYear, monthly_budget_amount: newAmt }, { onConflict: ['month_year'] })
      .select('id, monthly_budget_amount')
      .single();

    if (upsertErr) {
      console.error('Failed to add budget:', upsertErr);
      alert('⚠️ Failed saving budget. Try again.');
      return;
    }

    // 3) If amount changed, write a history row
    const prevAmt = existing ? Number(existing.monthly_budget_amount) : null;
    const changed = prevAmt === null ? true : prevAmt !== newAmt;

    if (changed && upserted?.id) {
      const { error: histErr } = await supabase
        .from('budgethistory')
        .insert({
          budget_id: upserted.id,
          old_amount: prevAmt,
          new_amount: newAmt,
        });

      if (histErr) {
        console.error('Failed to insert budget history:', histErr);
        // Do not block UX; continue
      }
    }

    alert('✅ Budget saved!');
    setShowAddBudgetModal(false);
    setNewBudgetAmount('');
    fetchBudget(selectedMonth);
  };


  const handleSaveExpense = async () => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("User fetch failed or not logged in:", userError);
      alert("🚫 Unable to add/update expense: user not logged in.");
      return;
    }

    if (!newExpense.description || !newExpense.amount || !newExpense.date) {
      alert("⚠️ Please fill in all required fields (description, amount, and date).");
      return;
    }

    if (editExpenseId) {
      const { error } = await supabase
        .from('expenses')
        .update({
          description: newExpense.description,
          category: newExpense.category,
          amount: parseFloat(newExpense.amount),
          expensedate: newExpense.date,
        })
        .eq('expenseid', editExpenseId);

      if (error) {
        console.error("Update error:", error);
        alert("❌ Failed to update expense: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('expenses').insert([{
        description: newExpense.description,
        category: newExpense.category,
        amount: parseFloat(newExpense.amount),
        expensedate: newExpense.date, // "YYYY-MM-DD" from input
        createdbyuserid: user.id,
      }]);

      if (error) {
        console.error("Insert error:", error);
        alert("❌ Failed to add expense: " + error.message);
        return;
      }
    }

    await fetchExpenses();
    setShowAddModal(false);
    setEditExpenseId(null);
    setNewExpense({ description: '', category: '', amount: '', date: '' });
  };

  const handleDelete = async (expenseid) => {
    const { error } = await supabase.from('expenses').delete().eq('expenseid', expenseid);
    if (!error) await fetchExpenses();
  };

  // === Derived data for current table view ===
  const categories = Array.from(
    new Set(expenses.map(e => (e.category || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const filteredByMonth = expenses.filter(e => extractYYYYMM(e.expensedate) === selectedMonth);
  const filteredByCategory = selectedCategory === 'all'
    ? filteredByMonth
    : filteredByMonth.filter(e => (e.category || '') === selectedCategory);

  const visibleExpenses = [...filteredByCategory].sort((a, b) => {
    if (sortMode === 'date_desc') {
      return new Date(b.expensedate) - new Date(a.expensedate);
    } else if (sortMode === 'date_asc') {
      return new Date(a.expensedate) - new Date(b.expensedate);
    } else if (sortMode === 'amount_desc') {
      return Number(b.amount) - Number(a.amount);
    } else if (sortMode === 'amount_asc') {
      return Number(a.amount) - Number(b.amount);
    }
    return 0;
  });

  // Cards
  const selectedDateStr = calendarDate.toLocaleDateString('en-CA');
  const dailyTotal = filteredByMonth
    .filter(e => String(e.expensedate || '').startsWith(selectedDateStr))
    .reduce((acc, curr) => acc + Number(curr.amount), 0);

  const monthlyTotal = filteredByMonth
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const chartData = Array.from({ length: 12 }, (_, month) => {
    const monthName = new Date(0, month).toLocaleString('default', { month: 'short' });
    const total = expenses
      .filter((e) => new Date(e.expensedate).getMonth() === month)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return { month: monthName, total };
  });

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="nav-section">
          <p className="nav-header">GENERAL</p>
          <ul>
            <li onClick={() => navigate("/Dashboard")}>Dashboard</li>
            <li onClick={() => navigate("/inventory")}>Inventory</li>
            <li onClick={() => navigate("/supplier")}>Supplier</li>
            <li onClick={() => navigate("/TablePage")}>Sales</li>
            <li className="active">Expenses</li>
            <li>AI Assistant</li>
          </ul>
          <p className="nav-header">SUPPORT</p>
          <ul>
            <li>Help</li>
            <li>Settings</li>
          </ul>
        </div>
      </aside>

      <main className="main">
        <div className="top-summary">
          <div className="summary-card">
            <h3>Daily Expenses</h3>
            <p>₱{dailyTotal.toFixed(2)}</p>
          </div>
          <div className="summary-card">
            <h3>Monthly Expenses</h3>
            <p>₱{monthlyTotal.toFixed(2)}</p>
          </div>
          <div className="summary-card">
            <h3>Remaining Budget</h3>
            <p style={{ color: monthlyTotal > budget ? 'red' : 'green' }}>
              {monthlyTotal > budget
                ? `Over by ₱${(monthlyTotal - budget).toFixed(2)}`
                : `₱${(budget - monthlyTotal).toFixed(2)} left`}
            </p>
          </div>
          <div className="summary-card">
            <h3>Monthly Budget</h3>
            <p>₱{budget.toFixed(2)}</p>
          </div>
        </div>

        {monthlyTotal > budget && (
          <div className="warning-banner">
            ⚠️ You're over your monthly budget by ₱{(monthlyTotal - budget).toFixed(2)}!
          </div>
        )}

        <section className="toolbar">
          <div className="toolbar-left">
            <button
              className="btn primary"
              onClick={() => {
                setNewExpense({ description: '', category: '', amount: '', date: '' });
                setEditExpenseId(null);
                setShowAddModal(true);
              }}
            >
              + Add Expense
            </button>
          </div>

          <div className="toolbar-right">
            <div className="button-group">
              <button
                className="btn ghost"
                onClick={() => {
                  setNewBudgetAmount(
                    Number.isFinite(budget) ? String(budget) : ''
                  );
                  setShowAddBudgetModal(true);
                }}
              >
                Edit Budget
              </button>

              <button className="btn ghost" onClick={() => setShowBudgetHistory(true)}>
                Budget History
              </button>
            </div>
          </div>
        </section>

        {/* NEW: Table controls (month / category / sort) */}
        <section className="table-controls">
          <div className="control">
            <label>Month</label>
            <input
              type="month"
              className="control-input"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>

          <div className="control">
            <label>Category</label>
            <select
              className="control-input"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="control">
            <label>Sort</label>
            <select
              className="control-input"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
            >
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
              <option value="amount_desc">Amount: High → Low</option>
              <option value="amount_asc">Amount: Low → High</option>
            </select>
          </div>
        </section>

        <section className="expense-table">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleExpenses.map((expense) => (
                <tr key={expense.expenseid}>
                  <td>{expense.description}</td>
                  <td>{expense.category}</td>
                  <td>₱{Number(expense.amount).toFixed(2)}</td>
                  <td>{expense.expensedate}</td>
                  <td className="col-actions">
                    <div className="table-actions">
                      <button
                        className="btn xs outline"
                        onClick={() => {
                          setNewExpense({
                            description: expense.description,
                            category: expense.category,
                            amount: expense.amount,
                            date: expense.expensedate,
                          });
                          setEditExpenseId(expense.expenseid);
                          setShowAddModal(true);
                        }}
                      >
                        Edit
                      </button>

                      <button
                        className="btn xs danger"
                        onClick={() => handleDelete(expense.expenseid)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleExpenses.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '20px', color: '#64748b' }}>
                    No expenses for {selectedMonth}
                    {selectedCategory !== 'all' ? ` in “${selectedCategory}”` : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="chart-and-calendar">
          <div className="chart-container">
            <h3>Monthly Expenses Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <CartesianGrid stroke="#eee" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="calendar-container">
            <h3>Calendar</h3>
            <Calendar
              value={calendarDate}
              onChange={setCalendarDate}
              /* keep the view locked to days */
              minDetail="month"
              maxDetail="month"
              /* open on the selected month */
              activeStartDate={monthStart}
              onActiveStartDateChange={({ activeStartDate, view }) => {
                if (view === 'month') {
                  // keep input[type="month"] in sync when user clicks ←/→ in the calendar
                  setSelectedMonth(formatYYYYMM(activeStartDate));
                }
              }}
              /* prevent selecting days outside the selected month */
              minDate={monthStart}
              maxDate={monthEnd}
              tileDisabled={({ date, view }) =>
                view === 'month' &&
                (date.getMonth() !== monthStart.getMonth() ||
                  date.getFullYear() !== monthStart.getFullYear())
              }
            />
          </div>
        </div>
      </main>

    
      {showAddModal && (
        <div
          className="modal-overlay fancy"
          role="dialog"
          aria-modal="true"
          aria-label={editExpenseId ? 'Edit Expense' : 'Add Expense'}
          tabIndex={-1}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddModal(false);
              setEditExpenseId(null);
              setNewExpense({ description: '', category: '', amount: '', date: '' });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setShowAddModal(false);
              setEditExpenseId(null);
              setNewExpense({ description: '', category: '', amount: '', date: '' });
            }
          }}
        >
          <form
            className="modal sheet animate-in"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveExpense();
            }}
          >
            <div className="modal-header">
              <h2 className="modal-title">{editExpenseId ? 'Edit Expense' : 'Add Expense'}</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => {
                  setShowAddModal(false);
                  setEditExpenseId(null);
                  setNewExpense({ description: '', category: '', amount: '', date: '' });
                }}
              >✕</button>
            </div>

            <div className="modal-body">
              <div className="fields-grid">
                <div className="field">
                  <label>Description</label>
                  <input
                    placeholder="e.g. Office supplies"
                    value={newExpense.description}
                    onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label>Category</label>
                  <input
                    placeholder="e.g. Utilities"
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                  />
                </div>
              </div>
              <div className="fields-grid">
                <div className="field">
                  <label>Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                    required
                  />
                  <p className="hint">Enter the total in PHP.</p>
                </div>
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={newExpense.date}
                    onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setShowAddModal(false);
                  setEditExpenseId(null);
                  setNewExpense({ description: '', category: '', amount: '', date: '' });
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn primary">
                {editExpenseId ? 'Update Expense' : 'Add Expense'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---- Fancy Edit Budget Modal ---- */}
      {showAddBudgetModal && (
        <div
          className="modal-overlay fancy"
          role="dialog"
          aria-modal="true"
          aria-label="Add Monthly Budget"
          tabIndex={-1}
          onMouseDown={(e) => e.target === e.currentTarget && setShowAddBudgetModal(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowAddBudgetModal(false)}
        >
          <form
            className="modal sheet animate-in"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveBudget();
            }}
          >
            <div className="modal-header">
              <h2 className="modal-title">Monthly Budget</h2>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setShowAddBudgetModal(false)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="field">
                <label>Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 5000"
                  value={newBudgetAmount}
                  onChange={(e) => setNewBudgetAmount(e.target.value)}
                  required
                />
                <p className="hint">Applies to {selectedMonth}.</p>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn secondary" onClick={() => setShowAddBudgetModal(false)}>Cancel</button>
              <button type="submit" className="btn primary">Save Budget</button>
            </div>
          </form>
        </div>
      )}

      {/* ---- Budget History Modal (in-page, no route change) ---- */}
      {showBudgetHistory && (
        <div className="bh-modal-overlay" role="dialog" aria-modal="true" aria-label="Budget history">
          <div className="bh-modal-card">
            <div className="bh-modal-header">
              <h2>Budget History</h2>
              <button className="bh-close" onClick={() => setShowBudgetHistory(false)}>✕</button>
            </div>
            <div className="bh-modal-body">
              <BudgetHistory />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseDashboard;
