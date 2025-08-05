import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import "../stylecss/AddDefect.css";

const AddDefect = ({ onClose, user}) => {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    productid: "",
    quantity: "",
    status: "In-Process", // default
    defectdescription: "",
    reporteddate: "",
  });

  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await supabase.from("products").select("productid, productname");
      if (!error) setProducts(data);
    };
    fetchProducts();
  }, []);

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        
        const { data: product, error: fetchError } = await supabase
            .from("products")
            .select("currentstock, productname")
            .eq("productid", form.productid)
            .single();

        if (fetchError) {
            alert("Error fetching product stock.");
            return;
        }

        const defectQty = parseInt(form.quantity);
        const currentStock = parseInt(product.currentstock);

        
        if (defectQty > currentStock) {
            alert("Cannot report more defective items than current stock.");
            return;
        }

        
        const { error: insertError } = await supabase
            .from("defectiveitems")
            .insert([form]);

        if (insertError) {
            alert("Error adding defect.");
            return;
        }

        
        const { error: updateError } = await supabase
            .from("products")
            .update({ currentstock: currentStock - defectQty })
            .eq("productid", form.productid);

        if (updateError) {
            alert("Defect added, but failed to update product stock.");
        } else {
            if (user) {
                await supabase.from("activitylog").insert([
                  {
                    action_type: "add_defect",
                    action_desc: `added ${defectQty} defective item(s) for ${product.productname}`,
                    done_user: user.userid,
                  },
                  ]);
                }
            onClose(); 
        }
    };


  return (
    <div className="modal-overlay">
      <div className="AddDefmodal-content">
        <h2>Add Defective Item</h2>
        <form onSubmit={handleSubmit} className="defect-form">
          <div className="form-group">
            <label>Product</label>
            <select
              name="productid"
              value={form.productid}
              onChange={handleChange}
              required
            >
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.productid} value={p.productid}>
                  {p.productname}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Quantity</label>
            <input
              type="number"
              name="quantity"
              value={form.quantity}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Status</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              required
            >
              <option value="In-Process">In-Process</option>
              <option value="Returned">Returned</option>
            </select>
          </div>

          <div className="form-group">
            <label>Reported Date</label>
            <input
              type="date"
              name="reporteddate"
              value={form.reporteddate}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Remarks</label>
            <textarea
              name="defectdescription"
              value={form.defectdescription}
              onChange={handleChange}
              rows="3"
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-save">Save</button>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddDefect;
