import React, { useState, useEffect, useMemo } from 'react';
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { supabase } from '../supabase';
import "../expenses/ExpenseDashboard.css";
import { fetchMainCategories, fetchSubcategories, getCategoryById } from '../api/categories';
import { listLabels, createLabel } from '../api/labels';
import { listContacts, createContact } from '../api/contacts';
import { listExpensesByMonth, createExpense, updateExpense, listExpensesByYear, listExpensesBetween, deleteExpense } from '../api/expenses';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import { uploadAttachments } from '../api/attachments';
import BudgetCenter from "../budget/BudgetCenter";
import ContactsCenter from "../contacts/ContactsCenter";

/** Utils */
function formatYYYYMM(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
function monthBounds(yyyyMM) {
  const [y, m] = yyyyMM.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start, end };
}
function startOfTodayISO() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}
function addDaysISO(iso, days) {
  const [y,m,dd] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m-1, dd));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}
function isoRangeForPreset(preset) {
  const today = startOfTodayISO();
  switch (preset) {
    case 'last7':   return { start: addDaysISO(today, -7),  end: addDaysISO(today, 1) };
    case 'last30':  return { start: addDaysISO(today, -30), end: addDaysISO(today, 1) };
    case 'last12w': return { start: addDaysISO(today, -84), end: addDaysISO(today, 1) };
    case 'last6m':  return { start: addDaysISO(today, -183), end: addDaysISO(today, 1) };
    case 'last1y':  return { start: addDaysISO(today, -365), end: addDaysISO(today, 1) };
    case 'thisWeek': {
      const d = new Date();
      const day = (d.getDay() + 6) % 7; // 0..6 Monday..Sunday
      const start = addDaysISO(startOfTodayISO(), -day);
      const end   = addDaysISO(startOfTodayISO(), 1);
      return { start, end };
    }
    case 'thisMonth': {
      const now = new Date();
      const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0,10);
      const end   = new Date(Date.UTC(now.getFullYear(), now.getMonth()+1, 1)).toISOString().slice(0,10);
      return { start, end };
    }
    case 'thisYear': {
      const now = new Date();
      const start = new Date(Date.UTC(now.getFullYear(), 0, 1)).toISOString().slice(0,10);
      const end   = new Date(Date.UTC(now.getFullYear()+1, 0, 1)).toISOString().slice(0,10);
      return { start, end };
    }
    default: return null;
  }
}

const ExpenseDashboard = () => {
  const navigate = useNavigate();

  // ======== State ========
  const [budget, setBudget] = useState(0);

  const [editId, setEditId] = useState(null);
  const [editFiles, setEditFiles] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false); 
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedMonth, setSelectedMonth] = useState(formatYYYYMM(new Date()));
  const { start: monthStart, end: monthEnd } = useMemo(
    () => monthBounds(selectedMonth),
    [selectedMonth]
  );
  const [yearRows, setYearRows] = useState([]);

  // range filtering
  const [rangeMode, setRangeMode] = useState('month'); // 'month' | 'preset' | 'custom'
  const [rangePreset, setRangePreset] = useState('thisMonth');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  // expenses + add/edit
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0,10));
  const [amount, setAmount] = useState('');
  const [mainCatId, setMainCatId] = useState('');
  const [subCatId, setSubCatId] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState('uncleared');
  const [editAttachmentCount, setEditAttachmentCount] = useState(0);
  const [contactId, setContactId] = useState('');
  const [notes, setNotes] = useState('');
  const [labelIds, setLabelIds] = useState([]);
  const [newFiles, setNewFiles] = useState([]);

  // pickers
  const [mains, setMains] = useState([]);
  const [subs, setSubs] = useState([]);
  const [labels, setLabels] = useState([]);
  const [contacts, setContacts] = useState([]);

  // filters & sort
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortMode, setSortMode] = useState('date_desc');

  const handleOpenExpenseFromContacts = useCallback(async (expRowOrId) => {
  // If ContactsCenter passed a full row, use it.
  if (expRowOrId && typeof expRowOrId === "object") {
    openEdit(expRowOrId);
    return;
  }

  // Otherwise it’s an ID — try to find it in the currently loaded rows first
  const local = rows.find(r => r.id === expRowOrId);
  if (local) {
    openEdit(local);
    return;
  }

  // Fallback: fetch by id (could be outside current month filter)
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, occurred_on, amount, notes, status, contact_id, category_id, attachments_count")
        .eq("id", expRowOrId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        openEdit(data);
      } else {
        alert("Could not find that expense record.");
      }
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to open expense.");
    }
  }, [rows, openEdit]);

  // ======== Auth guard ========
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (error || !user) {
        window.location.href = '/login';
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // ======== Load pickers ========
  useEffect(() => {
    fetchMainCategories().then(setMains);
    listLabels().then(setLabels);
    listContacts().then(setContacts);
  }, []);
  useEffect(() => {
    if (mainCatId) fetchSubcategories(mainCatId).then(setSubs);
    else { setSubs([]); setSubCatId(''); }
  }, [mainCatId]);

  // ======== Load table data ========
  async function refresh() {
    if (rangeMode === 'month') {
      const [y, m] = selectedMonth.split('-').map(Number);
      const data = await listExpensesByMonth(y, m);
      setRows(data);
    } else if (rangeMode === 'preset') {
      const r = isoRangeForPreset(rangePreset);
      if (r) {
        const data = await listExpensesBetween(r.start, r.end);
        setRows(data);
      }
    } else if (rangeMode === 'custom') {
      if (rangeFrom && rangeTo) {
        const endExcl = addDaysISO(rangeTo, 1);
        const data = await listExpensesBetween(rangeFrom, endExcl);
        setRows(data);
      } else {
        setRows([]);
      }
    }
  }
  useEffect(() => { refresh(); }, [selectedMonth, rangeMode, rangePreset, rangeFrom, rangeTo]);

  useEffect(() => {
    const y = Number(selectedMonth.slice(0,4));
    (async () => setYearRows(await listExpensesByYear(y)))();
  }, [selectedMonth]);

  // ======== Budget for selected month (for summary only) ========
  useEffect(() => {
    setBudget(0);
    fetchBudget(selectedMonth);
  }, [selectedMonth]);

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
    } else {
      setBudget(0);
    }
  };

  // ======== Derived data ========
  const categories = Array.from(
    new Set((rows || [])
      .map(e => (e.category_path || '').split('/')[0]?.trim())
      .filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const filteredByCategory = selectedCategory === 'all'
    ? rows
    : rows.filter(e => (e.category_path || '').startsWith(selectedCategory));

  const statusOrder = { uncleared: 0, cleared: 1, reconciled: 2 };
  const primaryLabel = (e) => (e?.label_badges?.[0]?.name || '').toLowerCase();

  const visibleExpenses = useMemo(() => {
    const arr = [...filteredByCategory];
    arr.sort((a, b) => {
      switch (sortMode) {
        case 'date_desc':
          return new Date(b.occurred_on) - new Date(a.occurred_on);
        case 'date_asc':
          return new Date(a.occurred_on) - new Date(b.occurred_on);
        case 'amount_desc':
          return Number(b.amount) - Number(a.amount);
        case 'amount_asc':
          return Number(a.amount) - Number(b.amount);
        case 'status_asc':
          return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
              || new Date(b.occurred_on) - new Date(a.occurred_on);
        case 'status_desc':
          return (statusOrder[b.status] ?? -1) - (statusOrder[a.status] ?? -1)
              || new Date(b.occurred_on) - new Date(a.occurred_on);
        case 'label_asc':
          return primaryLabel(a).localeCompare(primaryLabel(b))
              || new Date(b.occurred_on) - new Date(a.occurred_on);
        case 'label_desc':
          return primaryLabel(b).localeCompare(primaryLabel(a))
              || new Date(b.occurred_on) - new Date(a.occurred_on);
        default:
          return 0;
      }
    });
    return arr;
  }, [filteredByCategory, sortMode]);

  const selectedDateStr = calendarDate.toLocaleDateString('en-CA');
  const dailyTotal = rows
    .filter(e => String(e.occurred_on || '').startsWith(selectedDateStr))
    .reduce((acc, curr) => acc + Number(curr.amount), 0);

  const monthlyTotal = rows.reduce((sum, e) => sum + Number(e.amount), 0);

  const chartData = Array.from({ length: 12 }, (_, month) => {
    const monthName = new Date(0, month).toLocaleString('default', { month: 'short' });
    const total = yearRows
      .filter((e) => new Date(e.occurred_on).getMonth() === month)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return { month: monthName, total };
  });

  // ======== Create / Update / Delete expense ========
  const category_id = subCatId || mainCatId || null;

  async function handleSaveExpense(e) {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { alert('🚫 Not logged in'); return; }

      const amountNum = Number.parseFloat(String(amount).trim());
      const chosenCategoryId = subCatId || mainCatId || null;
      if (!Number.isFinite(amountNum) || amountNum <= 0 || !occurredOn || !chosenCategoryId) {
        alert('⚠️ Amount, date, and category are required');
        return;
      }

      const exp = await createExpense({
        occurred_on: occurredOn,
        amount: amountNum,
        category_id: chosenCategoryId,
        notes: expanded ? (notes || null) : null,
        status: expanded ? status : 'uncleared',
        contact_id: expanded && contactId ? contactId : null,
        label_ids: expanded ? labelIds : [],
      });

      if (newFiles.length) {
        await uploadAttachments(exp.id, newFiles);
      }

      setShowAddModal(false);
      setAmount('');
      setMainCatId('');
      setSubCatId('');
      setNotes('');
      setLabelIds([]);
      setContactId('');
      setStatus('uncleared');
      setNewFiles([]);

      await refresh();
    } catch (err) {
      console.error(err);
      alert(`❌ Failed to add expense: ${err?.message || 'Unknown error'}`);
    }
  }

  async function handleUpdateExpense(e) {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { alert('🚫 Not logged in'); return; }

      const amountNum = Number.parseFloat(String(amount).trim());
      const chosenCategoryId = subCatId || mainCatId || null;
      if (!editId) { alert('Missing expense id'); return; }
      if (!Number.isFinite(amountNum) || amountNum <= 0 || !occurredOn || !chosenCategoryId) {
        alert('⚠️ Amount, date, and category are required');
        return;
      }

      await updateExpense(editId, {
        occurred_on: occurredOn,
        amount: amountNum,
        category_id: chosenCategoryId,
        notes: notes || null,
        status,
        contact_id: contactId || null,
        label_ids: labelIds,
      });

      if (editFiles.length) {
        await uploadAttachments(editId, editFiles);
      }

      setShowEditModal(false);
      setEditId(null);

      setAmount('');
      setMainCatId('');
      setSubCatId('');
      setNotes('');
      setLabelIds([]);
      setContactId('');
      setStatus('uncleared');
      setEditFiles([]);

      await refresh();
    } catch (err) {
      console.error(err);
      alert(`❌ Failed to update expense: ${err?.message || 'Unknown error'}`);
    }
  }

  async function handleDeleteExpense(id) {
    if (!window.confirm('Delete this expense permanently?')) return;
    try {
      await deleteExpense(id);
      await refresh();
      const y = Number(selectedMonth.slice(0,4));
      setYearRows(await listExpensesByYear(y));
    } catch (e) {
      alert(`Failed to delete: ${e?.message || 'Unknown error'}`);
    }
  }

  async function openEdit(row) {
    try {
      setEditId(row.id);
      setOccurredOn(String(row.occurred_on).slice(0,10));
      setAmount(String(row.amount));
      setStatus(row.status || 'uncleared');
      setContactId(row.contact_id || '');
      setNotes(row.notes || '');
      setEditAttachmentCount(row.attachments_count ?? 0);
      setShowEditModal(true);

      const ids = (row.label_badges || []).map(b => b.id);
      setLabelIds(ids);

      if (row.category_id) {
        const cat = await getCategoryById(row.category_id);
        if (cat?.parent_id) {
          setMainCatId(cat.parent_id);
          const subsNow = await fetchSubcategories(cat.parent_id);
          setSubs(subsNow);
          setSubCatId(cat.id);
        } else {
          setMainCatId(cat?.id || '');
          const subsNow = await fetchSubcategories(cat?.id);
          setSubs(subsNow);
          setSubCatId('');
        }
      } else {
        setMainCatId('');
        setSubCatId('');
        setSubs([]);
      }

      setShowEditModal(true);
    } catch (e) {
      console.error(e);
      alert(`Failed to open editor: ${e?.message || 'Unknown error'}`);
    }
  }

  function onCalendarStartDateChange({ activeStartDate, view }) {
    if (view === 'month') {
      const yymm = formatYYYYMM(activeStartDate);
      setSelectedMonth(yymm);
      const ms = new Date(`${yymm}-01`);
      const me = new Date(ms.getFullYear(), ms.getMonth()+1, 0);
      if (calendarDate < ms || calendarDate > me) setCalendarDate(ms);
    }
  }

  const amountNum = Number.parseFloat(String(amount).trim());
  const canSave =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    Boolean(occurredOn) &&
    Boolean(subCatId || mainCatId);

  // ======== Render ========
  return (
    <div className="dashboard-container">
      <header className="header-bar">
        <h1 className="header-title">BuiswAIz</h1>
      </header>
      <div className="main-section">
        <aside className="sidebar">
          <div className="nav-section">
            <p className="nav-header">GENERAL</p>
            <ul>
              <li onClick={() => navigate("/Dashboard")}>Dashboard</li>
              <li onClick={() => navigate("/inventory")}>Inventory</li>
              <li onClick={() => navigate("/supplier")}>Supplier</li>
              <li onClick={() => navigate("/TablePage")}>Sales</li>
              <li className="active">Expenses</li>
              <li onClick={() => navigate("/assistant")}>AI Assistant</li>
            </ul>
            <p className="nav-header">SUPPORT</p>
            <ul>
              <li>Help</li>
              <li>Settings</li>
            </ul>
          </div>
        </aside>

        <main className="main">
          {/* Summary cards */}
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

          {/* Toolbar */}
          <section className="toolbar">
            <div className="toolbar-left">
              <button className="btn primary" onClick={() => setShowAddModal(true)}>
                + Add Expense
              </button>
            </div>
              <div className="toolbar-right" style={{ display: "flex", gap: 8 }}>
                <BudgetCenter triggerClass="btn primary" triggerLabel="Budget" />
                <ContactsCenter
                  triggerClass="btn primary"
                  triggerLabel="Contacts"
                  onOpenExpense={handleOpenExpenseFromContacts}
                />
              </div>

            
          </section>

          {/* Controls */}
          <section className="table-controls">
            <div className="control">
              <label>Month</label>
              <input
                type="month"
                className="control-input"
                value={selectedMonth}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setRangeMode('month');
                  setSelectedMonth(v);
                }}
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

          {/* Table */}
          <div className="table-scroll-box">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Notes</th>
                  <th>Labels</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Attach</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleExpenses.map((r) => (
                  <tr
                    key={r.id}
                    className="clickable-row"
                    onClick={() => openEdit(r)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') openEdit(r); }}
                    role="button"
                    aria-label="Edit expense"
                  >
                    <td>{r.occurred_on}</td>
                    <td>{r.category_path ?? '—'}</td>
                    <td>{r.notes ?? ''}</td>
                    <td>
                      <div style={{display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center'}}>
                        {(r.label_badges ?? []).map((b) => (
                          <span key={b.id} className="px-2 py-0.5 rounded-full" style={{ border: '1px solid '+b.color }}>
                            <span style={{ display:'inline-block', width:8, height:8, borderRadius:999, background:b.color, marginRight:6 }} />
                            {b.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>₱{Number(r.amount).toFixed(2)}</td>
                    <td className="capitalize">{r.status}</td>
                    <td>📎 {r.attachments_count ?? 0}</td>
                    <td className="col-actions">
                      <div className="table-actions">
                        <button
                          className="btn xs outline"
                          onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); }}
                        >
                          Attachments
                        </button>
                        <button
                          className="btn xs danger"
                          onClick={(e) => { e.stopPropagation(); handleDeleteExpense(r.id); }}
                          title="Delete expense"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleExpenses.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '20px', color: '#64748b' }}>
                      No expenses in the selected range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Chart + Calendar */}
          <div className="chart-and-calendar">
            <div className="chart-container">
              <h3>Yearly Expenses Trend</h3>
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
                minDetail="month"
                maxDetail="month"
                activeStartDate={monthStart}
                onActiveStartDateChange={onCalendarStartDateChange}
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
      </div>

      {/* Add Expense modal */}
      {showAddModal && (
        <div
          className="modal-overlay fancy"
          role="dialog"
          aria-modal="true"
          aria-label="Add Expense"
          tabIndex={-1}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowAddModal(false); }}
        >
          <form className="modal sheet animate-in" onSubmit={handleSaveExpense}>
            <div className="modal-header">
              <h2 className="modal-title">Add Expense</h2>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="fields-grid">
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Main category</label>
                  <select value={mainCatId} onChange={(e) => setMainCatId(e.target.value)}>
                    <option value="">—</option>
                    {mains.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Subcategory</label>
                  <select value={subCatId} onChange={(e) => setSubCatId(e.target.value)} disabled={!subs.length}>
                    <option value="">—</option>
                    {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Amount</label>
                  <input type="number" step="0.01" min="0" value={amount}
                    onChange={(e) => setAmount(e.target.value)} required />
                </div>
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button type="button" className="btn outline" onClick={() => setExpanded(v => !v)}>
                  {expanded ? 'Hide details' : 'Add details ▸'}
                </button>
              </div>

              {expanded && (
                <div className="fields-grid" style={{ marginTop: 8 }}>
                  <div className="field">
                    <label>Status</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="uncleared">Uncleared</option>
                      <option value="cleared">Cleared</option>
                      <option value="reconciled">Reconciled</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Contact</label>
                    <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
                      <option value="">—</option>
                      {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div style={{ marginTop: 6 }}>
                      <QuickContactInline onCreated={(c) => { setContacts(prev => [...prev, c]); setContactId(c.id); }} />
                    </div>
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>Notes</label>
                    <input placeholder="Add a note…" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <div className="field" style={{ gridColumn:'1 / -1' }}>
                    <label>Labels</label>

                    {/* Multi-select with checkboxes */}
                    <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:180, overflow:'auto', padding:6, border:'1px solid #e5e7eb', borderRadius:8 }}>
                      {labels.map(l => {
                        const checked = labelIds.includes(l.id);
                        return (
                          <label key={l.id} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setLabelIds(prev => prev.includes(l.id) ? prev : [...prev, l.id]);
                                } else {
                                  setLabelIds(prev => prev.filter(id => id !== l.id));
                                }
                              }}
                            />
                            <span style={{ display:'inline-block', width:12, height:12, borderRadius:999, background:l.color }} />
                            <span>{l.name}</span>
                          </label>
                        );
                      })}
                    </div>

                    <div style={{ marginTop:8 }}>
                      <QuickLabelInline
                        onCreated={(lbl) => {
                          setLabels(prev => [...prev, lbl]);
                        }}
                      />
                    </div>

                    <div className="field" style={{ gridColumn:'1 / -1' }}>
                      <label>Attachments (JPEG/PNG)</label>
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        multiple
                        onChange={(e) => setNewFiles(Array.from(e.target.files || []))}
                      />
                      {!!newFiles.length && (
                        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:8 }}>
                          {newFiles.map((f, i) => (
                            <div key={i} className="border rounded-xl p-2" style={{ width: 140 }}>
                              <div
                                style={{
                                  width: '100%', height: 90, overflow: 'hidden',
                                  borderRadius: 12, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                              >
                                <img
                                  src={URL.createObjectURL(f)}
                                  alt={f.name}
                                  style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'cover' }}
                                  onLoad={(e) => URL.revokeObjectURL(e.currentTarget.src)}
                                />
                              </div>
                              <div style={{ fontSize: 12, marginTop: 6, color: '#475569' }}>
                                {f.name.length > 20 ? f.name.slice(0, 17) + '…' : f.name}
                              </div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>
                                {(f.size/1024).toFixed(1)} KB
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn secondary" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={!canSave}>
                Add Expense
              </button>
            </div>

          </form>
        </div>
      )}

      {/* Edit Expense modal */}
      {showEditModal && (
        <div
          className="modal-overlay fancy"
          role="dialog"
          aria-modal="true"
          aria-label="Edit Expense"
          tabIndex={-1}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowEditModal(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowEditModal(false); }}
        >
          <form className="modal sheet animate-in" onSubmit={handleUpdateExpense}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Expense</h2>
              <span style={{ fontSize: 12, color: '#64748b' }}>📎 {editAttachmentCount}</span>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="fields-grid">
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Main category</label>
                  <select value={mainCatId} onChange={async (e) => {
                    const val = e.target.value;
                    setMainCatId(val);
                    setSubCatId('');
                    if (val) {
                      const subsNow = await fetchSubcategories(val);
                      setSubs(subsNow);
                    } else {
                      setSubs([]);
                    }
                  }}>
                    <option value="">—</option>
                    {mains.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Subcategory</label>
                  <select value={subCatId} onChange={(e) => setSubCatId(e.target.value)} disabled={!subs.length}>
                    <option value="">—</option>
                    {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Amount</label>
                  <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
              </div>

              <div className="fields-grid" style={{ marginTop: 8 }}>
                <div className="field">
                  <label>Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="uncleared">Uncleared</option>
                    <option value="cleared">Cleared</option>
                    <option value="reconciled">Reconciled</option>
                  </select>
                </div>

                <div className="field">
                  <label>Contact</label>
                  <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
                    <option value="">—</option>
                    {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="field" style={{ gridColumn:'1 / -1' }}>
                  <label>Notes</label>
                  <input placeholder="Add a note…" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>

                <div className="field" style={{ gridColumn:'1 / -1' }}>
                  <label>Labels</label>
                  <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:180, overflow:'auto', padding:6, border:'1px solid #e5e7eb', borderRadius:8 }}>
                    {labels.map(l => {
                      const checked = labelIds.includes(l.id);
                      return (
                        <label key={l.id} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) setLabelIds(prev => prev.includes(l.id) ? prev : [...prev, l.id]);
                              else setLabelIds(prev => prev.filter(id => id !== l.id));
                            }}
                          />
                          <span style={{ display:'inline-block', width:12, height:12, borderRadius:999, background:l.color }} />
                          <span>{l.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="field" style={{ gridColumn:'1 / -1' }}>
                  <label>Attachments (JPEG/PNG)</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    multiple
                    onChange={(e) => setEditFiles(Array.from(e.target.files || []))}
                  />
                  {!!editFiles.length && (
                    <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:8 }}>
                      {editFiles.map((f, i) => (
                        <div key={i} className="border rounded-xl p-2" style={{ width: 140 }}>
                          <div
                            style={{
                              width: '100%', height: 90, overflow: 'hidden',
                              borderRadius: 12, background: '#f1f5f9', display: 'flex',
                              alignItems: 'center', justifyContent: 'center'
                            }}
                          >
                            <img
                              src={URL.createObjectURL(f)}
                              alt={f.name}
                              style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'cover' }}
                              onLoad={(e) => URL.revokeObjectURL(e.currentTarget.src)}
                            />
                          </div>
                          <div style={{ fontSize: 12, marginTop: 6, color: '#475569' }}>
                            {f.name.length > 20 ? f.name.slice(0, 17) + '…' : f.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {(f.size/1024).toFixed(1)} KB
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button type="submit" className="btn primary">Save changes</button>
            </div>
          </form>
        </div>
      )}

      {/* Attachments panel */}
      {selectedId && (
        <div className="main" style={{ paddingTop: 0 }}>
          <section className="rounded-2xl border p-4">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h2 className="modal-title">Attachments</h2>
              <button className="btn secondary" onClick={() => setSelectedId(null)}>Close</button>
            </div>
            <AttachmentsPanel expenseId={selectedId} />
          </section>
        </div>
      )}
    </div>
  );
};

// Inline “quick contact”
function QuickContactInline({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const c = await createContact({ name, email, phone });
      onCreated(c);
      setOpen(false);
      setName(''); setEmail(''); setPhone('');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return <button className="btn xs outline" onClick={() => setOpen(true)}>+ New contact</button>;

  return (
    <div className="fields-grid" style={{ marginTop: 8 }}>
      <div className="field"><label>Name</label><input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Contact name" /></div>
      <div className="field"><label>Email</label><input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="email@example.com" /></div>
      <div className="field"><label>Phone</label><input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="+63…" /></div>
      <div className="field" style={{ gridColumn:'1 / -1' }}>
        <button type="button" className="btn primary" disabled={saving} onClick={submit}>Save contact</button>
        <button type="button" className="btn secondary" style={{ marginLeft: 8 }} onClick={()=>setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function QuickLabelInline({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const lbl = await createLabel({ name: name.trim(), color });
      onCreated?.(lbl);
      setOpen(false);
      setName('');
      setColor('#6366f1');
    } catch (e) {
      console.error(e);
      alert(`Failed to create label: ${e?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn xs outline" onClick={() => setOpen(true)}>
        + New label
      </button>
    );
  }

  return (
    <div className="fields-grid" style={{ marginTop: 4, width: '100%', maxWidth: 520 }}>
      <div className="field">
        <label>Name</label>
        <input
          placeholder="e.g. Tax, Urgent, Reimbursable"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Color</label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ height: 38, padding: 4 }} />
      </div>
      <div className="field" style={{ gridColumn:'1 / -1' }}>
        <button type="button" className="btn primary" disabled={saving || !name.trim()} onClick={submit}>
          Save label
        </button>
        <button type="button" className="btn secondary" style={{ marginLeft: 8 }} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default ExpenseDashboard;
