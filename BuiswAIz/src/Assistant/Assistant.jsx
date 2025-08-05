import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import "../stylecss/Assistant.css";
import AssistantChat from "./AssistantChat";

const Assistant = () => {
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


    return(
        <div className="assistant-page">
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
                            <li onClick={() => navigate("/supplier")}>Supplier</li>
                            <li onClick={() => navigate("/TablePage")}>Sales</li>
                            <li>Expenses</li>
                            <li className="active">AI Assistant</li>
                        </ul>
                        <p className="nav-header">SUPPORT</p>
                        <ul>
                            <li>Help</li>
                            <li>Settings</li>
                        </ul>
                    </div>
                </aside>

                <div className="main-content">
                    <div className="assistant-panel">
                        <div className="panel-header">
                            <h2 className="panel-title">BuiswAIz Assistant</h2>
                            <div className="panel-action">
                                <button className="print-reports">
                                    Print Reports
                                </button>
                            </div>
                        </div>
                        <div className="table-container">
                            <table></table>
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
                        <AssistantChat/>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Assistant;