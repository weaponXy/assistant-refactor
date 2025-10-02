import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSupplier, fetchSupplierWithProducts } from "../supplier/fetchsuppliertable";
import { supabase } from "../supabase";
import "../stylecss/supplier.css";
import AddSupplier from "../supplier/AddSupplier";
import ViewSupplier from "../supplier/ViewSupplier";

const Supplier = () => {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierStats, setSupplierStats] = useState([]);

  const loadSupplier = async () => {
  try {
    const data = await fetchSupplier();
    console.log("Fetched suppliers:", data);  // Add this
    setSuppliers(data);
  } catch (err) {
    console.error("Error loading Supplies", err);
  }
};

const loadSupplierStats = async () => {
  try {
    const data = await fetchSupplierWithProducts();
    setSupplierStats(data);
  } catch (err) {
    console.error("Error loading supplier stats", err);
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
      loadSupplier();
      loadSupplierStats();
  }, []);

  const filteredSuppliers = suppliers.filter((supplier) =>
    supplier.suppliername.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const maxDefects = suppliers.length > 0
    ? Math.max(...suppliers.map(s => s.defectreturned || 0))
    : 1;


  return (
    <div className="supplier-page">
        <header className="header-bar">
        <h1 className="header-title">BuiswAIz</h1>
      </header>
      <div className="main-section">
        <aside className="sidebar">
          <div className="nav-section">
            <p className="nav-header">GENERAL</p>
            <ul>
              <li onClick={() => navigate("/Dashboard")}>Dashboard</li>
              <li onClick={() => navigate("/inventory")}>Inventory</li>
              <li className="active">Supplier</li>
              <li onClick={() => navigate("/TablePage")}>Sales</li>
              <li onClick={() => navigate("/expenses")}>Expenses</li>
              <li onClick={() => navigate("/assistant")}>AI Assistant</li>
            </ul>
            <p className="nav-header">SUPPORT</p>
            <ul>
              <li>Help</li>
              <li>Settings</li>
            </ul>
          </div>
        </aside>

        <div className="S-main-content">
          <div className="supplier-panel">
            <div className="panel-header">
              <h2 className="panel-title">Supplier</h2>
              <div className="panel-actions">
                <input id="supplierSearch"className="supplier-search" type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <button className="add-supplier-button" onClick={() => setShowModal(true)}>
                  + Add Supplier
                </button>
              </div>
            </div>
            
            <div className="supplier-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>ContactName</th>
                    <th>PhoneNumber</th>
                    <th>Email</th>
                    <th>Address</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSuppliers.map((supplier, i) => (
                    <tr
                      key={supplier.supplierid|| i}
                      onClick={() => setSelectedSupplier(supplier)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{supplier.suppliername}</td>
                      <td>{supplier.supplierid}</td>
                      <td>{supplier.contactperson}</td>
                      <td>{supplier.phonenumber}</td>
                      <td>{supplier.supplieremail}</td>
                      <td>{supplier.address}</td>
                      <td className={supplier.supplierstatus === "Active" ? "status-active" : "status-inactive"}>
                        {supplier.supplierstatus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="S-right-panel">
            <div className="S-user-info-card">
              <div className="S-user-left">
                  <div className="S-user-avatar"/>
                  <div className="S-user-username">
                    {user ? user.username : "Loading..."}
                  </div>
              </div>
                <button
                  className="logout-button"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    localStorage.removeItem("userProfile"); // optional
                    localStorage.removeItem('lastActive');
                    window.location.href = "/login"; // send back to login
                  }}
                >
                  ⏻
              </button>
            </div>

            <div className="supply-returned-panel">
              <h3>Product Returned to Supplier</h3>
              <div className="returned-container">
                {suppliers.map((supplier) => (
                  <div key={supplier.supplierid} className="returned-card">
                    <div className="supplier-info">
                      <span className="supplier-name">{supplier.suppliername}</span>
                      <span className="returned-count">{supplier.defectreturned || 0}</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${((supplier.defectreturned || 0) / maxDefects) * 100}%`
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="supplier-stats-panel">
              <h3>Supplier Product Stats</h3>
              <div className="S-stats-container">
                {supplierStats.map((s, i) => (
                  <div key={i} className="S-stats-row">
                    <span className="supplier-name">{s.suppliername}</span>
                    <span className="supplier-status">{s.supplierstatus}</span>
                    <span className="product-count">{s.totalproducts}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
      {showModal && (
        <AddSupplier
          onClose={() => {
            setShowModal(false);
            loadSupplier();
            loadSupplierStats();
          }}
           user={user}
        />  
      )}

      {selectedSupplier && (
        <ViewSupplier
          supplier={selectedSupplier}
          onClose={() => {
            setSelectedSupplier(null);
            loadSupplier();
            loadSupplierStats();
          }}
          user={user}
        />
      )}

    </div>
  );
};

export default Supplier;