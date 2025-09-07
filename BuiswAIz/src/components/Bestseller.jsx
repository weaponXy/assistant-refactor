import React from 'react';

const Bestseller = ({ bestsellers }) => {
  return (
    <div className="bestseller-table-wrapper">
      <h3>Bestseller Items</h3>
      <div className="table-scroll-box1">
        <table className="bestseller-table">
          <thead>
            <tr>
              <th></th>
              <th>Product Name</th>
              <th>Total Sold</th>
            </tr>
          </thead>
          <tbody>
            {bestsellers.map((item, index) => (
              <tr key={index}>
                <td className="product-image-cell">
                  <div className="image-wrapper">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.productname}
                        className="product-image"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = '/placeholder-image.png';
                        }}
                      />
                    ) : (
                      <span className="no-image-text">Image</span>
                    )}
                  </div>
                </td>
                <td>{item.productname}</td>
                <td>{item.totalQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Bestseller;