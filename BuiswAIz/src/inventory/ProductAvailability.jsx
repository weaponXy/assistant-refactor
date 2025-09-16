import React from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import "../stylecss/ProductAvailability.css";

const ProductAvailability = ({ lowStockProducts }) => {
  return (
    <div className="availability-panel">
      <h3>Product Availability</h3>
      <div className="availability-container">
        {lowStockProducts.length === 0 ? (
          <p className="no-low-stock">✅ All items are sufficiently stocked.</p>
        ) : (
          lowStockProducts
            .sort(
              (a, b) =>
                (b.reorderpoint - b.currentstock) -
                (a.reorderpoint - a.currentstock)
            )
            .map((category, i) => {
              const product = category.product || {};
              const categoryLabel =
                [category.color, category.agesize].filter(Boolean).join(" / ") ||
                "N/A";
              const deficit = Math.max(
                category.reorderpoint - category.currentstock,
                0
              );

              // severity classification
              let severity = "ok";
              if (category.currentstock === 0) severity = "critical";
              else if (category.currentstock < category.reorderpoint / 2)
                severity = "urgent";
              else if (category.currentstock < category.reorderpoint)
                severity = "warning";

              const lastUpdated = category.updatedstock
                ? formatDistanceToNow(parseISO(category.updatedstock), {
                    addSuffix: true,
                  })
                : "No recent updates";

              return (
                <div
                  key={category.productcategoryid || i}
                  className={`availability-item severity-${severity}`}
                >
                  {/* Thumbnail */}
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.productname || "Product"}
                      className="product-thumbnail"
                    />
                  ) : (
                    <div className="img-placeholder">📦</div>
                  )}

                  <div className="availability-details">
                    {/* Name + variant */}
                    <span className="name">
                      {product.productname || "Unnamed Product"}{" "}
                      <span className="category-label">({categoryLabel})</span>
                    </span>

                    {/* Stock Progress Bar */}
                    <div className="stock-meter">
                      <div
                        className={`stock-fill severity-${severity}`}
                        style={{
                          width: `${Math.min(
                            (category.currentstock / category.reorderpoint) * 100,
                            100
                          )}%`,
                        }}
                      ></div>
                    </div>

                    {/* Stock summary */}
                    <div className="stock-summary">
                      <span className="stock">
                        {category.currentstock} pcs left
                      </span>
                      <span className="reorder-point">
                        Reorder at {category.reorderpoint}
                      </span>
                    </div>

                    {/* Deficit + Last updated */}
                    <div className="extra-info">
                      <span className="deficit">
                        Deficit: {deficit > 0 ? deficit : 0}
                      </span>
                      <span className="time">Updated {lastUpdated}</span>
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
};

export default ProductAvailability;
