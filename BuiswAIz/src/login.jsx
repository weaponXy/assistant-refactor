import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabase';
import './stylecss/login.css';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    // 1. Sign in via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      setError('Invalid email or password.');
      return;
    }

    const userId = authData.user.id;

    // 2. Get matching user row from systemuser using auth.user.id
    const { data: userProfile, error: userError } = await supabase
      .from('systemuser')
      .select('*')
      .eq('userid', userId)
      .single();

    if (userError || !userProfile) {
      setError('User profile not found.');
      return;
    }

    // 3. Save to localStorage if needed
    if (rememberMe) {
      localStorage.setItem('user', JSON.stringify(userProfile));
    }

    // 4. Redirect
    navigate('/inventory');
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <form onSubmit={handleLogin} className="login-form">
          <h2 className="login-title">Sign In</h2>
          <p className="login-subtitle">Enter your Email and password to sign in!</p>

          <label className="login-label">Email*</label>
          <input
            type="email"
            required
            placeholder="Enter Your Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="login-input"
          />

          <label className="login-label">Password*</label>
          <input
            type="password"
            required
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="login-input"
          />

          <div className="login-options">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={() => setRememberMe(!rememberMe)}
              />
              Keep me logged in
            </label>
          </div>

          {error && <p className="error-message">{error}</p>}

          <button type="submit" className="login-button">Sign In</button>
        </form>
      </div>

      <div className="login-right">
        <h1 className="login-logo">BuisWaiz</h1>
      </div>
    </div>
  );
};

export default Login;
