import React, { useState, useEffect } from 'react';

const AddSaleModal = ({ isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    productname: '',
    orderid: '',
    quantity: '',
    unitprice: '',
    subtotal: '',
    createdat: new Date().toISOString().split('T')[0] // Today's date as default
  });

  const [errors, setErrors] = useState({});

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        productname: '',
        orderid: '',
        quantity: '',
        unitprice: '',
        subtotal: '',
        createdat: new Date().toISOString().split('T')[0]
      });
      setErrors({});
    }
  }, [isOpen]);

  // Auto-calculate subtotal when quantity or price changes
  useEffect(() => {
    const quantity = parseFloat(formData.quantity) || 0;
    const unitprice = parseFloat(formData.unitprice) || 0;
    const calculatedSubtotal = quantity * unitprice;
    
    if (formData.quantity && formData.unitprice) {
      setFormData(prev => ({
        ...prev,
        subtotal: calculatedSubtotal.toFixed(2)
      }));
    }
  }, [formData.quantity, formData.unitprice]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
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

    if (!formData.productname.trim()) {
      newErrors.productname = 'Product name is required';
    }

    if (!formData.orderid.trim()) {
      newErrors.orderid = 'Order code is required';
    }

    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      newErrors.quantity = 'Quantity must be greater than 0';
    }

    if (!formData.unitprice || parseFloat(formData.unitprice) <= 0) {
      newErrors.unitprice = 'Price must be greater than 0';
    }

    if (!formData.createdat) {
      newErrors.createdat = 'Date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      const saleData = {
  ...formData,
  productname: formData.productname.trim(),
  quantity: parseInt(formData.quantity),
  unitprice: parseFloat(formData.unitprice),
  subtotal: parseFloat(formData.subtotal),
  createdat: new Date(formData.createdat).toISOString()
};

      
      onSave(saleData);
      onClose();
    }
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="add-sale-modal-content">
        <div className="modal-header">
          <h3>Add New Sale</h3>
        </div>
        
        <form onSubmit={handleSubmit} className="add-sale-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="productname">Product Name *</label>
              <input
                type="text"
                id="productname"
                name="productname"
                value={formData.productname}
                onChange={handleInputChange}
                className={`form-input ${errors.productname ? 'error' : ''}`}
                placeholder="Enter product name"
              />
              {errors.productname && <span className="error-message">{errors.productname}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="orderid">Order Code *</label>
              <input
                type="text"
                id="orderid"
                name="orderid"
                value={formData.orderid}
                onChange={handleInputChange}
                className={`form-input ${errors.orderid ? 'error' : ''}`}
                placeholder="Enter order code"
              />
              {errors.orderid && <span className="error-message">{errors.orderid}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="quantity">Quantity *</label>
              <input
                type="number"
                id="quantity"
                name="quantity"
                value={formData.quantity}
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
                value={formData.unitprice}
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
                name="subtotal"
                value={formData.subtotal}
                className="form-input readonly"
                placeholder="Auto-calculated"
                readOnly
              />
            </div>

            <div className="form-group">
              <label htmlFor="createdat">Date *</label>
              <input
                type="date"
                id="createdat"
                name="createdat"
                value={formData.createdat}
                onChange={handleInputChange}
                className={`form-input ${errors.createdat ? 'error' : ''}`}
              />
              {errors.createdat && <span className="error-message">{errors.createdat}</span>}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="save-btn">
              Add Sale
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddSaleModal;