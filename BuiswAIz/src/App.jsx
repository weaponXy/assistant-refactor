import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./login";
import Inventory from "./inventory/inventory";
import Supplier from "./supplier/supplier";
import Sales from "./TablePage";
import Dashboard from "./Dashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/supplier" element={<Supplier />} />
        <Route path="/TablePage" element={<Sales />} />
        <Route path="/Dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
