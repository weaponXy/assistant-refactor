import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { useNavigate } from "react-router-dom";
import "../stylecss/HelpPage.css"

const HelpPage = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);


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
    }, []);



    return (
        <div className="HelpPage">
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
                            <li onClick={() => navigate("/supplier")}>Supplier</li>
                            <li onClick={() => navigate("/TablePage")}>Sales</li>
                            <li onClick={() => navigate("/expenses")}>Expenses</li>
                            <li onClick={() => navigate("/assistant")}>AI Assistant</li>
                        </ul>
                        <p className="nav-header">SUPPORT</p>
                        <ul>
                            <li className="active">Help</li>
                            <li>Settings</li>
                        </ul>
                    </div>
                </aside>

                <div className="Help-main-content">
                    <div className="HelpPage-panel">
                        <p>help</p>
                    </div>

                    <div className="Help-right-panel">
                        <div className="Help-user-info-card">
                            <div className="Help-user-left">
                                <div className="Help-user-avatar"/>
                                <div className="Help-user-username">
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
        </div>

      )
}

export default HelpPage;