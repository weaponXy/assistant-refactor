import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, ResponsiveContainer,
} from 'recharts';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { supabase } from '../supabase';
import "../stylecss/ExpenseDashboard.css";


const ExpenseDashboard = () => {
  const [expenses, setExpenses] = useState([]);
  const [budget, setBudget] = useState(0);
  const [initialBudget, setInitialBudget] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddBudgetModal, setShowAddBudgetModal] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState(null);
  const [newExpense, setNewExpense] = useState({
    description: '', category: '', amount: '', date: '',
  });
  const [newBudgetAmount, setNewBudgetAmount] = useState('');
  const [calendarDate, setCalendarDate] = useState(new Date());

  useEffect(() => {
    fetchExpenses();
    fetchBudget();
  }, []);

  const fetchExpenses = async () => {
    const { data, error } = await supabase.from('expenses').select('*');
    if (error) console.error('Error fetching expenses:', error);
    else setExpenses(data);
  };

  const fetchBudget = async () => {
    const now = new Date();
    const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { data, error } = await supabase
      .from('budget')
      .select('*')
      .eq('month_year', monthYear)
      .single();

    if (error && error.code !== 'PGRST116') {
    console.error("❌ Failed to fetch budget:", error);
    return;
  }

  if (data) {
    setBudget(Number(data.monthly_budget_amount));
    setInitialBudget(Number(data.monthly_budget_amount));
  } else {
    setBudget(0);
    setInitialBudget(0);
    console.info("ℹ️ No budget found for this month.");
  }
};

  const handleSaveBudget = async () => {
    const now = new Date();
    const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { error } = await supabase
      .from('budget')
      .upsert({
        month_year: monthYear,
        monthly_budget_amount: Number(newBudgetAmount),
      }, { onConflict: ['month_year'] });

    if (error) {
      console.error("Failed to add budget:", error);
    } else {
      alert("✅ Budget added!");
      setShowAddBudgetModal(false);
      setNewBudgetAmount('');
      fetchBudget();
    }
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
        expensedate: newExpense.date,
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

  const selectedDateStr = calendarDate.toLocaleDateString('en-CA');
  const dailyTotal = expenses
  .filter(e => e.expensedate?.startsWith(selectedDateStr))
  .reduce((acc, curr) => acc + Number(curr.amount), 0);


  const currentMonth = new Date().getMonth();
  const monthlyTotal = expenses
    .filter(e => new Date(e.expensedate).getMonth() === currentMonth)
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const chartData = Array.from({ length: 12 }, (_, month) => {
    const monthName = new Date(0, month).toLocaleString('default', { month: 'short' });
    const total = expenses
      .filter((e) => new Date(e.expensedate).getMonth() === month)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return { month: monthName, total };
  });

  const weeklyBarData = (() => {
    const current = new Date();
    const monday = new Date(current.setDate(current.getDate() - current.getDay() + 1));
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dayLabel = date.toLocaleDateString('default', { weekday: 'short' });
      const total = expenses
        .filter(e => new Date(e.expensedate).toDateString() === date.toDateString())
        .reduce((sum, e) => sum + Number(e.amount), 0);
      return { day: dayLabel, total };
    });
    return days;
  })();

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <h1 className="logo">BuisWaiz</h1>
        <nav className="nav">
          <ul>
            <li><a href="#">Dashboard</a></li>
            <li><a href="#">Inventory</a></li>
            <li><a href="#">Sales</a></li>
            <li><a className="active" href="#">Expenses</a></li>
            <li><a href="#">AI Assistant</a></li>
          </ul>
        </nav>
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
            <button onClick={() => setShowAddBudgetModal(true)}>Edit Budget</button>
          </div>
        </div>

        {monthlyTotal > budget && (
          <div className="warning-banner">
            ⚠️ You're over your monthly budget by ₱{(monthlyTotal - budget).toFixed(2)}!
          </div>
        )}

        <section className="actions">
          <div className="action-group">
            <button onClick={() => {
              setNewExpense({ description: '', category: '', amount: '', date: '' });
              setEditExpenseId(null);
              setShowAddModal(true);
            }}>Add Expense</button>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.expenseid}>
                  <td>{expense.description}</td>
                  <td>{expense.category}</td>
                  <td>₱{Number(expense.amount).toFixed(2)}</td>
                  <td>{expense.expensedate}</td>
                  <td>
                    <button
                      className="table-btn edit"
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
                    <button className="table-btn delete" onClick={() => handleDelete(expense.expenseid)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
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
            <Calendar value={calendarDate} onChange={setCalendarDate} />
          </div>
        </div>
      </main>

      {showAddModal && (
        <div className="modal-overlay">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveExpense();
            }}
          >
            <h2>{editExpenseId ? 'Edit Expense' : 'Add Expense'}</h2>
            <input
              placeholder="Description"
              value={newExpense.description}
              onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
            />
            <input
              placeholder="Category"
              value={newExpense.category}
              onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
            />
            <input
              type="number"
              placeholder="Amount"
              value={newExpense.amount}
              onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
            />
            <input
              type="date"
              value={newExpense.date}
              onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
            />
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditExpenseId(null);
                  setNewExpense({ description: '', category: '', amount: '', date: '' });
                }}
              >
                Cancel
              </button>
              <button type="submit">{editExpenseId ? 'Update' : 'Add'}</button>
            </div>
          </form>
        </div>
      )}

      {showAddBudgetModal && (
        <div className="modal-overlay">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveBudget();
            }}
          >
            <h2>Add Monthly Budget</h2>
            <input
              type="number"
              placeholder="Enter budget amount"
              value={newBudgetAmount}
              onChange={(e) => setNewBudgetAmount(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setShowAddBudgetModal(false)}>Cancel</button>
              <button type="submit">Save Budget</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ExpenseDashboard;
