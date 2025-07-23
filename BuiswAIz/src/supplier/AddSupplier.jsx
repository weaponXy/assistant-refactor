import React, { useState } from "react";
import "../stylecss/AddSupplier.css";
import { supabase } from "../supabase";

const AddSupplier = ({ onClose, user }) => {
  const [formData, setFormData] = useState({
    suppliername: "",
    contactperson: "",
    phonenumber: "",
    supplieremail: "",
    address: "",
    supplierstatus: "active",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    const { error } = await supabase.from("suppliers").insert({
      ...formData,
    });

    if (error) {
      console.error("Insert failed:", error);
      alert("Failed to add supplier.");
    } else {
      if (user) {
        await supabase.from("activitylog").insert([
          {
            action_type: "add_supplier",
            action_desc: `added ${formData.suppliername} to the supplier list`,
            done_user: user.userid,
          },
        ]);
      }
      onClose();
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content slide-up">
        {/* Header */}
        <div className="modal-header">
          <button className="back-btn" onClick={onClose}>←</button>
          <h2>Supplier</h2>
          <div className="modal-actions">
            <button className="save-btn">Save Draft</button>
            <button className="create-btn" onClick={handleSubmit}>Create Supplier</button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">
          <div className="product-fields">
            <label>Supplier Name</label>
            <input
              name="suppliername"
              className="product-name-input"
              placeholder="Supplier Name"
              value={formData.suppliername}
              onChange={handleChange}
            />

            <div className="two-cols">
              <input
                name="contactperson"
                placeholder="Contact Person"
                value={formData.contactperson}
                onChange={handleChange}
              />
              <input
                name="phonenumber"
                placeholder="Phone Number"
                value={formData.phonenumber}
                onChange={handleChange}
              />
            </div>

            <div className="two-cols">
              <input
                name="supplieremail"
                placeholder="Email Address"
                value={formData.supplieremail}
                onChange={handleChange}
              />
              <input
                name="address"
                placeholder="Address"
                value={formData.address}
                onChange={handleChange}
              />
            </div>

            <div className="two-cols">
              <select
                name="supplierstatus"
                value={formData.supplierstatus}
                onChange={handleChange}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddSupplier;
