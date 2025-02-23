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

  return (
    <div className="App">
      <h1>Google Cloud IAM Policy Generator</h1>
      <form onSubmit={handleSubmit}>
        <textarea
          placeholder="Enter your plain English prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows="6"
          cols="60"
        />
        <br />
        <button type="submit" disabled={loading}>
          {loading ? "Generating..." : "Generate Policy"}
        </button>
      </form>
      
      {error && (
        <div style={{ color: 'red', margin: '1rem 0' }}>
          {error}
        </div>
      )}
      
      {policy && (
        <div>
          <h2>Generated Policy:</h2>
          <pre style={{ 
            backgroundColor: '#f5f5f5', 
            padding: '1rem', 
            borderRadius: '4px',
            overflow: 'auto' 
          }}>
            {policy}
          </pre>
        </div>
      )}
    </div>
  );
}

export default App;