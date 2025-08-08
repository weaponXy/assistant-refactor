import React, { useState } from "react";
import * as XLSX from "xlsx";
import { uploadToSupabase } from "../services/supabaseUploader";
import { toast } from "react-toastify";

function UploadSheets() {

  const REQUIRED_COLUMNS = [
  "OrderID",
  "ProductID",
  "quantity",
  "unitprice",
  "subtotal",
  "orderdate",
  "orderstatus",
  ];

  const MAX_FILE_SIZE_MB = 5;

  const [data, setData] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e) => {
  const file = e.target.files[0];

  // Check 1: File type
  const allowedTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel"
  ];

  if (!allowedTypes.includes(file.type)) {
    toast.error("Invalid file type. Please upload an Excel (.xlsx or .xls) file.");
    return;
  }

  // Check 2: File size
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    toast.error(`File too large. Must be under ${MAX_FILE_SIZE_MB}MB.`);
    return;
  }

  const reader = new FileReader();
  reader.readAsBinaryString(file);

  reader.onload = async (e) => {
    try {
      const fileData = e.target.result;
      const workbook = XLSX.read(fileData, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const parsedData = XLSX.utils.sheet_to_json(sheet);

      // Check 3: Validate sheet columns
      const sheetColumns = Object.keys(parsedData[0]);
      const missingColumns = REQUIRED_COLUMNS.filter(col => !sheetColumns.includes(col));

      if (missingColumns.length > 0) {
        toast.error(`Missing required columns: ${missingColumns.join(", ")}`);
        return;
      }

      // All validations passed
      setData(parsedData);
      setUploading(true);
      toast.info("Uploading sales data...");

      const result = await uploadToSupabase(parsedData);

      setUploading(false);

      if (result.success) {
        toast.success("Upload successful!");
      } else {
        toast.error("Upload failed: " + result.error.message);
        console.error("Upload failed", result.error);
      }

    } catch (err) {
      toast.error("Failed to process file.");
      console.error("File read error:", err);
    }
  };
};


  return (
    <div className="Sheets">
      <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} />

      {uploading && <p>Uploading...</p>}

      {data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              {Object.keys(data[0]).map((key) => (
                <th key={key}>{key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Object.values(row).map((value, cellIndex) => (
                  <td key={cellIndex}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default UploadSheets;
