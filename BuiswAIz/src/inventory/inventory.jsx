import React, { useEffect, useState } from "react";
import { fetchProducts } from "../inventory/fetchproducttable";
import "../stylecss/inventory.css";
import { supabase } from "../supabase";
import AddProduct from "../inventory/AddProduct";
import ViewProduct from "../inventory/ViewProduct";
import AddDefect from "../inventory/AddDefect";
import { useNavigate } from "react-router-dom";
import { fetchLowStockProducts } from "../inventory/fetchLowStockProduct";
import { formatDistanceToNow, parseISO } from "date-fns";
import { fetchDefectiveItems } from "../inventory/fetchdefectitem";
import { updateDefectStatus } from "../inventory/UpdateStatusDefect"; 
import TablePage from "../TablePage";


const Inventory = () => {
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showDefectModal, setShowDefectModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [defectiveItems, setDefectiveItems] = useState([]);
  const [user, setUser] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const navigate = useNavigate();

  const loadProducts = async () => {
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (err) {
      console.error("Error loading products", err);
    }
    
  };
  const loadLowStock = async () => {
    const data = await fetchLowStockProducts();
    setLowStockProducts(data);
  };

  const loadDefectiveItems = async () => {
    const data = await fetchDefectiveItems();
    setDefectiveItems(data);
  };

  const loadActivityLogs = async () => {
    const { data, error } = await supabase
      .from("activitylog")
      .select("*, systemuser(username)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch activity logs:", error);
      return;
    }

    setActivityLogs(data.slice(0, 50)); 

    
    if (data.length > 50) {
      const logsToDelete = data.slice(50); 
      const idsToDelete = logsToDelete.map(log => log.activity_id); 

      const { error: deleteError } = await supabase
        .from("activitylog")
        .delete()
        .in("activity_id", idsToDelete);

      if (deleteError) {
        console.error("Failed to delete old logs:", deleteError);
      } else {
        console.log(`Deleted ${idsToDelete.length} old logs.`);
      }
    }
  };


  useEffect(() => {
    const getUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      window.location.href = '/'; // redirect to login
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('systemuser')
      .select('*')
      .eq('userid', user.id)
      .single();

    if (profileError) {
      console.error("Error fetching user profile:", profileError);
      return;
    }

    setUser(profile);
  };
    getUser();
    loadProducts();
    loadLowStock();
    loadDefectiveItems();
    loadActivityLogs();
    const interval = setInterval(() => {
      loadLowStock();
      loadActivityLogs();
      loadDefectiveItems();
    }, 5000);

    return () => clearInterval(interval); 
  }, []);

  const filteredProducts = products.filter((product) =>
    product.productname.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="inventory-page">
      <header className="header-bar">
        <h1 className="header-title">BuiswAIz</h1>
      </header>

      <div className="main-section">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="nav-section">
            <p className="nav-header">GENERAL</p>
            <ul>
              <li onClick={() => navigate("/dashboard")}>Dashboard</li>
              <li className="active">Inventory</li>
              <li onClick={() => navigate("/supplier")}>Supplier</li>
              <li onClick={() => navigate("/TablePage")}>Sales</li>
              <li>Expenses</li>
              <li onClick={() => navigate("/assistant")}>AI Assistant</li>
            </ul>
            <p className="nav-header">SUPPORT</p>
            <ul>
              <li>Help</li>
              <li>Settings</li>
            </ul>
          </div>
        </aside>

        {/* Main Content */}
        <div className="I-main-content">
          <div className="product-panel">
            <div className="panel-header">
              <h2 className="panel-title">Inventory</h2>
              <div className="panel-actions">
                <input className="inventory-search" type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <button className="add-product-button" onClick={() => setShowModal(true)}>
                  + Add Product
                </button>
              </div>
            </div>

            <div className="inventory-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Price</th>
                    <th>Cost</th>
                    <th>Quantity</th>
                    <th>Supplier</th>
                    <th>Image</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product, i) => (
                    <tr
                      key={product.productid || i}
                      onClick={() => setSelectedProduct(product)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{product.productname}</td>
                      <td>{product.productid}</td>
                      <td>{product.description}</td>
                      <td>{product.price}</td>
                      <td>{product.cost}</td>
                      <td>{product.currentstock}</td>
                      <td>{product.suppliers?.suppliername || "Unknown"}</td>
                      <td>
                        <div className="image-cell">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt="Product"
                              className="product-thumbnail"
                            />
                          ) : (
                            <div className="img-placeholder" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Panel */}
          <div className="I-right-panel">
            <div className="I-user-info-card">
              <div className="I-user-left">
                <div className="I-user-avatar" />
                <div className="I-user-username">
                  {user ? user.username : "Loading..."}
                </div>
              </div>
              <button className="logout-button"
              onClick={async () => {
                await supabase.auth.signOut();
                localStorage.clear();
                window.location.href = '/'; // redirect to login
              }}
              >Logout</button>
            </div>

            <div className="availability-panel">
              <h3>Product Availability</h3>
              <div className="availability-container">
                {lowStockProducts.length === 0 ? (
                  <p className="no-low-stock">All items are sufficiently stocked.</p>
                  ) : (
                  lowStockProducts.map((product, i) => {
                    let timeAgo = "N/A";
                    if (product.updatedstock) {
                      try {
                        timeAgo = formatDistanceToNow(parseISO(product.updatedstock), { addSuffix: true });
                      } catch (e) {
                        console.warn("Invalid updatedstock date:", e);
                      }
                    }

                    return (
                      <div key={i} className="availability-item">
                        {product.image_url ? (
                          <img src={product.image_url} alt="Product" className="product-thumbnail" />
                        ) : (
                          <div className="img-placeholder" />
                        )}
                        <div className="availability-details">
                          <span className="name">{product.productname}</span>
                          <span className="stock">{product.currentstock} pcs left</span>
                          <span className="time">{timeAgo}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="defective-panel">
              <div className="panel-title-row">
                <h3>Defective Item</h3>
                <button className="panel-action-button" onClick={() => setShowDefectModal(true)}>+Add-Defect</button>
              </div>
              <div className="defective-container">
                {defectiveItems.length === 0 ? (
                  <p className="no-low-stock">No defective items reported.</p>
                ) : (
                  defectiveItems.map((item) => (
                    <div key={item.defectiveitemid} className="defective-item">
                      {item.products?.image_url ? (
                        <img
                          src={item.products.image_url}
                          alt="Product"
                          className="defectimg-placeholder"
                        />
                      ) : (
                        <div className="defectimg-placeholder" />
                      )}

                      <div className="defective-details">
                        <div className="defect-main">
                          <span className="defect-name">{item.products?.productname || "Unnamed"}</span>
                          <span className="Description">{item.defectdescription}</span>
                          <span className="Quantity">{item.quantity} pcs</span>
                        </div>

                        <div className="defect-status">
                          <select
                          className="status-dropdown"
                          value={item.status}
                          onChange={async (e) => {
                            if (!user) {
                              alert("User not loaded. Please wait...");
                              return;
                            }

                            try {
                              await updateDefectStatus(item.defectiveitemid, e.target.value, user);
                              loadDefectiveItems();
                            } catch (err) {
                              console.error("Update failed:", err);
                              alert("Failed to update status. See console for details.");
                            }
                          }}
                          >
                          <option value="In-Process">In-Process</option>
                          <option value="Returned">Returned</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            
            <div className="activity-panel">
              <h3>Recent Activity</h3>
              <div className="activity-container">
                <ul>
                  {activityLogs.length === 0 ? (
                    <li className="activity-item">No recent activity</li>
                  ) : (
                    activityLogs.map((log, i) => (
                      <li key={i} className="activity-item">
                        <span>
                          <span className="log-username">
                            {log.systemuser?.username ? log.systemuser.username : "Someone"}
                          </span>{" "}
                          {log.action_desc}
                        </span>
                        <span className="time">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <AddProduct
          onClose={() => {
            setShowModal(false);
            loadProducts();
            loadActivityLogs();
          }}
           user={user}
        />
      )}

      {selectedProduct && (
        <ViewProduct
          product={selectedProduct}
          onClose={() => {
            setSelectedProduct(null);
            loadProducts();
          }}
          user={user}
        />
      )}

      {showDefectModal && (
        <AddDefect
          onClose={() => {
            setShowDefectModal(false);
            loadDefectiveItems();
            loadProducts();
          }}
          user={user}
        />
      )}
    </div>
  );
};

export default Inventory;
