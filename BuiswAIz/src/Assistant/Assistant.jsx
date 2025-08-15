import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import "../stylecss/Assistant.css";
import AssistantChat from "./AssistantChat";

const Assistant = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);

    useEffect(() => {
        let heartbeat;
        let authUserId;

        const releaseLock = async () => {
            try {
                if (authUserId) {
                    await supabase.from('assistant_lock')
                    .update({ locked_by: null, locked_at: null })
                    .eq('id', 1);
                }
            } catch (error) {
                console.error("Error releasing lock:", error);
            }
            if (heartbeat) clearInterval(heartbeat);
        };

        const getUserAndLock = async () => {
            try {
                // 1️⃣ Get current auth user
                const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
                if (authError || !authUser) {
                    window.location.href = '/';
                    return;
                }
                authUserId = authUser.id; // assign to outer scope

                // 2️⃣ Fetch the singleton lock row (use maybeSingle in case row doesn't exist)
                const { data: lockRow, error: lockError } = await supabase
                    .from('assistant_lock')
                    .select('*')
                    .eq('id', 1)
                    .maybeSingle();

                if (lockError) {
                    console.error("Error fetching lock:", lockError);
                    return;
                }

                const now = new Date();
                const lockedTime = lockRow?.locked_at ? new Date(lockRow.locked_at) : null;
                const diffMinutes = lockedTime ? (now - lockedTime) / (1000 * 60) : null;

                // 3️⃣ Check if someone else has the lock
                if (lockRow?.locked_by && lockRow.locked_by !== authUserId && diffMinutes < 1) {
                    alert("Someone is currently accessing the assistant page.");
                    navigate("/inventory");
                    return;
                }

                // 4️⃣ Acquire the lock (upsert ensures singleton row)
                await supabase.from('assistant_lock')
                    .upsert(
                    { id: 1, locked_by: authUserId, locked_at: new Date().toISOString() },
                    { onConflict: 'id' }
                    );

                // 5️⃣ Fetch user profile
                const { data: profile } = await supabase
                    .from('systemuser')
                    .select('*')
                    .eq('userid', authUserId)
                    .single();
                setUser(profile || null);

                // 6️⃣ Start heartbeat every 30 seconds
                heartbeat = setInterval(async () => {
                    try {
                    await supabase.from('assistant_lock')
                        .update({ locked_at: new Date().toISOString() })
                        .eq('id', 1);
                    } catch (err) {
                    console.error("Error refreshing lock:", err);
                    }
                }, 30000);

            } catch (err) {
                console.error("Unexpected error in getUserAndLock:", err);
            }
        };

        getUserAndLock();

        // 🔹 Listen for auth/account changes
        const authListener = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session || session.user.id !== authUserId) {
            releaseLock();
            }
        }).data.subscription;

        return () => {
            releaseLock();
            authListener?.unsubscribe();
        };
        }, [navigate]);

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
                            <li onClick={() => navigate("/dashboard")}>Dashboard</li>
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

                <div className="A-main-content">
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
                    <div className="A-right-panel">
                        <div className="A-user-info-card">
                            <div className="A-user-left">
                                <div className="A-user-avatar"/>
                                <div className="A-user-username">
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