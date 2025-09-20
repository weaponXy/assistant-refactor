import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

const AddSaleModal = ({ isOpen, onClose, onSave, products = [] }) => {
  const [orderData, setOrderData] = useState({
    orderdate: '',
    ordertime: '',
    amountPaid: '',
  });

  const [productRows, setProductRows] = useState([{
    id: 1,
    productname: '',
    quantity: '',
    unitprice: '',
    subtotal: '',
    availableStock: 0,
    stockWarning: '',
    isDropdownOpen: false,
    productcategoryid: null,
    color: '',
    agesize: '',
    selectedVariant: null // Track the selected product variant
  }]);

  const [errors, setErrors] = useState({});
  const [showConfirmation, setShowConfirmation] = useState(false);
  const dropdownRefs = useRef({});

  // Group products by name to show variants
  const productGroups = useMemo(() => {
    const groups = {};
    products.forEach(product => {
      const productName = product.productname;
      if (!groups[productName]) {
        groups[productName] = [];
      }
      groups[productName].push(product);
    });
    return groups;
  }, [products]);

  // Close dropdown when clicking outside - optimized
  useEffect(() => {
    const handleClickOutside = (event) => {
      Object.entries(dropdownRefs.current).forEach(([rowId, dropdownRef]) => {
        if (dropdownRef && !dropdownRef.contains(event.target)) {
          setProductRows(prev => prev.map(row => 
            row.id === parseInt(rowId, 10) ? { ...row, isDropdownOpen: false } : row
          ));
        }
      });
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Initialize form data when modal opens - now with current time
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      
      setOrderData({
        orderdate: `${year}-${month}-${day}`,
        ordertime: `${hours}:${minutes}`,
        amountPaid: '',
      });
      
      setProductRows([{
        id: 1,
        productname: '',
        quantity: '',
        unitprice: '',
        subtotal: '',
        availableStock: 0,
        stockWarning: '',
        isDropdownOpen: false,
        productcategoryid: null,
        color: '',
        agesize: '',
        selectedVariant: null
      }]);
      
      setErrors({});
      setShowConfirmation(false);
    }
  }, [isOpen]);

  // Update stock information when products change - optimized
  useEffect(() => {
    if (isOpen && products.length > 0) {
      setProductRows(prevRows => 
        prevRows.map(row => {
          if (row.selectedVariant) {
            const updatedProduct = products.find(p => p.productcategoryid === row.selectedVariant.productcategoryid);
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
                stockWarning: stockWarning,
                selectedVariant: updatedProduct
              };
            }
          }
          return row;
        })
      );
    }
  }, [products, isOpen]);

  // Memoize subtotal and stock warning calculations
  const calculatedRows = useMemo(() => {
    return productRows.map(row => {
      const quantity = parseFloat(row.quantity) || 0;
      const unitprice = parseFloat(row.unitprice) || 0;
      const calculatedSubtotal = quantity * unitprice;
      
      let stockWarning = '';
      if (row.selectedVariant && quantity > 0) {
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
  }, [productRows]);

  // Update productRows only when calculated values actually change
  useEffect(() => {
    const hasChanged = calculatedRows.some((row, index) => 
      row.subtotal !== productRows[index].subtotal || 
      row.stockWarning !== productRows[index].stockWarning
    );

    if (hasChanged) {
      setProductRows(calculatedRows);
    }
  }, [calculatedRows, productRows]);

  // Memoize grand total calculation
  const grandTotal = useMemo(() => {
    return productRows.reduce((total, row) => {
      return total + (parseFloat(row.subtotal) || 0);
    }, 0);
  }, [productRows]);

  // Memoize order status calculation
  const orderStatus = useMemo(() => {
    const totalAmount = grandTotal;
    const amountPaid = parseFloat(orderData.amountPaid) || 0;
    return amountPaid >= totalAmount ? 'Complete' : 'Incomplete';
  }, [grandTotal, orderData.amountPaid]);

  // Memoize change calculation
  const change = useMemo(() => {
    const paid = parseFloat(orderData.amountPaid) || 0;
    return paid - grandTotal;
  }, [grandTotal, orderData.amountPaid]);

  // Generate proper order ID
  const generateOrderId = useCallback(() => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `ORD-${year}${month}${day}-${hours}${minutes}${seconds}`;
  }, []);

  // Order data change handler with time validation
  const handleOrderDataChange = useCallback((e) => {
    const { name, value } = e.target;
    
    setOrderData(prev => ({
      ...prev,
      [name]: value
    }));

    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  }, [errors]);

  const handleProductRowChange = useCallback((rowId, field, value) => {
    setProductRows(prev => prev.map(row => {
      if (row.id === rowId) {
        return { ...row, [field]: value };
      }
      return row;
    }));

    const errorKey = `${rowId}-${field}`;
    if (errors[errorKey]) {
      setErrors(prev => ({
        ...prev,
        [errorKey]: ''
      }));
    }
  }, [errors]);

  const toggleDropdown = useCallback((rowId) => {
    setProductRows(prev => prev.map(row => ({
      ...row,
      isDropdownOpen: row.id === rowId ? !row.isDropdownOpen : false
    })));
  }, []);

  const handleProductSelect = useCallback((rowId, selectedProduct) => {
    if (selectedProduct === '') {
      setProductRows(prev => prev.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            productname: '',
            unitprice: '',
            availableStock: 0,
            stockWarning: '',
            isDropdownOpen: false,
            productcategoryid: null,
            color: '',
            agesize: '',
            selectedVariant: null
          };
        }
        return row;
      }));
    } else {
      // selectedProduct is now a product variant object
      setProductRows(prev => prev.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            productname: selectedProduct.productname,
            unitprice: selectedProduct.price.toString(),
            availableStock: selectedProduct.currentstock,
            stockWarning: selectedProduct.currentstock === 0 ? 'OUT OF STOCK' : '',
            isDropdownOpen: false,
            productcategoryid: selectedProduct.productcategoryid,
            color: selectedProduct.color,
            agesize: selectedProduct.agesize,
            selectedVariant: selectedProduct
          };
        }
        return row;
      }));
    }

    const errorKey = `${rowId}-productname`;
    if (errors[errorKey]) {
      setErrors(prev => ({
        ...prev,
        [errorKey]: ''
      }));
    }
  }, [errors]);

  const addProductRow = useCallback(() => {
    const newId = Math.max(...productRows.map(row => row.id)) + 1;
    setProductRows(prev => [...prev, {
      id: newId,
      productname: '',
      quantity: '',
      unitprice: '',
      subtotal: '',
      availableStock: 0,
      stockWarning: '',
      isDropdownOpen: false,
      productcategoryid: null,
      color: '',
      agesize: '',
      selectedVariant: null
    }]);
  }, [productRows]);

  const removeProductRow = useCallback((rowId) => {
    if (productRows.length > 1) {
      setProductRows(prev => prev.filter(row => row.id !== rowId));
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
  }, [productRows.length]);

  // Check if we have complete data for change calculation
  const hasCompleteData = useMemo(() => {
    const hasValidProducts = productRows.some(row => 
      row.productname && row.quantity && row.unitprice && row.subtotal
    );
    const hasAmountPaid = orderData.amountPaid && parseFloat(orderData.amountPaid) > 0;
    return hasValidProducts && hasAmountPaid && grandTotal > 0;
  }, [productRows, orderData.amountPaid, grandTotal]);

  // Validation with time validation
  const validateForm = useCallback(() => {
    const newErrors = {};
    let hasStockIssues = false;

    if (!orderData.orderdate) {
      newErrors.orderdate = 'Date is required';
    }

    if (!orderData.ordertime) {
      newErrors.ordertime = 'Time is required';
    } else {
      // Validate time format (HH:MM)
      const timePattern = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timePattern.test(orderData.ordertime)) {
        newErrors.ordertime = 'Please enter a valid time in HH:MM format';
      }
    }

    if (!orderData.amountPaid || parseFloat(orderData.amountPaid) < 0) {
      newErrors.amountPaid = 'Amount paid must be a positive number';
    }

    productRows.forEach(row => {
      if (!row.productname) {
        newErrors[`${row.id}-productname`] = 'Please select a product';
      }

      if (!row.quantity || parseFloat(row.quantity) <= 0) {
        newErrors[`${row.id}-quantity`] = 'Quantity must be greater than 0';
      }

      if (!row.unitprice || parseFloat(row.unitprice) <= 0) {
        newErrors[`${row.id}-unitprice`] = 'Price must be greater than 0';
      }

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
  }, [orderData, productRows]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    
    if (validateForm()) {
      setShowConfirmation(true);
    }
  }, [validateForm]);

  const handleConfirmSave = useCallback(async () => {
    try {
      // Generate proper order ID
      const generatedOrderId = generateOrderId();
      
      // Create datetime using the selected date and time without timezone conversion
      // Format datetime string directly to avoid timezone issues
      const datetime = `${orderData.orderdate} ${orderData.ordertime}:00`;
      
      const salesData = productRows.map(row => ({
        orderid: generatedOrderId,
        productname: row.productname.trim(),
        quantity: parseInt(row.quantity, 10),
        unitprice: parseFloat(row.unitprice),
        subtotal: parseFloat(row.subtotal),
        createdat: datetime, // Keep createdat for orderitems table
        productcategoryid: row.productcategoryid,
        color: row.color,
        agesize: row.agesize
      }));

      const orderWithPayment = {
        orderId: generatedOrderId, // Pass the order ID
        salesData,
        amountPaid: parseFloat(orderData.amountPaid),
        totalAmount: grandTotal,
        change: change,
        orderStatus: orderStatus,
        orderDateTime: datetime // Pass the exact datetime for orderdate column
      };

      await onSave(orderWithPayment);
      
      // Simply close the modal after successful save
      setShowConfirmation(false);
      onClose();
    } catch (error) {
      console.error('Error saving transaction:', error);
      alert('Error occurred while saving the transaction. Please try again.');
    }
  }, [orderData, productRows, grandTotal, change, orderStatus, onSave, generateOrderId, onClose]);

  const handleCancelConfirmation = useCallback(() => {
    setShowConfirmation(false);
  }, []);

  const handleCancel = useCallback(() => {
    setShowConfirmation(false);
    onClose();
  }, [onClose]);

  const getVariantDisplay = useCallback((product) => {
    const variants = [];
    if (product.color && product.color.trim()) {
      variants.push(`C: ${product.color}`);
    }
    if (product.agesize && product.agesize.trim()) {
      variants.push(`S: ${product.agesize}`);
    }
    return variants.length > 0 ? ` (${variants.join(', ')})` : '';
  }, []);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="add-sale-modal-content multiple-products">
        <div className="add-sale-modal-inner">
          <div className="modal-header">
            <h3>Add New Sale</h3>
          </div>
          
          <form onSubmit={handleSubmit} className="add-sale-form">
            {/* Order Information - Added time field */}
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
                  <label htmlFor="orderdate">Date *</label>
                  <input
                    type="date"
                    id="orderdate"
                    name="orderdate"
                    value={orderData.orderdate}
                    onChange={handleOrderDataChange}
                    className={`form-input ${errors.orderdate ? 'error' : ''}`}
                  />
                  {errors.orderdate && <span className="error-message">{errors.orderdate}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="ordertime">Time *</label>
                  <input
                    type="time"
                    id="ordertime"
                    name="ordertime"
                    value={orderData.ordertime}
                    onChange={handleOrderDataChange}
                    className={`form-input ${errors.ordertime ? 'error' : ''}`}
                  />
                  {errors.ordertime && <span className="error-message">{errors.ordertime}</span>}
                </div>
              </div>
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
                      <div className="modal-custom-dropdown-wrapper" ref={el => dropdownRefs.current[row.id] = el}>
                        <div 
                          className={`modal-custom-dropdown-button ${errors[`${row.id}-productname`] ? 'error' : ''}`}
                          onClick={() => toggleDropdown(row.id)}
                        >
                          <div className="dropdown-button-content">
                            <span className="dropdown-text">
                              {row.selectedVariant 
                                ? `${row.productname}${getVariantDisplay(row.selectedVariant)}` 
                                : 'Select a product...'}
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
                            {Object.entries(productGroups).map(([productName, variants]) => (
                              <div key={productName}>
                                <div className="dropdown-group-header">
                                  <strong>{productName}</strong>
                                </div>
                                {variants.map((variant, idx) => (
                                  <div
                                    key={`${productName}-${idx}`}
                                    className={`dropdown-item ${row.selectedVariant?.productcategoryid === variant.productcategoryid ? 'selected' : ''}`}
                                    onClick={() => handleProductSelect(row.id, variant)}
                                  >
                                    <span className="item-text">
                                      {getVariantDisplay(variant)} - ₱{variant.price} (Stock: {variant.currentstock})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {errors[`${row.id}-productname`] && (
                        <span className="error-message">{errors[`${row.id}-productname`]}</span>
                      )}
                      {row.availableStock > 0 && (
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
                          row.selectedVariant ? 'readonly' : ''
                        }`}
                        placeholder={row.selectedVariant 
                          ? "Price from selected product" 
                          : "Enter unit price"
                        }
                        min="0"
                        step="0.01"
                        readOnly={row.selectedVariant}
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
                  <span className="summary-value total-amount">₱{grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="summary-row change-row">
                  <span className="summary-label">Change:</span>
                  <span className="summary-value change-amount">
                    {hasCompleteData ? 
                      `₱${change.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : 
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
        </div>

        {/* Confirmation Dialog */}
        {showConfirmation && (
          <div className="confirmation-overlay">
            <div className="confirmation-dialog">
              <div className="confirmation-header">
                <h4>Confirm Save</h4>
              </div>
              <div className="confirmation-body">
                <p>Are you sure you want to save all products?</p>
                <p><strong>Order Status:</strong> {orderStatus}</p>
                {orderStatus === 'Incomplete' && (
                  <p style={{color: '#dc3545', fontSize: '14px', marginTop: '10px'}}>
                    This order will be marked as incomplete because the amount paid is less than the total amount.
                  </p>
                )}
                {orderStatus === 'Complete' && (
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