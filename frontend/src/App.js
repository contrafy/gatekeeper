import React, { useState } from 'react';
import './App.css';

function App() {
  const [prompt, setPrompt] = useState("");
  const [policy, setPolicy] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("http://localhost:8000/generate_policy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setPolicy(JSON.stringify(data.policy, null, 2)); // Pretty print the JSON
    } catch (error) {
      console.error("Error generating policy:", error);
      setError("Failed to generate policy. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // copy generated policy if it exists
  // TODO: validation
  const handleCopy = () => {
    navigator.clipboard.writeText(policy);
  };

  return (
    <div className="App">
      <h1>Google Cloud IAM Policy Generator</h1>
      <form onSubmit={handleSubmit} className="prompt-form">
        <textarea
          placeholder="Enter your plain English prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows="6"
          className="prompt-input"
        />
        <br />
        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? "Generating..." : "Generate Policy"}
        </button>
      </form>

      {/* TODO: more action buttons for additional functionality */}
      {policy && (
          <div className="action-buttons">
            <button onClick={handleCopy} className="action-btn">
              Copy Policy
            </button>
          </div>
        )}
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {policy && (
        <div className="policy-output">
          <h2>Generated Policy:</h2>
          <pre className="policy-pre">
            {policy}
          </pre>
        </div>
      )}
    </div>
  );
}

export default App;