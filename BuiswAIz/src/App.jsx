// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import Login from "./login";
import Inventory from "./inventory/inventory";
import Supplier from "./supplier/supplier";
import Sales from "./TablePage";
import Dashboard from "./Dashboard";
import ExpenseDashboard from "./expenses/expenses";
import UploadSheets from "./components/UploadSheets";
import BudgetHistory from "./budget/BudgetHistory";

function App() {
  return (
    <div className="App">
      <ToastContainer position="top-right" autoClose={3000} />

      <BrowserRouter>
        {/* simple nav so you can reach pages easily */}
        <nav style={{ display: "flex", gap: 12, padding: 12, borderBottom: "1px solid #eee" }}>
          <Link to="/Dashboard">Dashboard</Link>
          <Link to="/inventory">Inventory</Link>
          <Link to="/supplier">Supplier</Link>
          <Link to="/TablePage">Sales</Link>
          <Link to="/expenses">Expenses</Link>
          <Link to="/upload">Upload Sheets</Link>
          <Link to="/budget">Budget History</Link>
        </nav>

        <Routes>
          {/* home -> login (change if you want a different landing) */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          {/* your existing pages */}
          <Route path="/Dashboard" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/supplier" element={<Supplier />} />
          <Route path="/TablePage" element={<Sales />} />
          <Route path="/expenses" element={<ExpenseDashboard />} />
          <Route path="/upload" element={<UploadSheets />} />

          {/* budget history (two URLs point to the same component) */}
          <Route path="/budget" element={<BudgetHistory />} />
          <Route path="/budget-history" element={<BudgetHistory />} />

          {/* fallback to login if route not found */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
