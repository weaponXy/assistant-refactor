import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSupplier } from "../supplier/fetchsuppliertable";
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

  const loadSupplier = async () => {
  try {
    const data = await fetchSupplier();
    console.log("Fetched suppliers:", data);  // Add this
    setSuppliers(data);
  } catch (err) {
    console.error("Error loading Supplies", err);
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
  }, []);

  const filteredSuppliers = suppliers.filter((supplier) =>
    supplier.suppliername.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              <li>Dashboard</li>
              <li onClick={() => navigate("/inventory")}>Inventory</li>
              <li className="active">Supplier</li>
              <li onClick={() => navigate("/TablePage")}>Sales</li>
              <li>Expenses</li>
              <li>AI Assistant</li>
            </ul>
            <p className="nav-header">SUPPORT</p>
            <ul>
              <li>Help</li>
              <li>Settings</li>
            </ul>
          </div>
        </aside>

        <div className="main-content">
          <div className="supplier-panel">
            <div className="panel-header">
              <h2 className="panel-title">Supplier</h2>
              <div className="panel-actions">
                <input className="supplier-search" type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <button className="add-supplier-button" onClick={() => setShowModal(true)}>
                  + Add Supplier
                </button>
              </div>
            </div>
            
            <div className="table-container">
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
                      <td>{supplier.supplierstatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="right-panel">
            <div className="user-info-card">
              <div className="user-left">
                  <div className="user-avatar"/>
                  <div className="user-username">
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
          </div>
        </div>
      </div>
      {showModal && (
        <AddSupplier
          onClose={() => {
            setShowModal(false);
            loadSupplier();
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
          }}
          user={user}
        />
      )}

    </div>
  );
};

export default Supplier;