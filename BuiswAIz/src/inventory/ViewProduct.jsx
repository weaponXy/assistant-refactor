import React, { useState, useEffect, useRef } from "react";
import "../stylecss/ViewProduct.css";
import { supabase } from "../supabase";
import imageCompression from "browser-image-compression";
import ConfirmDeleteModal from "./ConfirmationModals/ConfirmationDelete";

const ViewProduct = ({ product, onClose, onProductUpdated, user}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ ...product });
  const [suppliers, setSuppliers] = useState([]);
  const [newImageFile, setNewImageFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef(null);
  const [deleteError, setDeleteError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState("");


  useEffect(() => {
    const fetchSuppliers = async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("supplierid, suppliername");
      if (error) {
        console.error("Error fetching suppliers:", error);
      } else {
        setSuppliers(data);
      }
    };

    fetchSuppliers();
  }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleImageClick = () => {
        if (isEditing) {
        fileInputRef.current.click();
        }
    };

    const handleImageChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const options = {
            maxSizeMB: 0.1,
            maxWidthOrHeight: 500,
            useWebWorker: true,
        };

        try {
            const compressedFile = await imageCompression(file, options);
            compressedFile.name = file.name; // retain original file name
            setNewImageFile(compressedFile);

            const previewUrl = URL.createObjectURL(compressedFile);
            setForm((prev) => ({ ...prev, image_url: previewUrl }));
        } catch (err) {
            console.error("Image compression failed:", err);
        }
    };

    const handleUpdate = () => {
        setIsEditing(true);
    };

    

    const handleSave = async () => {
        const validateForm = () => {
            const requiredFields = [
                "productname",
                "description",
                "reorderpoint",
                "currentstock",
                "price",
                "cost",
                "supplierid",
            ];

            // Check if any field is empty or invalid
            const isEmpty = requiredFields.some((field) => {
                const value = form[field];
                if (value === undefined || value === null) return true;
                if (typeof value === "string" && value.trim() === "") return true;
                if (
                    ["reorderpoint", "currentstock", "price", "cost"].includes(field) &&
                    Number(value) <= 0
                )
                    return true;
                return false;
            });

            if (isEmpty) {
                setFormError("Please fill in all required fields.");
                setIsSaving(false);
                return false;
            }

            return true;
        };

        if (!validateForm()) return;

        setIsSaving(true);
        try {
            let imageUrl = form.image_url;
            let activityDesc = "";
        if (user) {
            const nameChanged = form.productname !== product.productname;
            const restocked =
                Number(form.currentstock) !== Number(product.currentstock) &&
                form.productname === product.productname &&
                form.description === product.description &&
                Number(form.reorderpoint) === Number(product.reorderpoint) &&
                Number(form.price) === Number(product.price) &&
                Number(form.cost) === Number(product.cost) &&
                form.supplierid === product.supplierid &&
                form.image_url === product.image_url;

            if (restocked) {
                const stockdiff = Number(form.currentstock) - Number(product.currentstock);
                activityDesc = `${form.productname} was restocked with ${stockdiff} piece${stockdiff > 1 ? "s": ""}`;
            } else if (nameChanged) {
                activityDesc = `changed ${product.productname} to ${form.productname}`;
            } else {
                activityDesc = `updated ${form.productname}`;
            }
        }


        if (newImageFile) {
            if (product.image_url) {
            const oldPath = product.image_url.split("/").pop();
            await supabase.storage.from("product-images").remove([oldPath]);
            }

            const filename = `${Date.now()}_${newImageFile.name}`;
            const { error: uploadError } = await supabase
            .storage
            .from("product-images")
            .upload(filename, newImageFile);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase
            .storage
            .from("product-images")
            .getPublicUrl(filename);

            imageUrl = urlData.publicUrl;
        }

        const { error:updateError } = await supabase
            .from("products")
            .update({
            productname: form.productname,
            description: form.description,
            reorderpoint: Number(form.reorderpoint),
            currentstock: Number(form.currentstock),
            price: Number(form.price),
            cost: Number(form.cost),
            supplierid: form.supplierid,
            image_url: imageUrl,
            })
            .eq("productid", product.productid);

        if (updateError) throw updateError;

        if (user && activityDesc) {
            const { error: logError } = await supabase.from("activitylog").insert([
                {
                action_type: "update_product",
                action_desc: activityDesc,
                done_user: user.userid,
                },
            ]);

            if (logError) {
                console.error("Failed to insert activity log:", logError.message);
            } else {
                console.log("Activity log inserted successfully:", activityDesc);
            }
        }

        setIsEditing(false);
        setIsSaving(false); 
        setNewImageFile(null);

        if (onProductUpdated) onProductUpdated(); 

        console.log("Product updated.");
        } catch (err) {
        console.error("Error saving product:", err.message);
        }
    };

    const handleDelete = async () => {
        try {
            // Check if product is still referenced somewhere
            const { data: salesData, error: salesError } = await supabase
                .from("orderitems")
                .select("orderitemid")
                .eq("productid", product.productid)
                .limit(1);

            const { data: defectData, error: defectError } = await supabase
                .from("defectiveitems")
                .select("defectiveitemid")
                .eq("productid", product.productid)
                .limit(1);

            const { data: restockData, error: restockError } = await supabase
                .from("restockstorage")
                .select("restockid")
                .eq("productid", product.productid)
                .limit(1);

            // If any reference found, stop before deletion
            if (
                salesError ||
                defectError ||
                restockError ||
                (salesData?.length > 0 ||
                    defectData?.length > 0 ||
                    restockData?.length > 0)
            ) {
                setDeleteError("This product cannot be deleted since it is used in transactions");
                return; 
            }

            // Proceed with delete
            const { error } = await supabase
                .from("products")
                .delete()
                .eq("productid", product.productid);

            if (error) throw error;

            // Remove image if exists
            if (product.image_url) {
                const filename = product.image_url.split("/").pop();
                await supabase.storage.from("product-images").remove([filename]);
            }

            // Log activity
            if (user) {
                await supabase.from("activitylog").insert([
                    {
                    action_type: "Delete Product",
                    action_desc: `deleted ${product.productname} from the inventory`,
                    done_user: user.userid,
                    },
                ]);
            }

            if (onProductUpdated) onProductUpdated();
            onClose();
        } catch (err) {
            console.error("Error deleting product:", err.message);
            setDeleteError("Something went wrong while deleting the product.");
        }
    };



    return (
        <div className="view-product-overlay">
        <div className="view-product-modal">
            <div className="modal-header">
            <button onClick={onClose} className="back-button">←</button>
            <h2>Product</h2>
            <span className="product-id-tag">#{product.productid}</span>
            <div className="header-actions">
                <button className="delete-button" onClick={() => setShowConfirm(true)}>🗑 Delete</button>
                <button className="update-button" onClick={handleUpdate} disabled={isEditing}>Update Item</button>
            </div>
            </div>

            <div className="modal-body">
            <div className="image-section">
                {form.image_url ? (
                <img src={form.image_url} alt="Product" className="product-image" />
                ) : (
                <div className="img-placeholder" />
                )}
                <button className="update-image-button" onClick={handleImageClick} disabled={!isEditing}>
                Update Image
                </button>
                <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleImageChange}
                />
            </div>

            <div className="info-section">
                <label>Product title</label>
                <input
                type="text"
                name="productname"
                value={form.productname}
                onChange={handleChange}
                disabled={!isEditing}
                />

                <div className="input-row">
                <input
                    type="text"
                    name="description"
                    placeholder="Description"
                    value={form.description}
                    onChange={handleChange}
                    disabled={!isEditing}
                />
                <input
                    type="number"
                    name="reorderpoint"
                    placeholder="Reorderpoint"
                    value={form.reorderpoint}
                    onChange={handleChange}
                    disabled={!isEditing}
                />
                </div>

                <div className="input-row">
                <div className="with-label">
                    <label>Pcs.</label>
                    <input
                    type="number"
                    name="currentstock"
                    placeholder="Stock"
                    value={form.currentstock}
                    onChange={handleChange}
                    disabled={!isEditing}
                    />
                </div>

                <div className="with-label">
                    <label>₱</label>
                    <input
                    type="number"
                    name="price"
                    onChange={handleChange}
                    value={form.price}
                    disabled={!isEditing}
                    />
                </div>
                </div>

                <div className="input-row">
                <div className="with-label">
                    <label>₱</label>
                    <input
                    type="number"
                    name="cost"
                    placeholder="Cost"
                    value={form.cost}
                    onChange={handleChange}
                    disabled={!isEditing}
                    />
                </div>

                <div className="with-label">
                    <label>Supplier</label>
                    <select
                    name="supplierid"
                    value={form.supplierid}
                    onChange={handleChange}
                    disabled={!isEditing}
                    className="supplier-select"
                    >
                    <option value="">-- Select Supplier --</option>
                    {suppliers.map((supplier) => (
                        <option key={supplier.supplierid} value={supplier.supplierid}>
                        {supplier.suppliername}
                        </option>
                    ))}
                    </select>
                </div>
                </div>
            </div>
            </div>

            {isEditing && (
            <div className="modal-footer">
                <button className="save-button" onClick={handleSave}>{isSaving ? "Saving..." : "Save"}</button>
            </div>
            )}

            {deleteError && (
            <div className="delete-warning">
                {deleteError}
            </div>
            )}

            {formError && (
            <div className="form-warning">
                {formError}
            </div>
            )}

            <ConfirmDeleteModal
                isOpen={showConfirm}
                onConfirm={async () => {
                    await handleDelete(); 
                    setShowConfirm(false); 
                }}
                onCancel={() => setShowConfirm(false)}
                productName={product.productname}
            />

        </div>
        </div>
    );
};

export default ViewProduct;
