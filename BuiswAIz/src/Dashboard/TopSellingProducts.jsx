import React from 'react';
import "../stylecss/TopSellingProducts.css";

const TopSellingProducts = ({ topSellingProducts }) => {
  return (
    <div className="top-selling-scrollable">
      <div className="top-selling-scroll-container">
        {topSellingProducts?.map((item, index) => (
          <div key={index} className="top-selling-item">
            <div className="product-rank">#{index + 1}</div>
            <div className="product-image-container">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.productname}
                  className="product-image-small"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = '/placeholder-image.png';
                  }}
                />
              ) : (
                <div className="image-placeholder-small">
                  <span>No Image</span>
                </div>
              )}
            </div>
            <div className="product-details">
              <div className="product-name-small">{item.productname}</div>
              <div className="product-sales">
                <span className="sales-quantity">{item.totalQuantity} sold</span>
                {item.timesBought && (
                  <span className="times-bought">{item.timesBought} orders</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {(!topSellingProducts || topSellingProducts.length === 0) && (
          <div className="empty-state-scroll">
            <p>No sales data available</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopSellingProducts;