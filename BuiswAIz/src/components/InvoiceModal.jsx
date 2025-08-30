import React from 'react';
import jsPDF from 'jspdf';

const InvoiceModal = ({ invoice, onClose }) => {
  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Helper function for number formatting without locale issues
  const formatCurrency = (amount) => {
    return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const handleDownloadPDF = () => {
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

    doc.save(`Invoice_${invoice.orderid}.pdf`);
  };

  const calculateTotal = () => {
    if (invoice.orderItems && invoice.orderItems.length > 0) {
      return invoice.totalOrderAmount || invoice.orderItems.reduce((sum, item) => sum + item.subtotal, 0);
    }
    return invoice.subtotal;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="invoice-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Invoice Details - Order {invoice.orderid}</h3>
        </div>
        
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

          {/* Total */}
          <div className="invoice-total-section">
            <div className="invoice-info-item total-item">
              <strong>Order Total:</strong>
              <span className="total-amount">₱{calculateTotal().toLocaleString()}</span>
            </div>
          </div>

          <div className="modal-footer">
            <button className="download-pdf-btn" onClick={handleDownloadPDF}>
              Download PDF
            </button>
            <button className="close-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceModal;