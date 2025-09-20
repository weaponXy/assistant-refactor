import React, { useState } from 'react';
import { supabase } from './supabase';
import './stylecss/login.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleReset = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${import.meta.env.VITE_FE_URL}/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage('Password reset email sent. Check your inbox.');
    }
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <form onSubmit={handleReset} className="login-form">
          <h2 className="login-title">Reset Password</h2>

          <label className="login-label">Email*</label>
          <input
            type="email"
            required
            placeholder="Enter Your Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="login-input"
          />

          {message && <p className="success-message">{message}</p>}
          {error && <p className="error-message">{error}</p>}

          <button type="submit" className="login-button">Send Reset Email</button>
        </form>
      </div>

      <div className="login-right">
        <h1 className="login-logo">BuisWaiz</h1>
      </div>
    </div>
  );
};

export default ForgotPassword;
