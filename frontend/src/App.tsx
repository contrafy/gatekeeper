import "./App.css";
import React, { FormEvent, useEffect, useState, useCallback } from "react";
import { jwtDecode } from "jwt-decode";
//------------ Shadcn Imports ------------
import { Button } from "@/components/ui/button";
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
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
//------------ Lucide Icon Imports ------------
import { 
  Shield, 
  Sparkles, 
  Copy, 
  Rocket, 
  CheckCircle, 
  AlertTriangle,
  Loader2,
  RefreshCw,
  PartyPopper
} from "lucide-react";
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
import TextareaAutosize from "react-textarea-autosize";


// Google OAuth client ID from environment variables
const CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;

const MotionDiv = motion.div;
const MotionButton = motion(Button);
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
          ...(selectedProject && { "project-id": selectedProject }),
          ...(token && { Authorization: `Bearer ${token}` })
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
      toast("Policy applied successfully!")
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
        <header className="fixed top-0 w-full mb-5 border-b bg-white dark:bg-black">
          <div className="flex items-center justify-between w-full px-7.5 py-2">
            {/* Left side: Title with shield icon */}
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-[#4285F4]" />
              <div className="font-semibold text-[#202124] dark:text-white text-base">
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
                          <DropdownMenuLabel className="text-[#4285F4]">
                            Signed in as {userName}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              className="cursor-pointer hover:bg-[#DB4437]/10 text-[#DB4437]"
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
                      <div className="google-login-container dark:bg-gray-800 dark:border dark:border-gray-700 dark:rounded-full">
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
                      </div>
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
                    <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                      Loading projects...
                    </div>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="secondary"
                          className="custom-green-hover"
                        >
                          {selectedProject && projects.length > 0
                            ? projects.find((p) => p.id === selectedProject)?.name || "Select Project"
                            : projects.length > 0 ? "Select Project" : "No Projects Found"}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel className="text-[#4285F4]">Select a Project</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {projects.length > 0 ? (
                          projects.map((project) => (
                            <DropdownMenuItem
                              key={project.id}
                              onClick={() => setSelectedProject(project.id)}
                              className="hover:bg-[#4285F4]/10 hover:text-[#4285F4]"
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
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                  Please sign in with Google to select a project.
                </div>
              )}
            </div>

            {/* Project Error Alert */}
            {projectError && (
              <Alert variant="destructive" className="mb-4 border-[#DB4437]">
                <AlertDescription className="flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-2 text-[#DB4437]" />
                  {projectError}
                </AlertDescription>
              </Alert>
            )}

            {/* Prompt Input Card */}
            <Card className="text-left space-y-4">
              <CardContent>
                <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
                  <div className={emptyPromptShake ? "shake-animation" : ""}>
                    <TextareaAutosize
                      placeholder="Describe your IAM policy requirements in plain English..."
                      value={prompt}
                      onChange={(e) => {
                        setPrompt(e.target.value);
                        // Reset the generation states when user starts typing
                      if (policyGenerated || policyGenerationFailed) {
                        setPolicyGenerated(false);
                        setPolicyGenerationFailed(false);
                      }
                    }}
                    onFocus={() => {
                      // Reset the generation states when user focuses on input
                      if (policyGenerated || policyGenerationFailed) {
                        setPolicyGenerated(false);
                        setPolicyGenerationFailed(false);
                      }
                    }}
                    minRows={1}
                    maxRows={5}
                    className="prompt-input"
                    style={{ borderColor: "#4285F4" }}
                    />
                  </div>
                  <div className="flex items-center justify-center" style={{ minHeight: '60px' }}>
                    {/* Generating Policy Animation */}
                    {showLoadingAnimation ? (
                      <motion.div 
                        className="loading-container"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.6, ease: "easeInOut" }}
                      >
                        <div className="loading-text">Generating Policy</div>
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-5 w-5 text-[#4285F4] loading-spinner" />
                          <div className="loading-circles">
                            <div className="loading-circle loading-circle-1"></div>
                            <div className="loading-circle loading-circle-2"></div>
                            <div className="loading-circle loading-circle-3"></div>
                            <div className="loading-circle loading-circle-4"></div>
                          </div>
                        </div>
                      </motion.div>
                    ) : policyGenerated ? (
                      // Policy generated successfully
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className="flex items-center justify-center px-4 py-2 rounded-md text-[#0F9D58] border border-[#0F9D58] bg-[#0F9D58]/10 cursor-not-allowed"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Policy Generated
                      </motion.div>
                    ) : policyGenerationFailed ? (
                      // Policy generation failed
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className="flex flex-col items-center gap-2"
                      >
                        <div className="text-sm text-[#DB4437] mb-1">
                          There was an issue with your prompt. Please review the chat response and try again.
                        </div>
                        <Button 
                          variant="outline"
                          onClick={handleReset}
                          className="text-[#DB4437] border-[#DB4437] bg-[#DB4437]/10 hover:bg-[#DB4437]/20 hover:text-[#DB4437]"
                        >
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          Try Again
                        </Button>
                      </motion.div>
                    ) : (
                      // Default button to generate policy
                      <Button 
                        variant="secondary" 
                        type="submit" 
                        disabled={loading}
                        className={loading ? "bg-[#F4B400] text-black hover:bg-[#E5A800]" : "custom-blue-hover"}
                      >
                        {loading && !showLoadingAnimation ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />{" "}
                            Processing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />{" "}
                            Generate Policy
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Error Alert */}
            {error && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <Alert variant="destructive" className="mt-4 mb-2 border-[#DB4437]">
                    <AlertDescription className="flex items-center">
                      <AlertTriangle className="h-4 w-4 mr-2 text-[#DB4437]" />
                      {error}
                    </AlertDescription>
                  </Alert>
                </motion.div>
              </AnimatePresence>
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
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ 
                    duration: 0.6, 
                    ease: [0.22, 1, 0.36, 1], 
                    delay: showPolicyAnimation ? 0.1 : 0 
                  }}
                >
                <Card className="mb-4 policy-output">
                  <CardHeader className="output-header pb-2">
                    <CardTitle className="font-semibold text-[#0F9D58]">Generated Policy</CardTitle>
                    {/* container animates layout changes (spring by default) */}
                    <MotionDiv layout className="flex space-x-2">
                      {/* Apply Policy Button - conditionally rendered and styled */}
                      {policy && token && selectedProject && (
                        <MotionButton 
                          layout
                          variant={"secondary"}
                          onClick={handleApplyPolicy} 
                          disabled={loading || applyLoading || !token || !selectedProject || policyApplied}
                          className={policyApplied ? 
                            "text-[#0F9D58] dark:text-[#0F9D58]"
                            : "custom-red-hover disabled:bg-[#DB4437]/25"}
                        >
                          <AnimatePresence mode="popLayout">
                            {applyLoading ? (
                              <motion.span
                                key="verifying"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0, ease: "easeInOut" }}
                                className="flex items-center"
                              >
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Verifying
                              </motion.span>
                            ) : policyApplied ? (
                              <motion.span
                                key="applied"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0, ease: "easeInOut" }}
                                className="flex items-center"
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Policy Applied
                              </motion.span>
                            ) : (
                              <motion.span
                                key="apply"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0, ease: "easeInOut" }}
                                className="flex items-center"
                              >
                                <Rocket className="h-4 w-4 mr-2" />
                                Apply Policy
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </MotionButton>
                      )}
                      {/* Copy button: static container, inner content cross-fades */}
                      <MotionButton
                        layout
                        variant="secondary"
                        onClick={handleCopy}
                        disabled={loading || policyCopied}
                        className="custom-orange-hover"
                      >
                        <AnimatePresence mode="popLayout">
                          {policyCopied ? (
                            <motion.span
                              key="copied"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0, ease: "easeInOut" }}
                              className="flex items-center"
                            >
                              <PartyPopper className="h-4 w-4 mr-2" />
                              Copied!
                            </motion.span>
                          ) : (
                            <motion.span
                              key="copy"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0, ease: "easeInOut" }}
                              className="flex items-center"
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Policy
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </MotionButton>
                    </MotionDiv>
                  </CardHeader>
                  <CardContent>
                  <div className="rounded-md border">
                    {isJsonString(policy) ? (
                      <TextareaAutosize
                        ref={policyTextareaRef}
                        className="policy-textbox w-full font-mono"
                        value={policy}
                        onChange={handlePolicyChange}
                        minRows={4}
                        maxRows={20}
                        spellCheck={false}
                        style={{ borderColor: "#4285F4", resize: "none", padding: "0.5rem" }}
                      />
                    ) : (
                      <pre className="policy-pre">{policy}</pre>
                    )}
                  </div>
                </CardContent>
                </Card>
                </motion.div>
              )}

              {/* Chat Response Card */}
              {chatResponse && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ 
                    duration: 0.6, 
                    ease: [0.22, 1, 0.36, 1], 
                    delay: showPolicyAnimation ? 0.3 : 0 
                  }}
                >
                  <Card className="chat-output">
                    <CardHeader className="output-header pb-2">
                      <CardTitle className="font-semibold text-[#4285F4]">Chat Response</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-60">
                        <pre className="chat-pre" style={{ borderColor: "#4285F4" }}>{chatResponse}</pre>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}

export default App;