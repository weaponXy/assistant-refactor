import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./login";
import Inventory from "./inventory/inventory";
import Supplier from "./supplier/supplier";
import Sales from "./TablePage";
import Dashboard from "./Dashboard";
import React from 'react';
import UploadSheets from './components/UploadSheets'; // Adjust path as needed
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/Dashboard" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/supplier" element={<Supplier />} />
        <Route path="/TablePage" element={<Sales />} />
      </Routes>
    </BrowserRouter>
  );
  return (
    <div className="App">
      <h1>Spreadsheet Uploader</h1>
      <ToastContainer position="top-right" autoClose={3000} />
      <UploadSheets />
    </div>
  );
}

export default App;
