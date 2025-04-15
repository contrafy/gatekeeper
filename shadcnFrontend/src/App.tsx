import "./App.css";
import React, { FormEvent, useEffect, useState, useCallback } from "react";
import { jwtDecode } from "jwt-decode";
//------------ Shadcn Imports ------------
import { Button } from "@/components/ui/button";
import { Textarea } from "./components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
//------------------------
import {
  CredentialResponse,
  GoogleLogin,
  GoogleOAuthProvider,
  googleLogout,
} from "@react-oauth/google";
import { ThemeProvider } from "./components/theme-provider";
import { ModeToggle } from "./components/mode-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Google OAuth client ID from environment variables
const CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;

function App() {
  const policyTextareaRef = React.useRef<HTMLTextAreaElement>(null);

  // User input and API response states
  const [prompt, setPrompt] = useState(""); // Current user prompt input
  const [previousPrompt, setPreviousPrompt] = useState(""); // Stores the last submitted prompt
  const [policy, setPolicy] = useState(""); // Generated IAM policy JSON
  const [originalPolicy, setOriginalPolicy] = useState(""); // Original policy for comparison with edits
  const [chatResponse, setChatResponse] = useState(""); // Text response from the API
  const [error, setError] = useState(""); // Error messages
  const [loading, setLoading] = useState(false); // Loading state for API calls
  const [policyApplied, setPolicyApplied] = useState(false); // Tracks if policy has been applied to project

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
    setPreviousPrompt(prompt);
    setPrompt("");
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
          const formattedJson = JSON.stringify(parsedJson, null, 2);
          setPolicy(formattedJson);
          setOriginalPolicy(formattedJson); // Store original policy
          setPolicyApplied(false); // Reset applied status for new policy
          // Get any text before the JSON as chat response
          let chatText = fullResponse.substring(0, jsonStartIndex).trim();
          
          // Clean up markdown code blocks from the chat response
          chatText = chatText.replace(/```json/g, "").replace(/```/g, "").trim();
          
          setChatResponse(chatText || ""); // Set empty string if no chat text
        } catch (e) {
          // If JSON parsing fails, treat everything as chat
          // Clean up any markdown code blocks
          const cleanedResponse = fullResponse.replace(/```json/g, "").replace(/```/g, "").trim();
          setChatResponse(cleanedResponse);
          setPolicy("");
        }
      } else {
        // No JSON-like structure found, treat as chat
        // Clean up any markdown code blocks
        const cleanedResponse = fullResponse.replace(/```json/g, "").replace(/```/g, "").trim();
        setChatResponse(cleanedResponse);
        setPolicy("");
      }
    } catch (error) {
      console.error("Error generating policy:", error);
      setError("Failed to generate policy. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Copies the current policy to the clipboard
   */
  const handleCopy = () => {
    navigator.clipboard.writeText(policy);
  };

  // Then in your component, create a memoized onChange handler
  const handlePolicyChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setPolicy(newValue);
    // If policy is changed, it's no longer applied
    if (newValue !== originalPolicy) {
      setPolicyApplied(false);
    }
  }, [originalPolicy]);

  /**
   * Memoized textarea component to prevent focus loss during re-renders
   * Used specifically for the JSON policy editing
   */
  const JsonTextarea = React.memo(
    ({ text, onChange }: { text: string; onChange: (value: string) => void }) => {
      const textareaRef = React.useRef<HTMLTextAreaElement>(null);
      
      const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
      };
      
      // Use useEffect to restore focus after render if the element had focus before
      useEffect(() => {
        // Check if the textarea had focus before the update
        const hasFocus = document.activeElement === textareaRef.current;
        
        // If it had focus, restore it after rendering
        if (hasFocus && textareaRef.current) {
          const cursorPosition = textareaRef.current.selectionStart;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
        }
      });
      
      return (
        <Textarea
          ref={textareaRef}
          className="policy-textbox w-full h-full font-mono"
          value={text}
          onChange={handleChange}
          rows={10}
          spellCheck={false}
        />
      );
    }
  );

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
      setLoading(true);
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
        setLoading(false);
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
      setChatResponse("Policy successfully applied to project!");
      setPolicyApplied(true);
      setOriginalPolicy(policy); // Update original policy to mark current as applied
    } catch (error) {
      console.error("Error applying policy:", error);

      // If it's an error from the API we have to parse it
      // this is half-assed
      if (error instanceof Error) {
        // Remove any quotes and angle brackets from the error message
        const cleanedMessage = error.message.replace(/["<>]/g, '');
        setError(cleanedMessage);
      } else {
        setError("Unknown error applying policy");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        {/* HEADER SECTION */}
        <header className="fixed top-0 w-full mb-5 border-b bg-black">
          <div className="flex items-center justify-between w-full px-7.5 py-2">
            {/* Left side: Title with shield icon */}
            <div className="flex items-center space-x-2">
              <span role="img" aria-label="shield" className="text-xl">
                🛡️
              </span>
              <div className=" font-semibold text-white text-base">
                Google Cloud IAM Policy Generator
              </div>
            </div>
            {/* Right side: Theme toggle and user authentication */}
            <div className="flex items-center space-x-4">
              <ModeToggle></ModeToggle>
              <GoogleOAuthProvider clientId={CLIENT_ID}>
                <div>
                  <div className="w-fit mx-auto">
                    {token ? (
                      // Show user avatar and dropdown when signed in
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Avatar className="cursor-pointer">
                            <AvatarImage src={userPicture} alt="Profile" />
                            <AvatarFallback>Me</AvatarFallback>
                          </Avatar>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuLabel>
                            {" "}
                            Signed in as {userName}{" "}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              className="cursor-pointer hover:bg-gray-200"
                              onClick={() => {
                                handleSignOut();
                              }}
                            >
                              Sign Out
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      // Show Google login button when not signed in
                      <GoogleLogin
                        shape="circle"
                        onSuccess={(credentialResponse) => {
                          console.debug("oauth success:", credentialResponse);
                          handleGoogleSuccess(credentialResponse);
                          if (credentialResponse.credential) {
                            setToken(credentialResponse.credential);
                          }
                        }}
                        onError={() => console.error("login failed")}
                      />
                    )}
                  </div>
                </div>
              </GoogleOAuthProvider>
            </div>
          </div>
        </header>

        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-full max-w-2xl shadow-lg mx-auto text-center px-6 py-[5%]">
            {/* Project Selector Section */}
            <div className="flex justify-end mb-4">
              {token ? (
                // Show project selector if signed in
                <>
                  {fetchingProjects ? (
                    <div className="bg-gray-100 border border-gray-300 rounded-md px-4 py-2 text-sm text-gray-700">
                      Loading projects...
                    </div>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="secondary">
                          {selectedProject && projects.length > 0
                            ? projects.find((p) => p.id === selectedProject)?.name || "Select Project"
                            : projects.length > 0 ? "Select Project" : "No Projects Found"}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Select a Project</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {projects.length > 0 ? (
                          projects.map((project) => (
                            <DropdownMenuItem
                              key={project.id}
                              onClick={() => setSelectedProject(project.id)}
                            >
                              {project.name}
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <DropdownMenuItem disabled>No projects available</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              ) : (
                // Show sign-in prompt when not authenticated
                <div className="bg-gray-100 border border-gray-300 rounded-md px-4 py-2 text-sm text-gray-700">
                  Please sign in with Google to select a project.
                </div>
              )}
            </div>

            {/* Project Error Alert */}
            {projectError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  {projectError}
                </AlertDescription>
              </Alert>
            )}

            {/* Prompt Input Card */}
            <Card className="text-left">
              <CardHeader>
                <CardTitle>Enter prompt</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit}>
                  <Textarea
                    placeholder="Describe your IAM policy requirements in plain English..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={6}
                    className="prompt-input"
                  />
                  <div className="py-2.5 flex justify-center">
                    <Button variant="dark" type="submit" disabled={loading}>
                      {loading ? (
                        <>
                          <span role="img" aria-label="loading">
                            ⚡
                          </span>{" "}
                          Generating...
                        </>
                      ) : (
                        <>
                          <span role="img" aria-label="generate">
                            ✨
                          </span>{" "}
                          Generate Policy
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive" className="mt-4 mb-2">
                <AlertDescription className="flex items-center">
                  <span role="img" aria-label="error" className="mr-2">
                    ⚠️
                  </span>
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {/* Response Container */}
            <div className="response-container h-auto">
              {/* Display previous prompt for context */}
              {previousPrompt && (
                <div className="mb-2 text-left">
                  <strong>Prompt:</strong> {previousPrompt}
                </div>
              )}

              {/* Generated Policy Card */}
              {policy && (
                <Card className="mb-4 policy-output">
                  <CardHeader className="output-header pb-2">
                    <CardTitle>Generated Policy</CardTitle>
                    <div className="flex space-x-2">
                      {/* Apply Policy Button - conditionally rendered and styled */}
                      {policy && token && selectedProject && (
                        <Button 
                          variant={policyApplied ? "outline" : "secondary"}
                          onClick={handleApplyPolicy} 
                          disabled={loading || !token || !selectedProject || policyApplied}
                          className={policyApplied ? "text-green-600 border-green-600 bg-green-100/10 hover:bg-green-100/20 hover:text-green-600" : ""}
                        >
                          <span role="img" aria-label={policyApplied ? "applied" : "apply"} className="mr-2">
                            {policyApplied ? "✅" : "🚀"}
                          </span>
                          {policyApplied ? "Policy Applied" : "Apply Policy"}
                        </Button>
                      )}
                      {/* Copy Button */}
                      <Button variant="secondary" onClick={handleCopy}>
                        <span role="img" aria-label="copy" className="mr-2">
                          📋
                        </span>
                        Copy
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                  <div className="rounded-md border">
                    {isJsonString(policy) ? (
                      <Textarea
                        ref={policyTextareaRef}
                        className="policy-textbox w-full h-full font-mono"
                        value={policy}
                        onChange={handlePolicyChange}
                        rows={10}
                        spellCheck={false}
                      />
                    ) : (
                      <pre className="policy-pre">{policy}</pre>
                    )}
                  </div>
                </CardContent>
                </Card>
              )}

              {/* Chat Response Card */}
              {chatResponse && (
                <Card className="chat-output">
                  <CardHeader className="output-header pb-2">
                    <CardTitle>Chat Response</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-60">
                      <pre className="chat-pre">{chatResponse}</pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}

export default App;