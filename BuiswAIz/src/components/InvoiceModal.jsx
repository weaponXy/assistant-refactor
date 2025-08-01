import React, { useState } from 'react';
import jsPDF from 'jspdf';

const InvoiceModal = ({ invoice, onClose, onSave }) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editData, setEditData] = useState({
    quantity: invoice.quantity,
    unitprice: invoice.unitprice,
    productname: invoice.products?.productname || ''
  });
  const [errors, setErrors] = useState({});

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleDownloadPDF = (item) => {
    const doc = new jsPDF();
    const date = formatDate(item.createdat);

    doc.setFontSize(16);
    doc.text('Invoice Details', 20, 20);
    doc.setFontSize(12);
    doc.text(`Product: ${item.products?.productname}`, 20, 40);
    doc.text(`Order Code: ${item.orderid}`, 20, 50);
    doc.text(`Quantity: ${item.quantity}`, 20, 60);
    doc.text(`Unit Price: ₱${item.unitprice.toLocaleString()}`, 20, 70);
    doc.text(`Total: ₱${item.subtotal.toLocaleString()}`, 20, 80);
    doc.text(`Date: ${date}`, 20, 90);

    doc.save(`Invoice_${item.orderid}.pdf`);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!editData.productname.trim()) {
      newErrors.productname = 'Product name is required';
    }

    if (!editData.quantity || parseFloat(editData.quantity) <= 0) {
      newErrors.quantity = 'Quantity must be greater than 0';
    }

    if (!editData.unitprice || parseFloat(editData.unitprice) <= 0) {
      newErrors.unitprice = 'Price must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      const updatedInvoice = {
        ...invoice,
        quantity: parseInt(editData.quantity),
        unitprice: parseFloat(editData.unitprice),
        subtotal: parseInt(editData.quantity) * parseFloat(editData.unitprice),
        products: {
          ...invoice.products,
          productname: editData.productname
        }
      };

      if (onSave) {
        await onSave(updatedInvoice);
      }
      
      setIsEditMode(false);
      setErrors({});
    }
  };

  const handleCancel = () => {
    setEditData({
      quantity: invoice.quantity,
      unitprice: invoice.unitprice,
      productname: invoice.products?.productname || ''
    });
    setErrors({});
    setIsEditMode(false);
  };

  const handleEditMode = () => {
    setIsEditMode(true);
  };

  const currentTotal = isEditMode 
    ? (parseInt(editData.quantity) || 0) * (parseFloat(editData.unitprice) || 0)
    : invoice.subtotal;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="invoice-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditMode ? 'Edit Invoice' : 'Invoice Details'}</h3>
          {!isEditMode && (
            <button 
              className="edit-btn"
              onClick={handleEditMode}
            >
              Edit
            </button>
          )}
        </div>
        
        {isEditMode ? (
          <form onSubmit={handleSave} className="invoice-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="productname">Product Name *</label>
                <input
                  type="text"
                  id="productname"
                  name="productname"
                  value={editData.productname}
                  onChange={handleInputChange}
                  className={`form-input ${errors.productname ? 'error' : ''}`}
                  placeholder="Enter product name"
                />
                {errors.productname && <span className="error-message">{errors.productname}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="orderid">Order Code</label>
                <input
                  type="text"
                  id="orderid"
                  value={invoice.orderid}
                  className="form-input readonly"
                  readOnly
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="quantity">Quantity *</label>
                <input
                  type="number"
                  id="quantity"
                  name="quantity"
                  value={editData.quantity}
                  onChange={handleInputChange}
                  className={`form-input ${errors.quantity ? 'error' : ''}`}
                  placeholder="Enter quantity"
                  min="1"
                  step="1"
                />
                {errors.quantity && <span className="error-message">{errors.quantity}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="unitprice">Unit Price *</label>
                <input
                  type="number"
                  id="unitprice"
                  name="unitprice"
                  value={editData.unitprice}
                  onChange={handleInputChange}
                  className={`form-input ${errors.unitprice ? 'error' : ''}`}
                  placeholder="Enter unit price"
                  min="0"
                  step="0.01"
                />
                {errors.unitprice && <span className="error-message">{errors.unitprice}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="subtotal">Total Amount</label>
                <input
                  type="number"
                  id="subtotal"
                  value={currentTotal.toFixed(2)}
                  className="form-input readonly"
                  placeholder="Auto-calculated"
                  readOnly
                />
              </div>

              <div className="form-group">
                <label htmlFor="createdat">Date</label>
                <input
                  type="text"
                  id="createdat"
                  value={formatDate(invoice.createdat)}
                  className="form-input readonly"
                  readOnly
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="cancel-btn" onClick={handleCancel}>
                Cancel
              </button>
              <button type="submit" className="save-btn">
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <div className="invoice-details">
            <br></br>
            <div className="invoice-info-grid">
              <div className="invoice-info-row">
                <div className="invoice-info-item">
                  <strong>Product:</strong>
                  <span>{invoice.products?.productname}</span>
                </div>
                <div className="invoice-info-item">
                  <strong>Order Code:</strong>
                  <span>{invoice.orderid}</span>
                </div>
              </div>

              <div className="invoice-info-row">
                <div className="invoice-info-item">
                  <strong>Quantity:</strong>
                  <span>{invoice.quantity}</span>
                </div>
                <div className="invoice-info-item">
                  <strong>Unit Price:</strong>
                  <span>₱{invoice.unitprice.toLocaleString()}</span>
                </div>
              </div>

              <div className="invoice-info-row">
                <div className="invoice-info-item">
                  <strong>Date:</strong>
                  <span>{formatDate(invoice.createdat)}</span>
                </div>
                <div className="invoice-info-item total-item">
                  <strong>Total:</strong>
                  <span className="total-amount">₱{currentTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="download-pdf-btn" onClick={() => handleDownloadPDF(invoice)}>
                Download PDF
              </button>
              <button className="close-btn" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoiceModal;