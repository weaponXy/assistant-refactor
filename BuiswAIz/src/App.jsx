import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./login";
import Inventory from "./inventory/inventory";
import Supplier from "./supplier/supplier";
import ForgotPassword from './forgotpassword';
import ResetPassword from './ResetPassword';
import Sales from "./TablePage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/supplier" element={<Supplier />} />
        <Route path="/TablePage" element={<Sales />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
