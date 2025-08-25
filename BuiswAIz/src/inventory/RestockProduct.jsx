import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import "../stylecss/RestockProduct.css";

const RestockProduct = ({ onClose, onSuccess, user }) => {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({
    productid: "",
    supplierid: "",
    new_stock: "",
    new_cost: "",
    new_price: "",
  });

  useEffect(() => {
    const fetchSuppliers = async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("supplierstatus", "Active");
      if (!error) setSuppliers(data);
    };

    const fetchProducts = async () => {
      const { data, error } = await supabase.from("products").select("*");
      if (!error) setProducts(data);
    };

    fetchSuppliers();
    fetchProducts();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  
 // Handle Submit 
  const handleAddRestock = async (e) => {
    e.preventDefault();
    try {
      const { error: restockError } = await supabase.from("restockstorage").insert([
        {
          productid: formData.productid,
          supplierid: formData.supplierid,
          new_stock: parseInt(formData.new_stock, 10),
          new_price: parseFloat(formData.new_price),
          new_cost: parseFloat(formData.new_cost),
        },
      ]);

      if (restockError) {
        console.error("Error adding restock:", restockError.message);
        return;
      }

      const totalExpense =
        parseInt(formData.new_stock, 10) * parseFloat(formData.new_cost);
      const expenseDate = new Date();

      const product = products.find((p) => p.productid === parseInt(formData.productid, 10));

      const { error: expenseError } = await supabase.from("expenses").insert([
        {
          expensedate: expenseDate.toISOString(),
          amount: totalExpense,
          description: `Restock of ${product?.productname || "product"}`,
          category: "Inventory",
          createdbyuserid: user?.userid || null,
        },
      ]);

      if (expenseError) {
        console.error("Error adding expense:", expenseError.message);
        return;
      }

      const { error: logError } = await supabase.from("activitylog").insert({
        action_desc: `Stored ${product?.productname || "product"} to the storage`,
        done_user: user?.userid || null,
      });

      if (logError) {
        console.error("Error adding log:", logError.message);
        return;
      }

      onSuccess();
    } catch (err) {
      console.error("Transaction failed:", err.message);
    }
  };


  return (
    <div className="restock-form-container">
      <h3>Add Restock Item</h3>
      <form onSubmit={handleAddRestock} className="restock-form">
        <select
          name="productid"
          value={formData.productid}
          onChange={handleChange}
          required
        >
          <option value="">Select Product</option>
          {products.map((p) => (
            <option key={p.productid} value={p.productid}>
              {p.productname}
            </option>
          ))}
        </select>

        <select
          name="supplierid"
          value={formData.supplierid}
          onChange={handleChange}
          required
        >
          <option value="">Select Supplier</option>
          {suppliers.map((s) => (
            <option key={s.supplierid} value={s.supplierid}>
              {s.suppliername}
            </option>
          ))}
        </select>

        <input
          type="number"
          name="new_stock"
          placeholder="Quantity"
          value={formData.new_stock}
          onChange={handleChange}
          required
        />
        <input
          type="number"
          name="new_cost"
          placeholder="Cost"
          value={formData.new_cost}
          onChange={handleChange}
          required
        />
        <input
          type="number"
          name="new_price"
          placeholder="Price"
          value={formData.new_price}
          onChange={handleChange}
          required
        />

        <div className="form-buttons">
          <button type="submit">Save</button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default RestockProduct;
