import React, { useState } from "react";
import "../stylecss/AssistantChat.css";

const AssistantChat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    const newMsg = { role: "user", text: input };
    setMessages([...messages, newMsg]);
    setInput("");
  };

  return (
    <div className="chat-container">
      <h1 className="chat-title">BuiswAIz</h1>

      <div className="chat-box">
        {messages.map((msg, index) => (
          <div
            key={index}
            /* eto yung sa bubble chat ng user and future ai reply*/
            className={`message ${msg.role === "user" ? "user-msg" : "assistant-msg"}`} >
            {msg.text}
          </div>
        ))}
      </div>

      <div className="chat-input-area">
        <input
          type="text"
          placeholder="Create your prompt"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="chat-input"
        />
        <button onClick={handleSend} className="submit-btn">
          Submit
        </button>
      </div>
    </div>
  );
};

export default AssistantChat;
