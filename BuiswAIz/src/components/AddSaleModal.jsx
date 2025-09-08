import React, { useState, useEffect, useRef } from 'react';

const AddSaleModal = ({ isOpen, onClose, onSave, products = [] }) => {
  const [orderData, setOrderData] = useState({
    createdat: new Date().toISOString().split('T')[0],
    createtime: new Date().toTimeString().slice(0, 5), // HH:MM format
    amountPaid: '', // Add amount paid field
  });

  const [productRows, setProductRows] = useState([{
    id: 1,
    productname: '',
    quantity: '',
    unitprice: '',
    subtotal: '',
    isCustomProduct: false,
    showCustomInput: false,
    availableStock: 0,
    stockWarning: '',
    isDropdownOpen: false
  }]);

  const [errors, setErrors] = useState({});
  const [showConfirmation, setShowConfirmation] = useState(false);
  const dropdownRefs = useRef({});

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      Object.keys(dropdownRefs.current).forEach(rowId => {
        const dropdownRef = dropdownRefs.current[rowId];
        if (dropdownRef && !dropdownRef.contains(event.target)) {
          setProductRows(prev => prev.map(row => 
            row.id === parseInt(rowId) ? { ...row, isDropdownOpen: false } : row
          ));
        }
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Generate unique order ID
  const generateOrderId = () => {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ORD-${timestamp.slice(-6)}${random}`;
  };

  // Reset form when modal opens and update product rows with current stock
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      // Use local timezone for both date and time
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      
      setOrderData({
        createdat: `${year}-${month}-${day}`,
        createtime: `${hours}:${minutes}`,
        amountPaid: '', // Reset amount paid
      });
      
      // Reset product rows and update any existing selections with current stock
      setProductRows(prevRows => {
        const resetRows = prevRows.map(row => {
          if (!row.isCustomProduct && row.productname) {
            // Find the product in the updated products array
            const updatedProduct = products.find(p => p.productname === row.productname);
            if (updatedProduct) {
              return {
                ...row,
                availableStock: updatedProduct.currentstock,
                stockWarning: updatedProduct.currentstock === 0 ? 'OUT OF STOCK' : 
                             (parseFloat(row.quantity) > updatedProduct.currentstock ? 
                              `INSUFFICIENT STOCK (Available: ${updatedProduct.currentstock})` : ''),
                isDropdownOpen: false
              };
            }
          }
          return { ...row, isDropdownOpen: false };
        });
        
        // If this is a fresh open (no existing rows with products), start with clean slate
        const hasProductSelections = resetRows.some(row => row.productname);
        if (!hasProductSelections) {
          return [{
            id: 1,
            productname: '',
            quantity: '',
            unitprice: '',
            subtotal: '',
            isCustomProduct: false,
            showCustomInput: false,
            availableStock: 0,
            stockWarning: '',
            isDropdownOpen: false
          }];
        }
        
        return resetRows;
      });
      
      setErrors({});
      setShowConfirmation(false);
    }
  }, [isOpen, products]);

  // Update stock information when products prop changes
  useEffect(() => {
    if (isOpen && products.length > 0) {
      setProductRows(prevRows => 
        prevRows.map(row => {
          if (!row.isCustomProduct && row.productname) {
            const updatedProduct = products.find(p => p.productname === row.productname);
            if (updatedProduct) {
              const quantity = parseFloat(row.quantity) || 0;
              let stockWarning = '';
              
              if (updatedProduct.currentstock === 0) {
                stockWarning = 'OUT OF STOCK';
              } else if (quantity > updatedProduct.currentstock) {
                stockWarning = `INSUFFICIENT STOCK (Available: ${updatedProduct.currentstock})`;
              }
              
              return {
                ...row,
                availableStock: updatedProduct.currentstock,
                stockWarning: stockWarning
              };
            }
          }
          return row;
        })
      );
    }
  }, [products, isOpen]);

  // Auto-calculate subtotal for each row and check stock
  useEffect(() => {
    const updatedRows = productRows.map(row => {
      const quantity = parseFloat(row.quantity) || 0;
      const unitprice = parseFloat(row.unitprice) || 0;
      const calculatedSubtotal = quantity * unitprice;
      
      let stockWarning = '';
      if (!row.isCustomProduct && row.productname && quantity > 0) {
        if (row.availableStock === 0) {
          stockWarning = 'OUT OF STOCK';
        } else if (quantity > row.availableStock) {
          stockWarning = `INSUFFICIENT STOCK (Available: ${row.availableStock})`;
        }
      }
      
      return {
        ...row,
        subtotal: row.quantity && row.unitprice ? calculatedSubtotal.toFixed(2) : '',
        stockWarning: stockWarning
      };
    });

    // Only update if there's an actual change to avoid infinite loops
    const hasChanged = updatedRows.some((row, index) => 
      row.subtotal !== productRows[index].subtotal || 
      row.stockWarning !== productRows[index].stockWarning
    );

    if (hasChanged) {
      setProductRows(updatedRows);
    }
  }, [productRows]);

  const handleOrderDataChange = (e) => {
    const { name, value } = e.target;
    setOrderData(prev => ({
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

  const handleProductRowChange = (rowId, field, value) => {
    setProductRows(prev => prev.map(row => {
      if (row.id === rowId) {
        return { ...row, [field]: value };
      }
      return row;
    }));

    // Clear error for this field when user starts typing
    const errorKey = `${rowId}-${field}`;
    if (errors[errorKey]) {
      setErrors(prev => ({
        ...prev,
        [errorKey]: ''
      }));
    }
  };

  const toggleDropdown = (rowId) => {
    setProductRows(prev => prev.map(row => ({
      ...row,
      isDropdownOpen: row.id === rowId ? !row.isDropdownOpen : false
    })));
  };

  const handleProductSelect = (rowId, selectedProductName) => {
    if (selectedProductName === 'custom') {
      setProductRows(prev => prev.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            showCustomInput: true,
            isCustomProduct: true,
            productname: '',
            unitprice: '',
            availableStock: 0,
            stockWarning: '',
            isDropdownOpen: false
          };
        }
        return row;
      }));
    } else if (selectedProductName === '') {
      setProductRows(prev => prev.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            showCustomInput: false,
            isCustomProduct: false,
            productname: '',
            unitprice: '',
            availableStock: 0,
            stockWarning: '',
            isDropdownOpen: false
          };
        }
        return row;
      }));
    } else {
      const selectedProduct = products.find(p => p.productname === selectedProductName);
      setProductRows(prev => prev.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            showCustomInput: false,
            isCustomProduct: false,
            productname: selectedProductName,
            unitprice: selectedProduct ? selectedProduct.price.toString() : '',
            availableStock: selectedProduct ? selectedProduct.currentstock : 0,
            stockWarning: selectedProduct && selectedProduct.currentstock === 0 ? 'OUT OF STOCK' : '',
            isDropdownOpen: false
          };
        }
        return row;
      }));
    }

    // Clear product-related errors
    const errorKey = `${rowId}-productname`;
    if (errors[errorKey]) {
      setErrors(prev => ({
        ...prev,
        [errorKey]: ''
      }));
    }
  };

  const addProductRow = () => {
    const newId = Math.max(...productRows.map(row => row.id)) + 1;
    setProductRows(prev => [...prev, {
      id: newId,
      productname: '',
      quantity: '',
      unitprice: '',
      subtotal: '',
      isCustomProduct: false,
      showCustomInput: false,
      availableStock: 0,
      stockWarning: '',
      isDropdownOpen: false
    }]);
  };

  const removeProductRow = (rowId) => {
    if (productRows.length > 1) {
      setProductRows(prev => prev.filter(row => row.id !== rowId));
      // Clear errors for this row
      setErrors(prev => {
        const newErrors = { ...prev };
        Object.keys(newErrors).forEach(key => {
          if (key.startsWith(`${rowId}-`)) {
            delete newErrors[key];
          }
        });
        return newErrors;
      });
    }
  };

  // Function to calculate grand total
  const calculateGrandTotal = () => {
    return productRows.reduce((total, row) => {
      return total + (parseFloat(row.subtotal) || 0);
    }, 0);
  };

  // Function to automatically determine order status
  const getOrderStatus = () => {
    const totalAmount = calculateGrandTotal();
    const amountPaid = parseFloat(orderData.amountPaid) || 0;
    
    return amountPaid >= totalAmount ? 'Complete' : 'Incomplete';
  };

  const validateForm = () => {
    const newErrors = {};
    let hasStockIssues = false;

    // Validate order data
    if (!orderData.createdat) {
      newErrors.createdat = 'Date is required';
    }
    
    if (!orderData.createtime) {
      newErrors.createtime = 'Time is required';
    }

    // Validate amount paid
    if (!orderData.amountPaid || parseFloat(orderData.amountPaid) < 0) {
      newErrors.amountPaid = 'Amount paid must be a positive number';
    }

    // Validate each product row
    productRows.forEach(row => {
      if (!row.showCustomInput && !row.productname) {
        newErrors[`${row.id}-productname`] = 'Please select a product';
      } else if (row.showCustomInput && !row.productname.trim()) {
        newErrors[`${row.id}-productname`] = 'Product name is required';
      }

      if (!row.quantity || parseFloat(row.quantity) <= 0) {
        newErrors[`${row.id}-quantity`] = 'Quantity must be greater than 0';
      }

      if (!row.unitprice || parseFloat(row.unitprice) <= 0) {
        newErrors[`${row.id}-unitprice`] = 'Price must be greater than 0';
      }

      // Check for stock issues
      if (row.stockWarning) {
        hasStockIssues = true;
        newErrors[`${row.id}-stock`] = row.stockWarning;
      }
    });

    setErrors(newErrors);
    
    if (hasStockIssues) {
      alert('Please resolve stock issues before saving the sale.');
    }
    
    return Object.keys(newErrors).length === 0;
  };

  const calculateChange = () => {
    const total = calculateGrandTotal();
    const paid = parseFloat(orderData.amountPaid) || 0;
    return paid - total;
  };

  // Check if we have enough data to show change value
  const hasCompleteData = () => {
    const hasValidProducts = productRows.some(row => 
      row.productname && row.quantity && row.unitprice && row.subtotal
    );
    const hasAmountPaid = orderData.amountPaid && parseFloat(orderData.amountPaid) > 0;
    const totalAmount = calculateGrandTotal();
    
    return hasValidProducts && hasAmountPaid && totalAmount > 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      // Show confirmation dialog instead of directly saving
      setShowConfirmation(true);
    }
  };

  const handleConfirmSave = async () => {
    const generatedOrderId = generateOrderId();
    
    // Combine date and time into a single datetime string using local timezone
    const datetimeString = `${orderData.createdat}T${orderData.createtime}:00`;
    const datetime = new Date(datetimeString).toISOString();
    
    const salesData = productRows.map(row => ({
      orderid: generatedOrderId,
      productname: row.productname.trim(),
      quantity: parseInt(row.quantity),
      unitprice: parseFloat(row.unitprice),
      subtotal: parseFloat(row.subtotal),
      createdat: datetime,
      isCustomProduct: row.isCustomProduct
    }));

    // Automatically determine order status based on amount paid vs total
    const orderStatus = getOrderStatus();

    // Add payment and order status information
    const orderWithPayment = {
      salesData,
      amountPaid: parseFloat(orderData.amountPaid),
      totalAmount: calculateGrandTotal(),
      change: calculateChange(),
      orderStatus: orderStatus // Automatically determined status
    };

    // Call onSave and wait for it to complete
    await onSave(orderWithPayment);
    
    // Close the modal after successful save
    setShowConfirmation(false);
    onClose();
  };

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
  };

  const handleCancel = () => {
    setShowConfirmation(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="add-sale-modal-content multiple-products">
        <div className="modal-header">
          <h3>Add New Sale</h3>
        </div>
        
        <form onSubmit={handleSubmit} className="add-sale-form">
          {/* Order Information */}
          <div className="order-info-section">
            <h4>Order Information</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Order Code</label>
                <input
                  type="text"
                  className="form-input readonly"
                  value="Auto-generated"
                  placeholder="Will be generated automatically"
                  readOnly
                />
                <small className="help-text">Order ID will be automatically generated when you save</small>
              </div>

              <div className="form-group">
                <label htmlFor="createdat">Date *</label>
                <input
                  type="date"
                  id="createdat"
                  name="createdat"
                  value={orderData.createdat}
                  onChange={handleOrderDataChange}
                  className={`form-input ${errors.createdat ? 'error' : ''}`}
                />
                {errors.createdat && <span className="error-message">{errors.createdat}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="createtime">Time *</label>
                <input
                  type="time"
                  id="createtime"
                  name="createtime"
                  value={orderData.createtime}
                  onChange={handleOrderDataChange}
                  className={`form-input ${errors.createtime ? 'error' : ''}`}
                />
                {errors.createtime && <span className="error-message">{errors.createtime}</span>}
              </div>
            </div>

            {/* Show current order status based on payment */}
          </div>

          {/* Products Section */}
          <div className="products-section">
            <div className="products-header">
              <h4>Products</h4>
              <button 
                type="button" 
                className="add-product-btn"
                onClick={addProductRow}
              >
                + Add Product
              </button>
            </div>

            {productRows.map((row, index) => (
              <div key={row.id} className="product-row">
                <div className="product-row-header">
                  <span className="product-number">Product {index + 1}</span>
                  {productRows.length > 1 && (
                    <button
                      type="button"
                      className="remove-product-btn"
                      onClick={() => removeProductRow(row.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Product *</label>
                    {!row.showCustomInput ? (
                      <div className="modal-custom-dropdown-wrapper" ref={el => dropdownRefs.current[row.id] = el}>
                        <div 
                          className={`modal-custom-dropdown-button ${errors[`${row.id}-productname`] ? 'error' : ''}`}
                          onClick={() => toggleDropdown(row.id)}
                        >
                          <div className="dropdown-button-content">
                            <span className="dropdown-text">
                              {row.productname || 'Select a product...'}
                            </span>
                            <span className={`dropdown-arrow ${row.isDropdownOpen ? 'open' : ''}`}>▼</span>
                          </div>
                        </div>
                        
                        {row.isDropdownOpen && (
                          <div className="modal-custom-dropdown-list">
                            <div
                              className="dropdown-item"
                              onClick={() => handleProductSelect(row.id, '')}
                            >
                              <span className="item-text">Select a product...</span>
                            </div>
                            {products.map((product, idx) => (
                              <div
                                key={idx}
                                className={`dropdown-item ${row.productname === product.productname ? 'selected' : ''}`}
                                onClick={() => handleProductSelect(row.id, product.productname)}
                              >
                                <span className="item-text">
                                  {product.productname} - ₱{product.price} (Stock: {product.currentstock})
                                </span>
                              </div>
                            ))}
                            <div
                              className="dropdown-item"
                              onClick={() => handleProductSelect(row.id, 'custom')}
                            >
                              <span className="item-text">+ Add New Product</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="custom-product-input">
                        <input
                          type="text"
                          value={row.productname}
                          onChange={(e) => handleProductRowChange(row.id, 'productname', e.target.value)}
                          className={`form-input ${errors[`${row.id}-productname`] ? 'error' : ''}`}
                          placeholder="Enter new product name"
                        />
                        <button 
                          type="button" 
                          className="back-to-select-btn"
                          onClick={() => {
                            setProductRows(prev => prev.map(r => 
                              r.id === row.id 
                                ? { ...r, showCustomInput: false, isCustomProduct: false, productname: '', unitprice: '', availableStock: 0, stockWarning: '' }
                                : r
                            ));
                          }}
                        >
                          Back
                        </button>
                      </div>
                    )}
                    {errors[`${row.id}-productname`] && (
                      <span className="error-message">{errors[`${row.id}-productname`]}</span>
                    )}
                    {!row.isCustomProduct && row.availableStock > 0 && (
                      <div className="stock-info">
                        <span className="stock-available">Available Stock: {row.availableStock}</span>
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Quantity *</label>
                    <input
                      type="number"
                      value={row.quantity}
                      onChange={(e) => handleProductRowChange(row.id, 'quantity', e.target.value)}
                      className={`form-input ${errors[`${row.id}-quantity`] ? 'error' : ''} ${row.stockWarning ? 'stock-warning' : ''}`}
                      placeholder="Qty"
                      min="1"
                      step="1"
                    />
                    {errors[`${row.id}-quantity`] && (
                      <span className="error-message">{errors[`${row.id}-quantity`]}</span>
                    )}
                    {row.stockWarning && (
                      <span className="stock-warning-message">{row.stockWarning}</span>
                    )}
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Unit Price *</label>
                    <input
                      type="number"
                      value={row.unitprice}
                      onChange={(e) => handleProductRowChange(row.id, 'unitprice', e.target.value)}
                      className={`form-input ${errors[`${row.id}-unitprice`] ? 'error' : ''} ${
                        !row.showCustomInput && row.productname && !row.isCustomProduct ? 'readonly' : ''
                      }`}
                      placeholder={!row.showCustomInput && row.productname && !row.isCustomProduct 
                        ? "Price from selected product" 
                        : "Enter unit price"
                      }
                      min="0"
                      step="0.01"
                      readOnly={!row.showCustomInput && row.productname && !row.isCustomProduct}
                    />
                    {errors[`${row.id}-unitprice`] && (
                      <span className="error-message">{errors[`${row.id}-unitprice`]}</span>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Subtotal</label>
                    <input
                      type="number"
                      value={row.subtotal}
                      className="form-input readonly"
                      placeholder="Auto-calculated"
                      readOnly
                    />
                  </div>
                </div>

                {index < productRows.length - 1 && <hr className="product-separator" />}
              </div>
            ))}
          </div>

          {/* Payment Section */}
          <div className="payment-section">
            <h4>Payment Information</h4>
            <div className="payment-row">
              <div className="form-group">
                <label htmlFor="amountPaid">Amount Paid *</label>
                <input
                  type="number"
                  id="amountPaid"
                  name="amountPaid"
                  value={orderData.amountPaid}
                  onChange={handleOrderDataChange}
                  className={`form-input ${errors.amountPaid ? 'error' : ''}`}
                  placeholder="Enter amount paid"
                  min="0"
                  step="0.01"
                />
                {errors.amountPaid && <span className="error-message">{errors.amountPaid}</span>}
                <small className="help-text">
                  Amount paid determines order status automatically
                </small>
              </div>
            </div>
          </div>

          <div className="payment-summary-section">
            <div className="payment-summary">
              <div className="summary-row total-row">
                <span className="summary-label">Total Amount:</span>
                <span className="summary-value total-amount">₱{calculateGrandTotal().toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <div className="summary-row change-row">
                <span className="summary-label">Change:</span>
                <span className="summary-value change-amount">
                  {hasCompleteData() ? 
                    `₱${calculateChange().toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : 
                    ''}
                </span>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="save-btn">
              Save All Products
            </button>
          </div>
        </form>

        {/* Confirmation Dialog */}
        {showConfirmation && (
          <div className="confirmation-overlay">
            <div className="confirmation-dialog">
              <div className="confirmation-header">
                <h4>Confirm Save</h4>
              </div>
              <div className="confirmation-body">
                <p>Are you sure you want to save all products?</p>
                <p><strong>Order Status:</strong> {getOrderStatus()}</p>
                {getOrderStatus() === 'Incomplete' && (
                  <p style={{color: '#dc3545', fontSize: '14px', marginTop: '10px'}}>
                    This order will be marked as incomplete because the amount paid is less than the total amount.
                  </p>
                )}
                {getOrderStatus() === 'Complete' && (
                  <p style={{color: '#28a745', fontSize: '14px', marginTop: '10px'}}>
                    This order will be marked as complete because the amount paid meets or exceeds the total amount.
                  </p>
                )}
              </div>
              <div className="confirmation-footer">
                <button 
                  type="button" 
                  className="confirmation-no-btn" 
                  onClick={handleCancelConfirmation}
                >
                  No
                </button>
                <button 
                  type="button" 
                  className="confirmation-yes-btn" 
                  onClick={handleConfirmSave}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddSaleModal;