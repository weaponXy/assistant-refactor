import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './login';
import ExpenseDashboard from './expenses/expenses';
import SpreadsheetUploader from './spreadsheet/importsheets';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/expenses" element={<ExpenseDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
