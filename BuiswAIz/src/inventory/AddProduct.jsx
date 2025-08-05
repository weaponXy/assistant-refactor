import React, { useEffect, useState } from "react";
import "../stylecss/AddProduct.css";
import { supabase } from "../supabase";
import imageCompression from "browser-image-compression";

const AddProduct = ({ onClose, user }) => {
  const [suppliers, setSuppliers] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [formData, setFormData] = useState({
    productname: "",
    description: "",
    cost: "",
    reorderpoint: "",
    currentstock: "",
    price: "",
    suppliername: "",
    image_url: "",
  });

  useEffect(() => {
    const fetchSuppliers = async () => {
      const { data, error } = await supabase.from("suppliers").select("*").eq("supplierstatus", "Active")
      if (!error) setSuppliers(data);
    };
    fetchSuppliers();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const options = {
        maxSizeMB: 0.1,
        maxWidthOrHeight: 500,
        useWebWorker: true,
    };

    try {
        const compressedFile = await imageCompression(file, options);
        // Copy original file name to compressed file
        compressedFile.name = file.name;
        setImageFile(compressedFile);
    } catch (err) {
        console.error("Image compression failed:", err);
    }
  };


  const uploadImage = async () => {
    if (!imageFile) return "";

    const fileExt = imageFile.name.split(".").pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const { data, error } = await supabase.storage
      .from("product-images")
      .upload(fileName, imageFile);

    if (error) {
      console.error("Upload error:", error);
      return "";
    }

    const { data: publicData } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);

    return publicData.publicUrl;
  };

  const handleSubmit = async () => {
    const imageUrl = await uploadImage();

    const supplier = suppliers.find(
      (s) => s.suppliername === formData.suppliername
    );

    if (!supplier) {
      alert("Supplier not found.");
      return;
    }

    const { error } = await supabase.from("products").insert({
      productname: formData.productname,
      description: formData.description,
      cost: parseFloat(formData.cost),
      reorderpoint: parseInt(formData.reorderpoint),
      currentstock: parseInt(formData.currentstock),
      price: parseFloat(formData.price),
      supplierid: supplier.supplierid,
      image_url: imageUrl,
    });

    if (error) {
      console.error("Insert failed:", error);
      alert("Failed to add product.");
    } else {
        if (user) {
          await supabase.from("activitylog").insert([
            {
              action_type: "add_product",
              action_desc: `added ${formData.productname} to the inventory`,
              done_user: user.userid,
            },
          ]);
        }
      onClose();
    }
  };

  return (
    <div className="modal-overlay">
      <div className="Addmodal-content slide-up">
        
        <div className="modal-header">
          <button className="back-btn" onClick={onClose}>←</button>
          <h2>Product</h2>
          <div className="modal-actions">
            <button className="save-btn">Save Draft</button>
            <button className="create-btn" onClick={handleSubmit}>Create Item</button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">
            <div className="image-upload">
                <label className="upload-box">
                    {imageFile ? (
                    <img
                        src={URL.createObjectURL(imageFile)}
                        alt="Preview"
                        className="preview-image"
                    />
                    ) : (
                    "Click to upload image"
                    )}
                    <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    style={{ display: "none" }}
                    />
                </label>
            </div>


          <div className="product-fields">
            <label>Product title</label>
            <input
              name="productname"
              className="product-name-input"
              placeholder="Product Name"
              value={formData.productname}
              onChange={handleChange}
            />

            <div className="two-cols">
              <input
                name="description"
                placeholder="Description"
                value={formData.description}
                onChange={handleChange}
              />
              <div className="with-label">
                <label>₱</label>
                <input
                  name="cost"
                  placeholder="Cost"
                  value={formData.cost}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="two-cols">
              <div className="with-label">
                <label>Pcs</label>
                <input
                  name="reorderpoint"
                  placeholder="Reorder Point"
                  value={formData.reorderpoint}
                  onChange={handleChange}
                />
              </div>
              <div className="with-label">
                <label>Pcs</label>
                <input
                  name="currentstock"
                  placeholder="Quantity"
                  value={formData.currentstock}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="two-cols">
              <div className="with-icon">
                <span>₱</span>
                <input
                  name="price"
                  placeholder="Price"
                  value={formData.price}
                  onChange={handleChange}
                />
              </div>
              <select
                name="suppliername"
                value={formData.suppliername}
                onChange={handleChange}
              >
                <option value="">Select Supplier</option>
                {suppliers.map((s) => (
                  <option key={s.supplierid} value={s.suppliername}>
                    {s.suppliername}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddProduct;
