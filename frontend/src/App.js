import React, { useState } from 'react';
import './App.css';

function App() {
  const [prompt, setPrompt] = useState("");
  const [policy, setPolicy] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8000/generate_policy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt })
      });
      const data = await response.json();
      setPolicy(data.policy);
    } catch (error) {
      console.error("Error generating policy:", error);
    }
    setLoading(false);
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
      {policy && (
        <div>
          <h2>Generated Policy:</h2>
          <pre>{policy}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
