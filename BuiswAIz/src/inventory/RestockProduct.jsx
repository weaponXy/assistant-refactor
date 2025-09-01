import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import ConfirmStockModal from "./ConfirmationModals/ConfirmationStock";
import "../stylecss/RestockProduct.css";

const RestockProduct = ({ onClose, onSuccess, user }) => {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const formValidate = () => {
      const requiredFields = [
          "productid",
          "supplierid",
          "new_stock",
          "new_cost",
          "new_price",
      ];

      const isEmpty = requiredFields.some((field) => {
        const value = formData[field];
        if (typeof value === "string" && value.trim() === "") return true;
        if (["new_stock", "new_cost", "new_price"].includes(field)) {
          const numValue = Number(value);     
          if (isNaN(numValue) || numValue <= 0) return true; 
        }
        return false;
      });
      if (isEmpty) {
        setFormError("Please fill in all required fields.");
        return false;
    }
      setFormError("");
      return true;
  }

  const handleAddRestock = async () => {
    if (!formValidate()) return;
    try {
      setIsSubmitting(true);

      const { error: restockError } = await supabase.from("restockstorage").insert([
        {
          productid: formData.productid,
          supplierid: formData.supplierid,
          new_stock: parseInt(formData.new_stock, 10),
          new_cost: parseFloat(formData.new_cost),
          new_price: parseFloat(formData.new_price),
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

      const { error: logError } = await supabase.from("activitylog").insert([
      {
        action_desc: `Stored ${product?.productname || "product"} to the storage`,
        done_user: user?.userid || null,
      },
    ]);

      if (logError) {
        console.error("Error adding log:", logError.message);
        return;
      }

      onSuccess();
    } catch (err) {
      console.error("Transaction failed:", err.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="restock-form-container">
      <h3>Add Restock Item</h3>
      <form className="restock-form">
        <select
          name="productid"
          value={formData.productid}
          onChange={handleChange}
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
          min = "1"
          placeholder="Quantity"
          value={formData.new_stock}
          onChange={handleChange}
        />
        <input
          type="number"
          name="new_cost"
          min = "1"
          placeholder="Cost"
          value={formData.new_cost}
          onChange={handleChange}
        />
        <input
          type="number"
          name="new_price"
          min = "1"
          placeholder="Price"
          value={formData.new_price}
          onChange={handleChange}
        />

        <div className="form-buttons">
          <button type="button" onClick={() => {
            if (formValidate()) {
              setShowConfirm(true); 
            }
          }}
          disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
        <ConfirmStockModal
          isOpen={showConfirm}
          onConfirm={async () => {
            await handleAddRestock();
            setShowConfirm(false);
          }}
          onCancel={() => setShowConfirm(false)}
          productName={products.find(p => p.productid === parseInt(formData.productid))?.productname}
        />
        
        {formError && (
          <div className="form-warning">
            {formError}
          </div>
        )}
      </form>
    </div>
  );
};

export default RestockProduct;
