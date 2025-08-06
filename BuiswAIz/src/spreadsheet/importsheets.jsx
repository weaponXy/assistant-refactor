import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';

const TABLE_CONFIG = {
  orders: {
    requiredColumns: ['orderid', 'orderdate', 'totalamount', 'orderstatus', 'createdat', 'updatedat'],
  },
  expenses: {
    requiredColumns: ['expenseid', 'expensedate', 'amount', 'description', 'category', 'createdat', 'updatedat'],
    needsUserId: true,
  },
  sales: {
    requiredColumns: ['saleid', 'saledate', 'amount', 'customername', 'createdat', 'updatedat'],
  },
};

function SpreadsheetUploader() {
  const [sheetType, setSheetType] = useState('orders');
  const [uploading, setUploading] = useState(false);
  const [dataPreview, setDataPreview] = useState([]);
  const [skippedRows, setSkippedRows] = useState([]);

  const handleFile = async (file) => {
    const reader = new FileReader();

    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const jsonData = XLSX.utils.sheet_to_json(ws);

      const { requiredColumns, needsUserId } = TABLE_CONFIG[sheetType];
      const validData = [];
      const skipped = [];

      // Get current user (if needed)
      let currentUserId = null;
      if (needsUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        currentUserId = user?.id;
      }

      // Validate each row
      jsonData.forEach((row, index) => {
        const cleanRow = {};
        let isValid = true;

        for (const col of requiredColumns) {
          if (row[col] === undefined || row[col] === null || row[col] === '') {
            isValid = false;
            break;
          }
          cleanRow[col] = row[col];
        }

        // Add user ID if required
        if (needsUserId) {
          cleanRow.createdbyuserid = currentUserId;
        }

        // Add to valid/invalid list
        if (isValid) {
          validData.push(cleanRow);
        } else {
          skipped.push({ rowIndex: index + 2, row });
        }
      });

      // Show preview and skipped info
      setDataPreview(validData);
      setSkippedRows(skipped);

      if (validData.length === 0) {
        alert('❌ No valid rows found. Please check your spreadsheet format.');
        return;
      }

      // Upload to Supabase
      setUploading(true);
      const { error } = await supabase.from(sheetType).insert(validData);
      setUploading(false);

      if (error) {
        console.error('Insert error:', error);
        alert('❌ Failed to upload data. Please check console for error.');
      } else {
        alert(`✅ Uploaded ${validData.length} rows. Skipped ${skipped.length}.`);
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleButtonClick = () => {
    document.getElementById('excel-file-input').click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    handleFile(file);
  };

  return (
    <div className="p-4 bg-white rounded shadow-md">
      <h2 className="text-xl font-bold mb-2">Upload Spreadsheet</h2>

      <label className="block mb-2 font-medium">Select Spreadsheet Type:</label>
      <select
        className="mb-4 p-2 border rounded w-full"
        value={sheetType}
        onChange={(e) => setSheetType(e.target.value)}
      >
        <option value="orders">Orders</option>
        <option value="expenses">Expenses</option>
        <option value="sales">Sales (optional)</option>
      </select>

      <button
        onClick={handleButtonClick}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
        disabled={uploading}
      >
        {uploading ? 'Uploading...' : 'Upload Excel File'}
      </button>

      <input
        id="excel-file-input"
        type="file"
        accept=".xlsx, .xls"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {dataPreview.length > 0 && (
        <div className="mt-4">
          <h3 className="font-semibold mb-1">✅ Preview of Valid Rows:</h3>
          <pre className="bg-gray-100 p-2 overflow-x-auto max-h-60 text-sm">
            {JSON.stringify(dataPreview.slice(0, 5), null, 2)}
          </pre>
          {dataPreview.length > 5 && (
            <p className="text-sm text-gray-500">Only showing first 5 rows...</p>
          )}
        </div>
      )}

      {skippedRows.length > 0 && (
        <div className="mt-4">
          <h3 className="font-semibold mb-1 text-red-600">⚠️ Skipped Rows (Missing Fields):</h3>
          <pre className="bg-red-100 p-2 overflow-x-auto max-h-60 text-sm">
            {JSON.stringify(skippedRows.slice(0, 5), null, 2)}
          </pre>
          {skippedRows.length > 5 && (
            <p className="text-sm text-gray-500">Only showing first 5 skipped rows...</p>
          )}
        </div>
      )}
    </div>
  );
}

export default SpreadsheetUploader;
