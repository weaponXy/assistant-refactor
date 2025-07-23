import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./login";
import Inventory from "./inventory/inventory";
import Supplier from "./supplier/supplier";
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/supplier" element={<Supplier />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
