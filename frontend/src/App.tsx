import "./App.css";
import React, { FormEvent, useEffect, useState, useCallback } from "react";
import { jwtDecode } from "jwt-decode";
//------------ Shadcn Imports ------------
//------------------------
import {
  CredentialResponse,
  googleLogout,
} from "@react-oauth/google";
import { ThemeProvider } from "./components/theme-provider";
import Header from "./components/Header";
import ProjectSelector from "./components/ProjectSelector";
import PromptContainer from "./components/PromptContainer";
import ResponseContainer from "./components/ResponseContainer";


function App() {
  // User input and API response states
  const [prompt, setPrompt] = useState(""); // Current user prompt input
  const [previousPrompt, setPreviousPrompt] = useState(""); // Stores the last submitted prompt
  const [policy, setPolicy] = useState(""); // Generated IAM policy JSON
  const [originalPolicy, setOriginalPolicy] = useState(""); // Original policy for comparison with edits
  const [chatResponse, setChatResponse] = useState(""); // Text response from the API
  const [error, setError] = useState(""); // Error messages
  const [loading, setLoading] = useState(false); // Loading state for API calls
  const [applyLoading, setApplyLoading] = useState(false); // Separate loading state for Apply Policy button
  const [policyApplied, setPolicyApplied] = useState(false); // Tracks if policy has been applied to project
  const [showLoadingAnimation, setShowLoadingAnimation] = useState(false); // Controls loading animation display
  const [showPolicyAnimation, setShowPolicyAnimation] = useState(false); // Controls policy reveal animation
  const [policyGenerated, setPolicyGenerated] = useState(false); // Tracks if policy was successfully generated
  const [policyGenerationFailed, setPolicyGenerationFailed] = useState(false); // Tracks if policy generation failed
  const [policyCopied, setPolicyCopied] = useState(false); // Tracks if policy was copied to clipboard
  const [emptyPromptShake, setEmptyPromptShake] = useState(false); // Tracks if we should show the empty prompt animation

  // Authentication states
  const [token, setToken] = useState(""); // JWT token from Google OAuth
  const [userPicture, setUserPicture] = useState(""); // User profile picture URL
  const [userName, setUserName] = useState(""); // User's name from Google profile

  // Project management states
  const [projects, setProjects] = useState<any[]>([]); // List of user's GCP projects
  const [selectedProject, setSelectedProject] = useState(""); // Currently selected project ID
  const [fetchingProjects, setFetchingProjects] = useState(false); // Loading state for project fetch
  const [projectError, setProjectError] = useState(""); // Project-related error messages

  // Fetch projects when the auth token changes or on initial load
  useEffect(() => {
    if (token) {
      fetchProjects();
    }
  }, [token]);
  
  // Load saved auth data from localStorage on component mount
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUserName = localStorage.getItem("userName");
    const savedUserPicture = localStorage.getItem("userPicture");

    if (savedToken) setToken(savedToken);
    if (savedUserName) setUserName(savedUserName);
    if (savedUserPicture) setUserPicture(savedUserPicture);
  }, []);

  // Persist token to localStorage when it changes
  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  }, [token]);

  // Persist userName to localStorage when it changes
  useEffect(() => {
    if (userName) {
      localStorage.setItem("userName", userName);
    } else {
      localStorage.removeItem("userName");
    }
  }, [userName]);

  // Persist userPicture to localStorage when it changes
  useEffect(() => {
    if (userPicture) {
      localStorage.setItem("userPicture", userPicture);
    } else {
      localStorage.removeItem("userPicture");
    }
  }, [userPicture]);

  /**
   * Handles successful Google OAuth login
   * Stores token and extracts user info from JWT
   */
  const handleGoogleSuccess = (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;

    // Store the token
    setToken(credentialResponse.credential);

    // Decode JWT to find the "picture" field
    const decoded: any = jwtDecode(credentialResponse.credential);

    if (decoded.picture) {
      setUserPicture(decoded.picture);
    }
    if (decoded.name) {
      setUserName(decoded.name);
    }
  };

  /**
   * Handles user sign out
   * Clears Google auth and resets all related state
   */
  const handleSignOut = () => {
    console.debug("user is signing out");
    googleLogout();
    // Clear from state, which also clears from localStorage
    setToken("");
    setUserName("");
    setUserPicture("");
    setProjects([]);
    setSelectedProject("");
  };

  /**
   * Fetches the user's GCP projects from the backend
   * Uses the authorization token for authentication
   */
  const fetchProjects = async () => {
    if (!token) return;
    
    setFetchingProjects(true);
    setProjectError("");
    
    try {
      console.log("Fetching projects with token:", token.substring(0, 10) + "...");
      const response = await fetch("http://localhost:8000/get_projects", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to fetch projects");
      }
      
      const data = await response.json();
      console.log("Projects fetched successfully:", data);
      
      if (Array.isArray(data)) {
        setProjects(data);
        
        // If we have projects and none selected, select the first one
        if (data.length > 0 && !selectedProject) {
          setSelectedProject(data[0].id);
        }
      } else {
        console.error("Invalid projects data format:", data);
        setProjectError("Received invalid projects data format");
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
      setProjectError(error instanceof Error ? error.message : "Unknown error fetching projects");
      setProjects([]);
    } finally {
      setFetchingProjects(false);
    }
  };
  
  /**
   * Handles form submission to generate policy
   * Sends the user prompt to the backend API
   * Parses the response to separate JSON policy from text
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    // Don't clear the prompt so users can edit it if needed
    e.preventDefault();
    
    // Check for empty prompt
    if (!prompt.trim()) {
      setEmptyPromptShake(true);
      // Reset the shake animation after it completes
      setTimeout(() => setEmptyPromptShake(false), 820);
      return;
    }
    
    setPreviousPrompt(prompt);
    setLoading(true);
    setShowLoadingAnimation(true);
    setShowPolicyAnimation(false);
    setPolicyGenerated(false);
    setPolicyGenerationFailed(false);
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

      // Check if we have a policy or just a chat response
      if (data.chat_response && !data.policy) {
        // We only have a chat response, no policy to parse
        setChatResponse(data.chat_response);
        setPolicy("");
        setPolicyGenerationFailed(false); // Don't mark as failed, just no policy
        
        // Show policy animation and reset loading states
        setShowPolicyAnimation(true);
        setTimeout(() => setShowLoadingAnimation(false), 400);
        return;
      }
      
      // Extract the JSON part from the response
      const fullResponse = data.policy;
      if (!fullResponse) {
        throw new Error("No policy data received from server");
      }
      
      const jsonStartIndex = fullResponse.indexOf("{");
      const jsonEndIndex = fullResponse.lastIndexOf("}") + 1;

      if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
        // Extract the potential JSON string
        const jsonStr = fullResponse.substring(jsonStartIndex, jsonEndIndex);
        try {
          // Try to parse it to validate it's actually JSON
          const parsedJson = JSON.parse(jsonStr);
          // If successful, set the policy and chat response
          const formattedJson = JSON.stringify(parsedJson, null, 2);
          setPolicy(formattedJson);
          setOriginalPolicy(formattedJson); // Store original policy
          setPolicyApplied(false); // Reset applied status for new policy
          setPolicyGenerated(true); // Mark policy as successfully generated
          // Set chat response from the API response if it exists
          if (data.chat_response) {
            setChatResponse(data.chat_response);
          } else {
            // No chat response in API response, try to extract from policy as fallback
            let chatText = fullResponse.substring(0, jsonStartIndex).trim();
            
            // Clean up markdown code blocks from the chat response
            chatText = chatText.replace(/```json/g, "").replace(/```/g, "").trim();
            
            setChatResponse(chatText || ""); // Set empty string if no chat text
          }
        } catch (e) {
          // If JSON parsing fails, check if we have a chat_response directly
          if (data.chat_response) {
            setChatResponse(data.chat_response);
          } else {
            // Clean up any markdown code blocks as fallback
            const cleanedResponse = fullResponse.replace(/```json/g, "").replace(/```/g, "").trim();
            setChatResponse(cleanedResponse);
          }
          setPolicy("");
          setPolicyGenerationFailed(true); // Mark policy generation as failed
        }
      } else {
        // No JSON-like structure found, check if we have a chat_response directly
        if (data.chat_response) {
          setChatResponse(data.chat_response);
        } else {
          // Clean up any markdown code blocks as fallback
          const cleanedResponse = fullResponse.replace(/```json/g, "").replace(/```/g, "").trim();
          setChatResponse(cleanedResponse);
        }
        setPolicy("");
        setPolicyGenerationFailed(true); // Mark policy generation as failed
      }
      
      // Show policy animation and reset loading states
      setShowPolicyAnimation(true);
      
      // After animation completes, reset the loading state
      setTimeout(() => {
        setShowLoadingAnimation(false);
      }, 400); // Shorter delay for a smoother transition
      
    } catch (error) {
      console.error("Error generating policy:", error);
      setError("Failed to generate policy. Please try again.");
      setPolicyGenerationFailed(true);
      
      // After animation completes, reset the loading state
      setTimeout(() => {
        setShowLoadingAnimation(false);
      }, 400); // Shorter delay for a smoother transition
    } finally {
      setLoading(false);
      // Reset animation flags after everything is done
      setTimeout(() => {
        setShowPolicyAnimation(false);
      }, 600); // Wait for animations to complete
    }
  };

  /**
   * Copies the current policy to the clipboard
   */
  const handleCopy = () => {
    navigator.clipboard.writeText(policy);
    setPolicyCopied(true);
    // Hold 'Copied' state for 3000ms (0.5s fade-out + 0.5s fade-in, then 2s visible)
    setTimeout(() => {
      setPolicyCopied(false);
    }, 3000);
  };

  const handlePolicyChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setPolicy(newValue);
    // If policy is changed, it's no longer applied
    if (newValue !== originalPolicy) {
      setPolicyApplied(false);
      setPolicyCopied(false);
    }
  }, [originalPolicy]);
  
  // Reset form for a new policy generation
  const handleReset = () => {
    setPrompt("");
    setPolicyGenerated(false);
    setPolicyGenerationFailed(false);
    setPolicy("");
    setChatResponse("");
    setPreviousPrompt("");
    setError("");
    setPolicyCopied(false);
  };

  /**
   * Validates if a string is valid JSON
   */
  const isJsonString = (str: string): boolean => {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  };

  /**
   * Handles applying the current policy to the selected project
   * Sends the policy to the backend API with auth token and project ID
   */
  const handleApplyPolicy = async () => {
    if (!token) {
      setError("You must be signed in to apply policies");
      return;
    }
    
    if (!selectedProject) {
      setError("You must select a project before applying a policy");
      return;
    }
    
    try {
      // Set apply loading state for the button animation
      setApplyLoading(true);
      setError(""); // Clear any previous errors
      console.log("Applying policy:", policy);
      
      // Make sure we're sending properly formatted JSON
      let policyToSend = policy;
      try {
        // If policy is already a string representation of JSON, parse and validate it
        const parsed = JSON.parse(policy);
        // Ensure we have bindings
        if (!parsed.bindings) {
          // If we don't have bindings, wrap it properly
          policyToSend = JSON.stringify({ bindings: [] });
        }
      } catch (e) {
        console.error("Policy is not valid JSON:", e);
        setError("Policy is not valid JSON. Cannot apply.");
        setApplyLoading(false);
        return;
      }
      
      const response = await fetch("http://localhost:8000/apply_policy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "project-id": selectedProject,
        },
        body: JSON.stringify({ policy: policyToSend }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        const errorDetail = errorData.detail || "Failed to apply policy";
        console.error("API error details:", errorData);
        throw new Error(errorDetail);
      }
      
      const data = await response.json();
      console.log("Policy applied:", data);
      
      // Update state to show success
      setPolicyApplied(true);
      setOriginalPolicy(policy); // Update original policy to mark current as applied
    } catch (error) {
      console.error("Error applying policy:", error);

      // If it's an error from the API we have to parse it
      if (error instanceof Error) {
        // Remove any quotes and angle brackets from the error message
        const cleanedMessage = error.message.replace(/["<>]/g, '');
        setError(cleanedMessage);
      } else {
        setError("Unknown error applying policy");
      }
      
      // When error occurs, make sure we're back to normal state
      setPolicyApplied(false);
    } finally {
      // Short delay before resetting loading state for button animation to complete
      setTimeout(() => {
        setApplyLoading(false);
      }, 300);
    }
  };

  return (
    <div>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        {/* HEADER SECTION */}
        <Header
          token={token}
          userName={userName}
          userPicture={userPicture}
          handleSignOut={handleSignOut}
          handleGoogleSuccess={handleGoogleSuccess}>
        </Header>

        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-full max-w-2xl shadow-lg mx-auto text-center px-6 py-[5%]">
            {/* Project Selector Section */}
            <ProjectSelector
              token={token}
              projects={projects}
              selectedProject={selectedProject}
              setSelectedProject={setSelectedProject}
              fetchingProjects={fetchingProjects}
              projectError={projectError}
              >
            </ProjectSelector>

            {/* Prompt Input Card */}
            <PromptContainer
              prompt={prompt}
              setPrompt={setPrompt}
              handleSubmit={handleSubmit}
              loading={loading}
              showLoadingAnimation={showLoadingAnimation}
              emptyPromptShake={emptyPromptShake}
              policyGenerated={policyGenerated}
              policyGenerationFailed={policyGenerationFailed}
              handleReset={handleReset}
              setPolicyGenerated={setPolicyGenerated}
              setPolicyGenerationFailed={setPolicyGenerationFailed}
              setEmptyPromptShake={setEmptyPromptShake}
              error={error}
            ></PromptContainer>

            {/* Response Container */}
            <ResponseContainer
              policy={policy}
              previousPrompt={previousPrompt}
              chatResponse={chatResponse}
              showPolicyAnimation={showPolicyAnimation}
              policyApplied={policyApplied}
              applyLoading={applyLoading}
              loading={loading}
              token={token}
              selectedProject={selectedProject}
              handleApplyPolicy={handleApplyPolicy}
              handleCopy={handleCopy}
              policyCopied={policyCopied}
              handlePolicyChange={handlePolicyChange}
              isJsonString={isJsonString}
            >
            </ResponseContainer>
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}

export default App;