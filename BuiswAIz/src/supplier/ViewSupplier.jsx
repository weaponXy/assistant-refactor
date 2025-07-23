import React, { useState } from "react";
import "../stylecss/ViewSupplier.css";
import { supabase } from "../supabase";

const ViewSupplier = ({ supplier, onClose, onSupplierUpdated }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ ...supplier });
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdate = () => setIsEditing(true);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("suppliers")
        .update({
          suppliername: form.suppliername,
          contactperson: form.contactperson,
          supplieremail: form.supplieremail,
          phonenumber: form.phonenumber,
          address: form.address,
          supplierstatus: form.supplierstatus,
        })
        .eq("supplierid", supplier.supplierid);

      if (error) throw error;

      setIsEditing(false);
      if (onSupplierUpdated) onSupplierUpdated();
    } catch (err) {
      console.error("Error updating supplier:", err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from("suppliers")
        .delete()
        .eq("supplierid", supplier.supplierid);
      if (error) throw error;

      if (onSupplierUpdated) onSupplierUpdated();
      onClose();
    } catch (err) {
      console.error("Error deleting supplier:", err.message);
    }
  };

  return (
    <div className="view-supplier-overlay">
      <div className="view-supplier-modal">
        <div className="modal-header">
          <button onClick={onClose} className="back-button">←</button>
          <h2>Supplier</h2>
          <span className="supplier-id-tag">#{supplier.supplierid}</span>
          <div className="header-actions">
            <button className="delete-button" onClick={handleDelete}>🗑 Delete</button>
            <button className="update-button" onClick={handleUpdate} disabled={isEditing}>Update</button>
          </div>
        </div>

        <div className="modal-body">
          <label>Supplier Name</label>
          <input
            type="text"
            name="suppliername"
            value={form.suppliername}
            onChange={handleChange}
            disabled={!isEditing}
          />

          <label>Contact Person</label>
          <input
            type="text"
            name="contactperson"
            value={form.contactperson}
            onChange={handleChange}
            disabled={!isEditing}
          />

          <label>Email</label>
          <input
            type="email"
            name="supplieremail"
            value={form.supplieremail}
            onChange={handleChange}
            disabled={!isEditing}
          />

          <label>Phone Number</label>
          <input
            type="text"
            name="phonenumber"
            value={form.phonenumber}
            onChange={handleChange}
            disabled={!isEditing}
          />

          <label>Address</label>
          <input
            type="text"
            name="address"
            value={form.address}
            onChange={handleChange}
            disabled={!isEditing}
          />

          <label>Status</label>
          <select
            name="supplierstatus"
            value={form.supplierstatus}
            onChange={handleChange}
            disabled={!isEditing}
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {isEditing && (
          <div className="modal-footer">
            <button className="save-button" onClick={handleSave}>
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewSupplier;
