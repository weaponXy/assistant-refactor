import React, { useState, useEffect } from 'react';

const AddSaleModal = ({ isOpen, onClose, onSave, products = [] }) => {
  const [orderData, setOrderData] = useState({
    createdat: new Date().toISOString().split('T')[0]
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
    stockWarning: ''
  }]);

  const [errors, setErrors] = useState({});

  // Generate unique order ID
  const generateOrderId = () => {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ORD-${timestamp.slice(-6)}${random}`;
  };

  // Reset form when modal opens and update product rows with current stock
  useEffect(() => {
    if (isOpen) {
      setOrderData({
        createdat: new Date().toISOString().split('T')[0]
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
                              `INSUFFICIENT STOCK (Available: ${updatedProduct.currentstock})` : '')
              };
            }
          }
          return row;
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
            stockWarning: ''
          }];
        }
        
        return resetRows;
      });
      
      setErrors({});
    }
  }, [isOpen, products]); // Add products as dependency to update when stock changes

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
            stockWarning: ''
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
            stockWarning: ''
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
            stockWarning: selectedProduct && selectedProduct.currentstock === 0 ? 'OUT OF STOCK' : ''
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
      stockWarning: ''
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

  const validateForm = () => {
    const newErrors = {};
    let hasStockIssues = false;

    // Validate order data - no longer need to validate orderid
    if (!orderData.createdat) {
      newErrors.createdat = 'Date is required';
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

  const calculateGrandTotal = () => {
    return productRows.reduce((total, row) => {
      return total + (parseFloat(row.subtotal) || 0);
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      const generatedOrderId = generateOrderId();
      
      const salesData = productRows.map(row => ({
        orderid: generatedOrderId,
        productname: row.productname.trim(),
        quantity: parseInt(row.quantity),
        unitprice: parseFloat(row.unitprice),
        subtotal: parseFloat(row.subtotal),
        createdat: new Date(orderData.createdat).toISOString(),
        isCustomProduct: row.isCustomProduct
      }));

      // Call onSave and wait for it to complete
      await onSave(salesData);
      
      // Close the modal after successful save
      onClose();
    }
  };

  const handleCancel = () => {
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
                    {!row.showCustomInput ? (
                      <select
                        value={row.productname}
                        onChange={(e) => handleProductSelect(row.id, e.target.value)}
                        className={`form-input ${errors[`${row.id}-productname`] ? 'error' : ''}`}
                      >
                        <option value="">Select a product...</option>
                        {products.map((product, idx) => (
                          <option key={idx} value={product.productname}>
                            {product.productname} - ₱{product.price} (Stock: {product.currentstock})
                          </option>
                        ))}
                        <option value="custom">+ Add New Product</option>
                      </select>
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

          <div className="grand-total-section">
            <div className="grand-total">
              <strong>Total Amount: ₱{calculateGrandTotal().toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
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
    </div>
  );
};

export default AddSaleModal;