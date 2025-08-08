import React from 'react';
import UploadSheets from './components/UploadSheets'; // Adjust path as needed
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  return (
    <div className="App">
      <h1>Spreadsheet Uploader</h1>
      <ToastContainer position="top-right" autoClose={3000} />
      <UploadSheets />
    </div>
  );
}

export default App;
