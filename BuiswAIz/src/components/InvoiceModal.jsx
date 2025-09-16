import React, { useState, useEffect, useCallback, useMemo } from 'react';
import jsPDF from 'jspdf';

const InvoiceModal = ({ invoice, onClose, onUpdateOrder }) => {
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [updateData, setUpdateData] = useState({
    amountPaid: '',
    change: ''
  });
  const [errors, setErrors] = useState({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Memoize calculations to prevent unnecessary recalculations
  const calculatedTotal = useMemo(() => {
    if (invoice.orderItems && invoice.orderItems.length > 0) {
      return invoice.totalOrderAmount || invoice.orderItems.reduce((sum, item) => sum + item.subtotal, 0);
    }
    return invoice.subtotal;
  }, [invoice.orderItems, invoice.totalOrderAmount, invoice.subtotal]);

  // Memoize amount paid calculation
  const amountPaid = useMemo(() => {
    if (invoice.orders?.amount_paid !== undefined && invoice.orders?.amount_paid !== null) {
      return invoice.orders.amount_paid;
    }
    if (invoice.amount_paid !== undefined && invoice.amount_paid !== null) {
      return invoice.amount_paid;
    }
    if (invoice.orderItems?.length > 0 && invoice.orderItems[0]?.orders?.amount_paid !== undefined) {
      return invoice.orderItems[0].orders.amount_paid;
    }
    return null;
  }, [invoice.orders, invoice.amount_paid, invoice.orderItems]);

  // Memoize change calculation
  const change = useMemo(() => {
    if (amountPaid === null || amountPaid === undefined) {
      return 0;
    }

    if (invoice.orders?.change !== undefined && invoice.orders?.change !== null) {
      return invoice.orders.change;
    }
    if (invoice.change !== undefined && invoice.change !== null) {
      return invoice.change;
    }
    if (invoice.orderItems?.length > 0 && invoice.orderItems[0]?.orders?.change !== undefined) {
      return invoice.orderItems[0].orders.change;
    }

    return amountPaid - calculatedTotal;
  }, [amountPaid, invoice.orders, invoice.change, invoice.orderItems, calculatedTotal]);

  // Memoize order status calculation
  const orderStatus = useMemo(() => {
    let status = '';
    
    if (invoice.orders?.orderstatus) {
      status = invoice.orders.orderstatus;
    } else if (invoice.orderstatus) {
      status = invoice.orderstatus;
    } else if (invoice.orderItems?.length > 0 && invoice.orderItems[0]?.orders?.orderstatus) {
      status = invoice.orderItems[0].orders.orderstatus;
    }

    const normalizedStatus = status.toUpperCase();
    if (normalizedStatus === 'COMPLETE' || normalizedStatus === 'INCOMPLETE') {
      return normalizedStatus;
    }
    
    return 'INCOMPLETE';
  }, [invoice.orders, invoice.orderstatus, invoice.orderItems]);

  // Memoize incomplete order check
  const isIncompleteOrder = useMemo(() => {
    return orderStatus === 'INCOMPLETE';
  }, [orderStatus]);

  // Initialize update form with current payment data
  useEffect(() => {
    if (showUpdateForm && invoice) {
      const currentAmountPaid = amountPaid || 0;
      setUpdateData({
        amountPaid: currentAmountPaid.toString(),
        change: ''
      });
      setErrors({});
    }
  }, [showUpdateForm, invoice, amountPaid]);

  // Auto-calculate change when amount paid changes with debouncing
  useEffect(() => {
    if (!showUpdateForm || !updateData.amountPaid) return;

    const timeoutId = setTimeout(() => {
      const paidAmount = parseFloat(updateData.amountPaid) || 0;
      const total = calculatedTotal;
      const calculatedChange = paidAmount - total;
      
      setUpdateData(prev => ({
        ...prev,
        change: calculatedChange >= 0 ? calculatedChange.toFixed(2) : '0.00'
      }));
    }, 100); // 100ms debounce

    return () => clearTimeout(timeoutId);
  }, [updateData.amountPaid, showUpdateForm, calculatedTotal]);

  // Optimize date formatting
  const formatDate = useCallback((timestamp) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  // Optimize currency formatting
  const formatCurrency = useCallback((amount) => {
    return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }, []);

  // Optimize PDF download with better error handling - use requestIdleCallback for non-urgent operations
  const handleDownloadPDF = useCallback(() => {
    const generatePDF = () => {
      try {
        const doc = new jsPDF();
        const date = formatDate(invoice.createdat);

        doc.setFontSize(20);
        doc.text('INVOICE', 20, 20);
        
        doc.setFontSize(14);
        doc.text(`Order Code: ${invoice.orderid}`, 20, 35);
        doc.text(`Date: ${date}`, 20, 45);
        
        doc.line(20, 55, 190, 55);
        
        doc.setFontSize(12);
        doc.text('Product', 20, 70);
        doc.text('Qty', 100, 70);
        doc.text('Unit Price', 130, 70);
        doc.text('Amount', 170, 70);
        doc.line(20, 75, 190, 75);
        
        let yPosition = 85;
        let totalAmount = 0;
        
        if (invoice.orderItems && invoice.orderItems.length > 0) {
          invoice.orderItems.forEach((item) => {
            doc.text(item.products?.productname || 'N/A', 20, yPosition);
            doc.text(item.quantity.toString(), 100, yPosition);
            doc.text(`P${formatCurrency(item.unitprice)}`, 130, yPosition);
            doc.text(`P${formatCurrency(item.subtotal)}`, 170, yPosition);
            yPosition += 10;
            totalAmount += item.subtotal;
          });
          
          totalAmount = invoice.totalOrderAmount || totalAmount;
        } else {
          doc.text(invoice.products?.productname || 'N/A', 20, yPosition);
          doc.text(invoice.quantity.toString(), 100, yPosition);
          doc.text(`P${formatCurrency(invoice.unitprice)}`, 130, yPosition);
          doc.text(`P${formatCurrency(invoice.subtotal)}`, 170, yPosition);
          yPosition += 10;
          totalAmount = invoice.subtotal;
        }
        
        doc.line(20, yPosition + 5, 190, yPosition + 5);
        doc.setFontSize(14);
        doc.text('TOTAL:', 130, yPosition + 20);
        doc.text(`P${formatCurrency(totalAmount)}`, 170, yPosition + 20);

        // Add payment information if available
        if (amountPaid !== null && amountPaid !== undefined) {
          doc.text('AMOUNT PAID:', 130, yPosition + 35);
          doc.text(`P${formatCurrency(amountPaid)}`, 170, yPosition + 35);
          
          doc.text('CHANGE:', 130, yPosition + 50);
          doc.text(`P${formatCurrency(change)}`, 170, yPosition + 50);
        }

        // Add status information
        if (orderStatus) {
          doc.setFontSize(12);
          doc.text(`Status: ${orderStatus.toUpperCase()}`, 20, yPosition + 65);
        }

        doc.save(`Invoice_${invoice.orderid}.pdf`);
      } catch (error) {
        console.error('Error generating PDF:', error);
        alert('Error generating PDF. Please try again.');
      }
    };

    // Use requestIdleCallback for better performance, fallback to setTimeout
    if ('requestIdleCallback' in window) {
      requestIdleCallback(generatePDF, { timeout: 1000 });
    } else {
      setTimeout(generatePDF, 0);
    }
  }, [invoice, formatDate, formatCurrency, amountPaid, change, orderStatus]);

  // Optimize form handlers with useCallback and debouncing
  const handleUpdateDataChange = useCallback((e) => {
    const { name, value } = e.target;
    
    // Use requestAnimationFrame for smoother updates
    requestAnimationFrame(() => {
      setUpdateData(prev => ({
        ...prev,
        [name]: value
      }));

      if (errors[name]) {
        setErrors(prev => ({
          ...prev,
          [name]: ''
        }));
      }
    });
  }, [errors]);

  const validateUpdateForm = useCallback(() => {
    const newErrors = {};
    const total = calculatedTotal;
    const paidAmount = parseFloat(updateData.amountPaid) || 0;

    if (!updateData.amountPaid || paidAmount < 0) {
      newErrors.amountPaid = 'Amount paid must be a positive number';
    } else if (paidAmount < total) {
      newErrors.amountPaid = 'Amount paid cannot be less than total amount to complete the order';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [calculatedTotal, updateData.amountPaid]);

  const handleUpdateSubmit = useCallback(async () => {
    if (validateUpdateForm()) {
      setIsUpdating(true);
      
      try {
        const updateOrderData = {
          orderid: invoice.orderid,
          amountPaid: parseFloat(updateData.amountPaid),
          change: parseFloat(updateData.change),
          orderStatus: 'COMPLETE'
        };

        if (onUpdateOrder) {
          await onUpdateOrder(updateOrderData);
        }
        
        setShowUpdateForm(false);
        setShowSuccessModal(true);
        
      } catch (error) {
        console.error('Error updating order:', error);
        alert('Failed to update order. Please try again.');
      } finally {
        setIsUpdating(false);
      }
    }
  }, [validateUpdateForm, invoice.orderid, updateData, onUpdateOrder]);

  // Optimize event handlers with passive event listeners where possible
  const handleCancelUpdate = useCallback(() => {
    requestAnimationFrame(() => {
      setShowUpdateForm(false);
      setUpdateData({
        amountPaid: '',
        change: ''
      });
      setErrors({});
    });
  }, []);

  const handleSuccessModalClose = useCallback(() => {
    requestAnimationFrame(() => {
      setShowSuccessModal(false);
      onClose();
    });
  }, [onClose]);

  const handleShowUpdateForm = useCallback(() => {
    requestAnimationFrame(() => {
      setShowUpdateForm(true);
    });
  }, []);

  // Optimize modal close with event delegation
  const handleModalOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      requestAnimationFrame(() => {
        onClose();
      });
    }
  }, [onClose]);

  const handleModalContentClick = useCallback((e) => {
    e.stopPropagation();
  }, []);

  return (
    <div className="modal-overlay" onClick={handleModalOverlayClick}>
      <div className="invoice-modal-content" onClick={handleModalContentClick}>
        <div className="invoice-modal-inner">
          <div className="modal-header">
            <h3>Invoice Details - Order {invoice.orderid}</h3>
            {isIncompleteOrder && !showUpdateForm && (
              <button 
                className="complete-order-btn"
                onClick={handleShowUpdateForm}
                title="Update incomplete order"
              >
                 Complete Order
              </button>
            )}
          </div>
          
          {!showUpdateForm ? (
            <div className="invoice-details">
              <br />
              
              {/* Order Information */}
              <div className="invoice-info-grid">
                <div className="invoice-info-row">
                  <div className="invoice-info-item">
                    <strong>Order Code:</strong>
                    <span>{invoice.orderid}</span>
                  </div>
                  <div className="invoice-info-item">
                    <strong>Date:</strong>
                    <span>{formatDate(invoice.createdat)}</span>
                  </div>
                </div>
                <div className="invoice-info-row">
                  <div className="invoice-info-item">
                    <strong>Status:</strong>
                    <span className={`status-indicator ${orderStatus.toLowerCase()}`}>
                      {orderStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="invoice-items-section">
                <h4>Order Items:</h4>
                <div className="invoice-items-list">
                  {invoice.orderItems && invoice.orderItems.length > 0 ? (
                    invoice.orderItems.map((item, index) => (
                      <div key={index} className="invoice-item">
                        <div className="invoice-info-row">
                          <div className="invoice-info-item">
                            <strong>Product:</strong>
                            <span>{item.products?.productname || 'N/A'}</span>
                          </div>
                          <div className="invoice-info-item">
                            <strong>Quantity:</strong>
                            <span>{item.quantity}</span>
                          </div>
                        </div>
                        <div className="invoice-info-row">
                          <div className="invoice-info-item">
                            <strong>Unit Price:</strong>
                            <span>₱{item.unitprice.toLocaleString()}</span>
                          </div>
                          <div className="invoice-info-item">
                            <strong>Subtotal:</strong>
                            <span>₱{item.subtotal.toLocaleString()}</span>
                          </div>
                        </div>
                        {index < invoice.orderItems.length - 1 && (
                          <hr className="item-separator" />
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="invoice-item">
                      <div className="invoice-info-row">
                        <div className="invoice-info-item">
                          <strong>Product:</strong>
                          <span>{invoice.products?.productname || 'N/A'}</span>
                        </div>
                        <div className="invoice-info-item">
                          <strong>Quantity:</strong>
                          <span>{invoice.quantity}</span>
                        </div>
                      </div>
                      <div className="invoice-info-row">
                        <div className="invoice-info-item">
                          <strong>Unit Price:</strong>
                          <span>₱{invoice.unitprice.toLocaleString()}</span>
                        </div>
                        <div className="invoice-info-item">
                          <strong>Subtotal:</strong>
                          <span>₱{invoice.subtotal.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Summary */}
              <div className="invoice-payment-section">
                <div className="invoice-payment-summary">
                  <div className="payment-summary-row total-row">
                    <strong>Order Total: </strong>
                    <span className="total-amount">₱{calculatedTotal.toLocaleString()}</span>
                  </div>
                  
                  {amountPaid !== null && amountPaid !== undefined && (
                    <>
                      <div className="payment-summary-row paid-row">
                        <strong>Amount Paid:</strong>
                        <span className="paid-amount">₱{amountPaid.toLocaleString()}</span>
                      </div>
                      
                      <div className="payment-summary-row change-row">
                        <strong>Change:</strong>
                        <span className="change-amount">₱{change.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button className="download-pdf-btn" onClick={handleDownloadPDF}>
                  Download PDF
                </button>
                <button className="close-btn1" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Update Form */
            <div className="update-form-section">
              <h4>Update Order Payment</h4>
              
              <div className="update-form">
                <div className="form-group">
                  <label htmlFor="updateAmountPaid">Amount Paid *</label>
                  <input
                    type="number"
                    id="updateAmountPaid"
                    name="amountPaid"
                    value={updateData.amountPaid}
                    onChange={handleUpdateDataChange}
                    className={`form-input ${errors.amountPaid ? 'error' : ''}`}
                    placeholder="Enter amount paid"
                    min="0"
                    step="0.01"
                    disabled={isUpdating}
                  />
                  {errors.amountPaid && <span className="error-message">{errors.amountPaid}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="updateChange">Change</label>
                  <input
                    type="number"
                    id="updateChange"
                    name="change"
                    value={updateData.change}
                    className="form-input readonly"
                    placeholder="Auto-calculated"
                    readOnly
                  />
                </div>

                <div className="payment-summary-section">
                  <div className="payment-summary">
                    <div className="summary-row total-row">
                      <span className="summary-label">Total Amount:</span>
                      <span className="summary-value total-amount">₱{calculatedTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    <div className="summary-row change-row">
                      <span className="summary-label">New Change:</span>
                      <span className="summary-value change-amount">
                        {updateData.change ? `₱${parseFloat(updateData.change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '₱0.00'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button 
                  className="cancel-btn" 
                  onClick={handleCancelUpdate}
                  disabled={isUpdating}
                >
                  Cancel
                </button>
                <button 
                  className="save-btn" 
                  onClick={handleUpdateSubmit}
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Completing Order...' : 'Complete Order'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="success-overlay">
            <div className="success-modal">
              <div className="success-header">
                <h3>Order Completed</h3>
              </div>
              <div className="success-body">
                <p>Order <strong>{invoice.orderid}</strong> has been successfully completed!</p>
                <div className="success-details">
                  <div className="success-detail-row">
                    <span>Amount Paid:</span>
                    <span>₱{parseFloat(updateData.amountPaid).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div className="success-detail-row">
                    <span>Change:</span>
                    <span>₱{parseFloat(updateData.change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                </div>
              </div>
              <div className="success-footer">
                <button 
                  className="success-ok-btn" 
                  onClick={handleSuccessModalClose}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoiceModal;