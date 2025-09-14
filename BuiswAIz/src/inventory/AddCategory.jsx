import React, { useState } from "react";
import { supabase } from "../supabase";
import "../stylecss/AddCategory.css"; // Create this file for modal styling

const AddCategory = ({ productId, onClose, onCategoryAdded }) => {
  const [form, setForm] = useState({
    price: "",
    cost: "",
    color: "",
    agesize: "",
    currentstock: "",
    reorderpoint: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (formError) setFormError("");
  };

    const handleSave = async () => {
        // Basic validation
        if (!form.price || !form.cost || !form.color || !form.agesize) {
            setFormError("Please fill in all required fields.");
            return;
        }

        const price = parseFloat(form.price);
        const cost = parseFloat(form.cost);
        const currentStock = parseInt(form.currentstock) || 0;
        const reorderPoint = parseInt(form.reorderpoint) || 0;

        // Additional validation
        if (price < cost) {
            setFormError("Price cannot be lower than cost.");
            return;
        }

        if (currentStock < reorderPoint) {
            setFormError("Current stock cannot be lower than reorder point.");
            return;
        }

        setIsLoading(true);

        try {
            const { error } = await supabase.from("productcategory").insert([{
                productid: productId,
                price,
                cost,
                color: form.color,
                agesize: form.agesize,
                currentstock: currentStock,
                reorderpoint: reorderPoint,
            }]);

            if (error) throw error;

            // Call parent callback
            if (onCategoryAdded) onCategoryAdded();
        } catch (err) {
            console.error("Error adding category:", err.message);
            setFormError("Failed to add category. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };


  const handleCancel = () => {
    onClose();
  };

  return (
    <div className="add-category-overlay">
      <div className="add-category-modal">
        <div className="modal-header">
          <h2>Add Category</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {formError && <div className="form-warning">{formError}</div>}
        <div className="add-category-form">
            <div>
                <label>Price *</label>
                <input type="number" name="price" value={form.price} onChange={handleChange} placeholder="Enter price" min="0"/>
            </div>

            <div>
                <label>Cost *</label>
                <input type="number" name="cost" value={form.cost} onChange={handleChange} placeholder="Enter cost" min="0"/>
            </div>

            <div>
                <label>Color *</label>
                <input type="text" name="color" value={form.color} onChange={handleChange} placeholder="Enter color" />
            </div>

           <div>
                <label>Age/Size *</label>
                <select
                    name="agesize"
                    value={form.agesize}
                    onChange={handleChange}
                >
                    <option value="">-- Select Age/Size --</option>
                    <option value="Newborn">Newborn</option>
                    <option value="0-3 Months">0-3 Months</option>
                    <option value="3-6 Months">3-6 Months</option>
                    <option value="6-9 Months">6-9 Months</option>
                    <option value="9-12 Months">9-12 Months</option>
                    <option value="12-18 Months">12-18 Months</option>
                </select>
            </div>

            <div>
                <label>Current Stock</label>
                <input type="number" name="currentstock" value={form.currentstock} onChange={handleChange} placeholder="Enter current stock" min="0"/>
            </div>

            <div>
                <label>Reorder Point</label>
                <input type="number" name="reorderpoint" value={form.reorderpoint} onChange={handleChange} placeholder="Enter reorder point" min="0"/>
            </div>
        </div>
        </div>

        <div className="modal-footer">
          <button
            className="cancel-button"
            onClick={handleCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className="save-button"
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddCategory;
