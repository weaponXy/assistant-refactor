import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import "../stylecss/RestockStorage.css";

const RestockStorage = ({ onClose }) => {
  const [storageData, setStorageData] = useState([]);

  useEffect(() => {
    fetchStorage();
  }, []);

  const fetchStorage = async () => {
    const { data, error } = await supabase
    .from("restockstorage")
    .select(`
        restockid,
        new_stock,
        new_cost,
        new_price,
        created_at,
        products ( productname ),
        suppliers ( suppliername )
    `);
    if (error) console.error(error);
    else setStorageData(data);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-window">
        <h2>Restock Storage</h2>
        <button onClick={onClose} className="close-btn">X</button>
        
        <table className="restock-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>Cost</th>
              <th>Price</th>
              <th>Supplier</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {storageData.map((restock) => (
              <tr key={restock.restockid}>
                <td>{restock.products?.productname || "Unknown"}</td>
                <td>{restock.new_stock}</td>
                <td>{restock.new_cost}</td>
                <td>{restock.new_price}</td>
                <td>{restock.suppliers?.suppliername || "Unknown"}</td>
                <td>{new Date(restock.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RestockStorage;
