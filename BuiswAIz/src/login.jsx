import React, { useState } from 'react';
import { supabase } from './supabase';
import './stylecss/login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const { data, error: queryError } = await supabase
      .from('systemuser')
      .select('*')
      .eq('username', username)
      .single();

    if (queryError || !data || data.password !== password) {
      setError('Invalid username or password.');
      return;
    }

    if (rememberMe) {
      localStorage.setItem('user', JSON.stringify(data));
    }

    setSuccess('Login successful!');
    // ✅ Ready to navigate in the future if needed
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <form onSubmit={handleLogin} className="login-form">
          <h2 className="login-title">Sign In</h2>
          <p className="login-subtitle">Enter your username and password to sign in!</p>

          <label className="login-label">Username*</label>
          <input
            type="text"
            required
            placeholder="yourusername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
            <a href="#" className="forgot-password">Forgot password?</a>
          </div>

          {error && <p className="error-message">{error}</p>}
          {success && <p className="success-message">{success}</p>}

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
