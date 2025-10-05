import React from 'react';
import '../stylecss/PointOfSales/SellingPanel.css';

const SellingPanel = ({ 
  cart, 
  amountPaid, 
  setAmountPaid, 
  onUpdateQuantity, 
  onRemoveFromCart, 
  onCompleteTransaction, 
  onClearCart 
}) => {
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const total = subtotal;
  const change = amountPaid ? (parseFloat(amountPaid) - total) : 0;

  return (
    <div className="pos-order-section">
      <div className="order-header">
        <h2>Current Order</h2>
        <span className="order-count">{cart.length} items</span>
      </div>

      <div className="order-items">
        {cart.length === 0 ? (
          <div className="empty-order">
            <p>No items in order</p>
            <small>Select products to add</small>
          </div>
        ) : (
          cart.map(item => (
            <div key={item.productcategoryid} className="order-item">
              <div className="order-item-header">
                <div className="order-item-info">
                  <h4>{item.productname}</h4>
                  {(item.color || item.agesize) && (
                    <p className="order-item-variant">
                      {[item.color, item.agesize].filter(Boolean).join(' • ')}
                    </p>
                  )}
                  <p className="order-item-price">₱{item.price.toFixed(2)} each</p>
                </div>
                <div className="order-item-total">
                  ₱{(item.price * item.quantity).toFixed(2)}
                </div>
              </div>
              <div className="order-item-footer">
                <div className="order-item-controls">
                  <button
                    className="qty-btn"
                    onClick={() => onUpdateQuantity(item.productcategoryid, item.quantity - 1)}
                  >
                    −
                  </button>
                  <span className="qty-display">{item.quantity}</span>
                  <button
                    className="qty-btn"
                    onClick={() => onUpdateQuantity(item.productcategoryid, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <button
                  className="remove-btn1"
                  onClick={() => onRemoveFromCart(item.productcategoryid)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {cart.length > 0 && (
        <div className="order-summary">
          <div className="summary-row">
            <span>Subtotal:</span>
            <span>₱{subtotal.toFixed(2)}</span>
          </div>
          {/* Tax row removed temporarily */}
          <div className="summary-row total">
            <span>Total:</span>
            <span>₱{total.toFixed(2)}</span>
          </div>

          <div className="payment-input-section">
            <label htmlFor="amountPaid">Amount Paid:</label>
            <input
              type="number"
              id="amountPaid"
              value={amountPaid}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || parseFloat(value) >= 0) {
                  setAmountPaid(value);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') {
                  e.preventDefault();
                }
              }}
              placeholder="Enter amount paid"
              className="amount-paid-input"
              min="0"
              step="0.01"
            />
          </div>

          {amountPaid && parseFloat(amountPaid) > 0 && (
            <div className="summary-row change-row">
              <span>Change:</span>
              <span className={change >= 0 ? 'change-positive' : 'change-negative'}>
                ₱{change.toFixed(2)}
              </span>
            </div>
          )}

          <button className="checkout-btn" onClick={onCompleteTransaction}>
            Complete Transaction
          </button>
          <button className="clear-btn" onClick={onClearCart}>
            Clear Order
          </button>
        </div>
      )}
    </div>
  );
};

export default SellingPanel;