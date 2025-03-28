import { FormEvent, useState } from 'react'
import { Button } from "@/components/ui/button";

import './App.css'
import {
  GoogleLogin,
  GoogleOAuthProvider,
  googleLogout,
} from "@react-oauth/google";

function App() {
  const [prompt, setPrompt] = useState("");
  const [policy, setPolicy] = useState("");
  const [chatResponse, setChatResponse] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");



  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("http://localhost:8000/generate_policy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Extract the JSON part from the response
      const fullResponse = data.policy;
      const jsonStartIndex = fullResponse.indexOf("{");
      const jsonEndIndex = fullResponse.lastIndexOf("}") + 1;

      if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
        // Extract the potential JSON string
        const jsonStr = fullResponse.substring(jsonStartIndex, jsonEndIndex);
        try {
          // Try to parse it to validate it's actually JSON
          const parsedJson = JSON.parse(jsonStr);
          // If successful, set the policy and chat response
          setPolicy(JSON.stringify(parsedJson, null, 2));
          // Get any text before the JSON as chat response
          const chatText = fullResponse.substring(0, jsonStartIndex).trim();
          setChatResponse(chatText || ""); // Set empty string if no chat text
        } catch (e) {
          // If JSON parsing fails, treat everything as chat
          setChatResponse(fullResponse);
          setPolicy("");
        }
      } else {
        // No JSON-like structure found, treat as chat
        setChatResponse(fullResponse);
        setPolicy("");
      }
    } catch (error) {
      console.error("Error generating policy:", error);
      setError("Failed to generate policy. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(policy);
  };

  const highlightJson = (text: string): string => {
    try {
      // Try to parse as JSON first
      JSON.parse(text);
      // If successful, apply syntax highlighting
      return text;
      /*
        .replace(/"([^"]+)":/g, '<span class="key">"$1"</span>:')
        .replace(/"([^"]+)"/g, '<span class="string">"$1"</span>')
        .replace(/\b(true|false)\b/g, '<span class="boolean">$1</span>')
        .replace(/\b(null)\b/g, '<span class="null">$1</span>')
        .replace(/\b(-?\d+\.?\d*)\b/g, '<span class="number">$1</span>')
        .replace(/[{[]/g, '<span class="bracket">$&</span>')
        .replace(/[}\]]/g, '<span class="bracket">$&</span>')
        .replace(/\n/g, '<br/>')
        .replace(/ /g, '&nbsp;')
        .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
    */
    } catch (e) {
      // If not valid JSON, return as plain text
      return text;
    }
  };

  const isJsonString = (str: string): boolean => {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleApplyPolicy = async () => {
    try {
      const response = await fetch("http://localhost:8000/apply_policy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ policy })
      });
      const data = await response.json();
      console.log("policy applied:", data);
    } catch (error) {
      console.error("error applying policy:", error);
    }
  };
  

  return (
    <GoogleOAuthProvider clientId="652210973933-lr0mof1noah9mgns6dfgifk9o3b3i39a.apps.googleusercontent.com">

    <div className="App">
      <div className="container">
        <h1>
          <span role="img" aria-label="shield">🛡️</span> Google Cloud IAM Policy Generator
        </h1>

        <div className="oauth-container">
          {token ? (
            <button
              onClick={() => {
                console.debug('user is signing out');
                googleLogout();
                setToken(''); // clear the token for now
              }}
            >
              sign out
            </button>
          ) : (
            <GoogleLogin
              onSuccess={(credentialResponse) => {
                console.debug('oauth success:', credentialResponse);
                if (credentialResponse.credential) {
                  setToken(credentialResponse.credential);
                }
              }}
              onError={() => console.error('login failed')}
            />
          )}
        </div>
        
        <form onSubmit={handleSubmit} className="prompt-form">
          <textarea
            placeholder="Describe your IAM policy requirements in plain English..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            className="prompt-input"
          />
          <div className="buttons-container">
            { policy && (
              <button onClick={handleApplyPolicy} className="apply-btn">
                <span role="img" aria-label="apply">🚀</span> apply policy
              </button>
            )}
            <button type="submit" disabled={loading} className="submit-btn">
              {loading ? (
                <>
                  <span role="img" aria-label="loading">⚡</span> Generating...
                </>
              ) : (
                <>
                  <span role="img" aria-label="generate">✨</span> Generate Policy
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="error-message">
            <span role="img" aria-label="error">⚠️</span> {error}
          </div>
        )}
        
        <div className="response-container">
          {policy && (
            <div className="policy-output">
              <div className="output-header">
                <h2>Generated Policy</h2>
                <button onClick={handleCopy} className="action-btn">
                  <span role="img" aria-label="copy">📋</span> Copy Policy
                </button>
              </div>
              <pre 
                className={`policy-pre ${isJsonString(policy) ? 'json' : ''}`}
                dangerouslySetInnerHTML={{ __html: highlightJson(policy) }}
              />
            </div>
          )}
          
          {chatResponse && (
            <div className="chat-output">
              <h2>Chat Response</h2>
              <pre className="chat-pre">
                {chatResponse}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
    </GoogleOAuthProvider>
  );
}

export default App;
